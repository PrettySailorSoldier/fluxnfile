/**
 * Matching a box to an order by name, for when no code on the box is on the list.
 *
 * Two kinds of name come in:
 *  - words read off an X00 sticker: the start of the Amazon title (often "…" and
 *    its end), cut off mid-word, with OCR slips ("protegtio"), words run together
 *    and stray words printed on the box;
 *  - a UPC lookup's product name: brand + a few words, worded a little differently
 *    ("Light" vs "Lights", "4pk" vs "4 Pack").
 *
 * Both are scored the same way against every order title:
 *  - a word counts by how rare it is on the list: a brand or "lights" says little,
 *    "tankless" or "18kw" says a lot. Words in no title at all (print on the box)
 *    are ignored rather than dragging every score down;
 *  - words found in the title's own order count extra, more so side by side, and
 *    so does matching the title's first words — a label prints the title from its start.
 */
import { isUnknownTitle } from '@/lib/productLookup';

export interface NameMatch<T> {
  item: T;
  /** Points: rarity-weighted words matched, plus order bonuses. Only comparable within one ranking. */
  score: number;
  /** Words matched (a misread or cut-off word counts if it's close enough) */
  hits: number;
  /** Share of the readable words this title accounts for, 0–1 */
  share: number;
  /** Share of the matched words that read in the title's own order, 0–1 */
  inOrder: number;
}

export interface NameGuess<T> {
  item: T;
  /**
   * The name clearly points at this item. Even then it's only a guess —
   * it's shown for checking, never received without the user confirming.
   */
  sure: boolean;
  /** Other items that match nearly as well (same brand, similar names) */
  lookalikes: number;
}

type Mode = 'sticker' | 'name';

const STOP = new Set(['for', 'and', 'with', 'the', 'of', 'to', 'in', 'on', 'by', 'an', 'or', 'at', 'from']);

/** Same spelling for sizes and pack counts on both sides: "4-Pack", "4 pk", "Pack of 4" → "4pack". */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/(\d)\.(\d)/g, '$1$2')
    .replace(/\b(?:pack|set) of (\d+)\b/g, '$1pack')
    .replace(/(\d+)\s*-?\s*(?:packs?|pk|pcs?|pieces?|count|ct)\b/g, '$1pack')
    .replace(/(\d+)\s*-?\s*(?:feet|foot|ft)\b/g, '$1ft')
    .replace(/(\d+)\s*(?:-?\s*(?:inch(?:es)?)\b|")/g, '$1in')
    .replace(/(\d+)\s*-?\s*(?:fl\.?\s*)?(?:oz|ounces?)\b/g, '$1oz')
    .replace(/(\d+)\s*-?\s*(?:watts?)\b/g, '$1w')
    .replace(/(\d+)\s*-?\s*(?:gallons?|gal)\b/g, '$1gal')
    .replace(/(\d+)\s*-?\s*(?:liters?|litres?)\b/g, '$1l')
    .replace(/(\d+)\s*-?\s*(?:quarts?|qt)\b/g, '$1qt');
}

/** "lights" → "light"; leaves "glass", "bus" alone. */
function stem(w: string): string {
  return w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') ? w.slice(0, -1) : w;
}

/** Letters OCR mixes up, folded the same way on both sides: "protecti0n" → "protection", "vvhite" → "white". */
function ocrFold(w: string): string {
  let out = w.replace(/rn/g, 'm').replace(/vv/g, 'w');
  if (/[a-z]/.test(out) && /\d/.test(out)) out = out.replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's');
  return out;
}

function tokens(s: string): string[] {
  return normalizeText(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => (w.length >= 2 || /\d/.test(w)) && !STOP.has(w))
    .map(stem);
}

interface TitleWords {
  words: string[];
  /** OCR-folded, for sticker reads */
  folded: string[];
}

const titleCache = new Map<string, TitleWords>();

function titleWords(title: string): TitleWords {
  let t = titleCache.get(title);
  if (!t) {
    if (titleCache.size > 50_000) titleCache.clear();
    const words = tokens(title);
    t = { words, folded: words.map(ocrFold) };
    titleCache.set(title, t);
  }
  return t;
}

/** Edit distance, for OCR slips like "protegtio" → "protection". */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** Misreads allowed for a sticker word of this length */
const allowedSlips = (n: number) => (n >= 9 ? 3 : n >= 6 ? 2 : n >= 4 ? 1 : 0);

/**
 * How well a read word stands for a title word, 0–1. A sticker word may be cut
 * off at either end ("clot" → "cloth", "ghting" → "lighting") or misread a
 * letter or two; a looked-up name only differs by plurals and unit spellings,
 * which tokens() already evens out.
 */
function wordCredit(q: string, t: string, mode: Mode): number {
  if (q === t) return 1;
  if (mode === 'name') return 0;
  if (q.length >= 3 && t.startsWith(q)) return q.length >= 4 ? 1 : 0.8;
  if (q.length >= 4 && t.endsWith(q)) return 0.8;
  const allowed = allowedSlips(q.length);
  if (!allowed || Math.abs(t.length - q.length) > allowed + 6) return 0;
  const d = Math.min(editDistance(q, t), t.length > q.length ? editDistance(q, t.slice(0, q.length)) : Infinity);
  if (d > allowed) return 0;
  return d === 1 ? 0.75 : d === 2 ? 0.55 : 0.4;
}

/** Credit of a run-together sticker word ("tanklesswater") against adjacent title words. */
function joinedCredit(q: string, folded: string[]): { credit: number; pos: number } {
  let best = { credit: 0, pos: -1 };
  for (let i = 0; i + 1 < folded.length; i++) {
    const joined = folded[i] + folded[i + 1] + (folded[i + 2] ?? '');
    const head = joined.slice(0, q.length);
    if (head.length < q.length - 1) continue;
    const d = editDistance(q, head);
    if (d <= allowedSlips(q.length)) {
      const credit = d === 0 ? 0.9 : d === 1 ? 0.7 : 0.5;
      if (credit > best.credit) best = { credit, pos: i };
    }
  }
  return best;
}

/** Weight of a sticker word found in no title (often an OCR mess) — about that of a word in 2% of them */
const UNKNOWN_STICKER_WORD = 4;
/** Model numbers and filler that UPC databases add to a name ("HX-6587", "New") */
const MODEL_CODE = /\d|^(?:new|model|brand)$/;

interface Hit {
  /** index of the read word */
  q: number;
  pos: number;
  w: number;
}

/** Heaviest chain of hits in both reading order and title order; side-by-side pairs earn extra. */
function orderedWeight(hits: Hit[]): number {
  const best = hits.map((h) => h.w);
  for (let i = 0; i < hits.length; i++)
    for (let j = 0; j < i; j++) {
      const a = hits[j];
      const b = hits[i];
      if (a.q < b.q && a.pos < b.pos) {
        const adjacent = b.pos - a.pos === 1 ? 0.5 * Math.min(a.w, b.w) : 0;
        best[i] = Math.max(best[i], best[j] + b.w + adjacent);
      }
    }
  return best.length ? Math.max(...best) : 0;
}

function rankByName<T extends { title: string | null }>(candidates: T[], text: string | null, mode: Mode): NameMatch<T>[] {
  const query = text ? [...new Set(tokens(text).map((w) => (mode === 'sticker' ? ocrFold(w) : w)))] : [];
  const usable = candidates.map((item) => (item.title && !isUnknownTitle(item.title) ? titleWords(item.title) : null));
  if (query.length === 0) return candidates.map((item) => ({ item, score: 0, hits: 0, share: 0, inOrder: 0 }));

  // Credit of each read word against each distinct title word, worked out once
  const vocab = new Set<string>();
  for (const t of usable) if (t) for (const w of mode === 'sticker' ? t.folded : t.words) vocab.add(w);
  const credits = query.map((q) => {
    const m = new Map<string, number>();
    for (const v of vocab) {
      const c = wordCredit(q, v, mode);
      if (c > 0) m.set(v, c);
    }
    return m;
  });
  // A long sticker word that matches nothing on its own may be two words run together
  const joined = query.map((q, i) => mode === 'sticker' && q.length >= 7 && ![...credits[i].values()].some((c) => c >= 0.75));

  // Per title: each read word's best credit and where it is in the title
  const perTitle = usable.map((t) => {
    if (!t) return null;
    const words = mode === 'sticker' ? t.folded : t.words;
    return query.map((q, qi) => {
      let credit = 0;
      const positions: number[] = [];
      words.forEach((w, pos) => {
        const c = credits[qi].get(w) ?? 0;
        if (c > credit) {
          credit = c;
          positions.length = 0;
        }
        if (c > 0 && c === credit) positions.push(pos);
      });
      if (joined[qi] && credit < 0.75) {
        const j = joinedCredit(q, words);
        if (j.credit > credit) return { credit: j.credit, positions: [j.pos] };
      }
      return { credit, positions };
    });
  });

  // Rarity: a word in a handful of titles tells them apart, one in hundreds doesn't
  const n = Math.max(1, usable.filter(Boolean).length);
  const idf = query.map((_, qi) => {
    const df = perTitle.filter((p) => p && p[qi].credit > 0).length;
    return df ? Math.log(1 + n / df) : 0;
  });
  const total = idf.reduce((s, x) => s + x, 0);

  return candidates
    .map((item, i) => {
      const p = perTitle[i];
      if (!p || total === 0) return { item, score: 0, hits: 0, share: 0, inOrder: 0 };
      let matched = 0;
      let hits = 0;
      const chain: Hit[] = [];
      p.forEach(({ credit, positions }, qi) => {
        if (!credit) return;
        const w = idf[qi] * credit;
        matched += w;
        if (credit >= 0.5) hits++;
        for (const pos of positions.slice(0, 3)) chain.push({ q: qi, pos, w });
      });
      // A word in no title at all says it's another product ("brizled solar FENCE
      // lights" vs. pathway lights). On a sticker, only when it's read in between
      // words this title has — before or after them it's likely print on the box.
      const first = mode === 'name' ? -1 : chain.length ? Math.min(...chain.map((h) => h.q)) : 0;
      const last = mode === 'name' ? query.length : chain.length ? Math.max(...chain.map((h) => h.q)) : 0;
      let against = 0;
      // A looked-up name is clean text, so its unknown word is as telling as the rarest real one
      const unknown = mode === 'name' ? Math.log(1 + n) : UNKNOWN_STICKER_WORD;
      for (let qi = first + 1; qi < last; qi++) if (idf[qi] === 0 && !MODEL_CODE.test(query[qi])) against += unknown;
      const ordered = orderedWeight(chain);
      // The read starts where the title starts
      const firstTwo = [...new Set(chain.map((h) => h.q))].slice(0, 2);
      const start = chain.filter((h) => firstTwo.includes(h.q) && h.pos <= 1).reduce((m, h) => Math.max(m, h.w), 0);
      const score = matched + 0.5 * ordered + 0.5 * start - against;
      return { item, score, hits, share: matched / (total + against), inOrder: matched ? Math.min(1, ordered / matched) : 0 };
    })
    .sort((a, b) => b.score - a.score);
}

/** Rank order-list items by how well their title matches a looked-up product name. Best first. */
export function rankByTitle<T extends { title: string | null }>(candidates: T[], productTitle: string | null): NameMatch<T>[] {
  return rankByName(candidates, productTitle && !isUnknownTitle(productTitle) ? productTitle : null, 'name');
}

/** Rank items by how well they match the words read off an X00 sticker. Best first. */
export function rankBySticker<T extends { title: string | null }>(candidates: T[], stickerText: string | null): NameMatch<T>[] {
  return rankByName(candidates, stickerText, 'sticker');
}

/**
 * "Sure" needs most of the read accounted for (a sticker read carries stray
 * words, a looked-up name shouldn't), in the title's order, and a clear lead
 * over the runner-up.
 */
function guess<T extends { title: string | null }>(ranked: NameMatch<T>[], mode: Mode): NameGuess<T> | null {
  const [best, second] = ranked;
  if (!best || best.hits < 2 || best.share < 0.3) return null;
  // Lead over the runner-up, in rarity-weighted words
  const margin = best.score - Math.max(0, second?.score ?? 0);
  const sure =
    best.share >= (mode === 'name' ? 0.65 : 0.5) && best.inOrder >= 0.7 && margin >= 0.25 * best.score && margin >= 4;
  const lookalikes = ranked.filter((r) => r !== best && r.hits >= 2 && r.score >= 0.75 * best.score).length;
  return { item: best.item, sure, lookalikes };
}

/**
 * The order a looked-up product name points to best. It's "sure" when the name
 * is mostly accounted for by that title and it's well clear of the runner-up.
 */
export function guessTitleMatch<T extends { title: string | null }>(candidates: T[], productTitle: string | null): NameGuess<T> | null {
  return guess(rankByTitle(candidates, productTitle), 'name');
}

/**
 * The item an X00 sticker's printed words point to best. "Sure" needs half the
 * readable words matched and a clear lead over the runner-up in words that only
 * this title has — a brand ("Brizled") matches every order from that brand, so it
 * can't tell a pathway-light 4-pack from a house-number sign.
 */
export function guessStickerMatch<T extends { title: string | null }>(candidates: T[], stickerText: string | null): NameGuess<T> | null {
  return guess(rankBySticker(candidates, stickerText), 'sticker');
}
