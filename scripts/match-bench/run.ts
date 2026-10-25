/**
 * Box → order matching bench: old matchers (baseline.ts) vs the app's current ones.
 *
 *   node scripts/match-bench/bench.mjs [--seed 1] [--size 1500] [--misses 10]
 */
import * as base from './baseline';
import * as current from '@/lib/scanIntake';
import { buildCorpus, type Case, type Order } from './corpus';

interface Guess {
  item: Order;
  sure: boolean;
  lookalikes: number;
}
interface Matcher {
  name: string;
  rankBySticker: (items: Order[], text: string | null) => { item: Order }[];
  guessStickerMatch: (items: Order[], text: string | null) => Guess | null;
  rankByTitle: (items: Order[], title: string | null) => { item: Order }[];
  guessTitleMatch: (items: Order[], title: string | null) => Guess | null;
}

const old: Matcher = { name: 'old', ...base };
const now: Matcher = {
  name: 'new',
  rankBySticker: current.rankBySticker,
  guessStickerMatch: current.guessStickerMatch,
  rankByTitle: current.rankByTitle,
  guessTitleMatch: current.guessTitleMatch,
};

const args = process.argv.slice(2);
const arg = (name: string, dflt: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};

interface Outcome {
  c: Case;
  /** 1-based rank of the right order; 0 when not on the list or not ranked */
  rank: number;
  guessId: string | null;
  guessTitle: string | null;
  sure: boolean;
}

function score(m: Matcher, orders: Order[], cases: Case[]): { outcomes: Outcome[]; ms: number } {
  const started = performance.now();
  const outcomes = cases.map((c) => {
    const guess = (c.kind === 'sticker' ? m.guessStickerMatch : m.guessTitleMatch)(orders, c.input);
    let rank = 0;
    if (c.expectedId) {
      const ranked = (c.kind === 'sticker' ? m.rankBySticker : m.rankByTitle)(orders, c.input);
      rank = ranked.findIndex((r) => r.item.id === c.expectedId) + 1;
    }
    return { c, rank, guessId: guess?.item.id ?? null, guessTitle: guess?.item.title ?? null, sure: !!guess?.sure };
  });
  return { outcomes, ms: performance.now() - started };
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—');

function tally(os: Outcome[]) {
  const pos = os.filter((o) => o.c.expectedId);
  const neg = os.filter((o) => !o.c.expectedId);
  const right = (o: Outcome) => o.guessId === o.c.expectedId;
  return {
    positives: pos.length,
    negatives: neg.length,
    top1: pos.filter((o) => o.rank === 1).length,
    top3: pos.filter((o) => o.rank >= 1 && o.rank <= 3).length,
    top10: pos.filter((o) => o.rank >= 1 && o.rank <= 10).length,
    /** One tap to confirm, nothing to search */
    sureRight: pos.filter((o) => o.sure && right(o)).length,
    guessRight: pos.filter((o) => !o.sure && o.guessId && right(o)).length,
    guessWrong: pos.filter((o) => !o.sure && o.guessId && !right(o)).length,
    noGuess: pos.filter((o) => !o.guessId).length,
    /** Sure about the wrong order — the expensive mistake */
    sureWrongPos: pos.filter((o) => o.sure && !right(o)).length,
    negSure: neg.filter((o) => o.sure).length,
  };
}
type Tally = ReturnType<typeof tally>;

function report(kind: Case['kind'], label: string, orders: Order[], cases: Case[], showMisses: number) {
  const subset = cases.filter((c) => c.kind === kind);
  const results = [old, now].map((m) => {
    const { outcomes, ms } = score(m, orders, subset);
    return { m, outcomes, ms, t: tally(outcomes) };
  });
  console.log(`\n## ${label}  (${results[0].t.positives} on the list, ${results[0].t.negatives} not)`);
  const rows: [string, (t: Tally, ms: number) => string][] = [
    ['right order ranked 1st', (t) => pct(t.top1, t.positives)],
    ['… in top 3', (t) => pct(t.top3, t.positives)],
    ['… in top 10', (t) => pct(t.top10, t.positives)],
    ['sure + right', (t) => pct(t.sureRight, t.positives)],
    ['guess right, "check it"', (t) => pct(t.guessRight, t.positives)],
    ['guess wrong, "check it"', (t) => pct(t.guessWrong, t.positives)],
    ['no guess', (t) => pct(t.noGuess, t.positives)],
    ['SURE BUT WRONG (on list)', (t) => String(t.sureWrongPos)],
    ['SURE on a box not on list', (t) => `${t.negSure} / ${t.negatives}`],
    ['precision when sure', (t) => pct(t.sureRight, t.sureRight + t.sureWrongPos + t.negSure)],
    ['time per scan', (_t, ms) => `${(ms / subset.length).toFixed(1)} ms`],
  ];
  console.log(`| ${'metric'.padEnd(28)} | ${results.map((r) => r.m.name.padStart(9)).join(' | ')} |`);
  console.log(`|${'-'.repeat(30)}|${results.map(() => '-'.repeat(11)).join('|')}|`);
  for (const [name, f] of rows) console.log(`| ${name.padEnd(28)} | ${results.map((r) => f(r.t, r.ms).padStart(9)).join(' | ')} |`);

  const groups = [...new Set(subset.map((c) => c.group))].filter((g) => g !== 'stray');
  const byGroup = groups.map((g) => {
    const top1 = results.map((r) => {
      const t = tally(r.outcomes.filter((o) => o.c.group === g));
      return pct(t.top1, t.positives);
    });
    return `${g} ${top1.join('→')}`;
  });
  console.log(`\n  ranked 1st by group (old→new): ${byGroup.join(', ')}`);

  if (showMisses) {
    const misses = results[1].outcomes.filter((o) =>
      o.c.expectedId ? o.rank !== 1 || (o.sure && o.guessId !== o.c.expectedId) : o.sure
    );
    console.log(`\n  new matcher misses (${misses.length}, first ${showMisses}):`);
    for (const x of misses.slice(0, showMisses))
      console.log(
        `   - "${x.c.input}"  [${x.c.group}${x.c.expectedId ? `, rank ${x.rank || '—'}` : ', not on list'}]\n` +
          `       is:  ${x.c.source.slice(0, 90)}\n       got: ${x.sure ? 'SURE ' : ''}${(x.guessTitle ?? '—').slice(0, 90)}`
      );
  }
}

const seed = arg('seed', 1);
const { orders, cases } = buildCorpus(seed, arg('size', 1500));

// --query "words" [--sticker]: show the new matcher's top 5 for one input
const q = args.indexOf('--query');
if (q >= 0) {
  const text = args[q + 1];
  const sticker = args.includes('--sticker');
  const ranked = (sticker ? current.rankBySticker : current.rankByTitle)(orders, text);
  const g = (sticker ? current.guessStickerMatch : current.guessTitleMatch)(orders, text);
  for (const r of ranked.slice(0, 5))
    console.log(`${r.score.toFixed(2).padStart(6)} share ${r.share.toFixed(2)} inOrder ${r.inOrder.toFixed(2)} hits ${r.hits}  ${r.item.title?.slice(0, 80)}`);
  console.log(g ? `guess: ${g.sure ? 'SURE' : 'check it'}, ${g.lookalikes} look-alikes` : 'no guess');
  process.exit(0);
}
console.log(`seed ${seed}: ${orders.length} orders, ${cases.length} scans`);
report('sticker', 'X00 sticker read → order', orders, cases, arg('misses', 0));
report('lookup', 'UPC lookup name → order', orders, cases, arg('misses', 0));
