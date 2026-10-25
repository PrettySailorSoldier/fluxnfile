// Bundles run.ts (with the app's @/ imports, Supabase stubbed out) and runs it.
//   node scripts/match-bench/bench.mjs [--seed 1] [--size 1500] [--misses 10]
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = join(mkdtempSync(join(tmpdir(), 'match-bench-')), 'bench.mjs');

await build({
  entryPoints: [join(here, 'run.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  tsconfig: join(root, 'tsconfig.app.json'),
  external: ['tesseract.js'],
  logLevel: 'warning',
  plugins: [
    {
      name: 'stub-supabase',
      setup(b) {
        b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'supabase', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const supabase = {};', loader: 'js' }));
      },
    },
  ],
});

const { status } = spawnSync(process.execPath, [out, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(status ?? 1);
