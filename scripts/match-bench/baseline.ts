/**
 * Frozen copy of the matchers as of d394229 (before the matching rework), so the
 * bench can compare old and new on the same cases. Don't edit — it's the yardstick.
 */

const isUnknownTitle = (title: string | null | undefined) => !title || title.startsWith('Unknown item (');

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

export function rankByTitle<T extends { title: string | null }>(candidates: T[], productTitle: string | null) {
  const target = productTitle && !isUnknownTitle(productTitle) ? normalizeTitle(productTitle) : null;
  const scored = candidates.map((item) => ({
    item,
    score: target && item.title && !isUnknownTitle(item.title) ? jaccardSimilarity(target, normalizeTitle(item.title)) : 0,
  }));
  return scored.sort((a, b) => b.score - a.score);
}

/** LinkUpcSheet's guess for a looked-up product name (SUGGEST_THRESHOLD 0.25). */
export function guessTitleMatch<T extends { title: string | null }>(items: T[], productName: string | null) {
  if (!productName) return null;
  const byTitle = rankByTitle(items, productName);
  const [best, second] = byTitle;
  if (!best || best.score < 0.25) return null;
  const lookalikes = byTitle.filter((r) => r !== best && r.score >= best.score - 0.1).length;
  return { item: best.item, sure: best.score >= 0.5 && best.score - (second?.score ?? 0) >= 0.15, lookalikes };
}

function titleWords(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
}

function stickerScore(stickerText: string, title: string | null): { score: number; hits: number } {
  const words = [...new Set(titleWords(stickerText))];
  if (!title || isUnknownTitle(title) || words.length === 0) return { score: 0, hits: 0 };
  const inTitle = titleWords(title);
  const hits = words.filter((w) => inTitle.some((t) => wordMatches(w, t))).length;
  return { score: hits / words.length, hits };
}

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

function wordMatches(stickerWord: string, titleWord: string): boolean {
  if (titleWord.startsWith(stickerWord)) return true;
  if (stickerWord.length < 5) return false;
  const allowed = stickerWord.length >= 8 ? 2 : 1;
  return editDistance(stickerWord, titleWord.slice(0, stickerWord.length)) <= allowed;
}

export function rankBySticker<T extends { title: string | null }>(candidates: T[], stickerText: string | null) {
  const scored = candidates.map((item) => ({ item, ...(stickerText ? stickerScore(stickerText, item.title) : { score: 0, hits: 0 }) }));
  return scored.sort((a, b) => b.hits - a.hits || b.score - a.score);
}

function distinctHits(stickerText: string, title: string | null, other: string | null): number {
  if (!title) return 0;
  const inTitle = titleWords(title);
  const inOther = other ? titleWords(other) : [];
  return [...new Set(titleWords(stickerText))].filter(
    (w) => inTitle.some((t) => wordMatches(w, t)) && !inOther.some((t) => wordMatches(w, t))
  ).length;
}

export function guessStickerMatch<T extends { title: string | null }>(candidates: T[], stickerText: string | null) {
  if (!stickerText) return null;
  const ranked = rankBySticker(candidates, stickerText);
  const [best, second] = ranked;
  if (!best || best.hits < 2) return null;
  const runnerUp = second ?? { score: 0, hits: 0, item: null };
  const clean = best.hits >= 3 && best.score >= 0.5 && best.hits > runnerUp.hits && best.score - runnerUp.score >= 0.2 - 1e-9;
  const noisy = best.hits >= 4 && best.hits - runnerUp.hits >= 3;
  const distinct = distinctHits(stickerText, best.item.title, runnerUp.item?.title ?? null);
  const lookalikes = ranked.filter((r) => r !== best && r.hits >= 2 && r.hits >= best.hits - 1).length;
  return { item: best.item, sure: (clean || noisy) && distinct >= 2, lookalikes };
}
