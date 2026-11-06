/**
 * Minimal Code 128 encoder for price tags (no dependency).
 * Even-length digit strings use the compact set C; anything else set B (ASCII 32–126).
 * `code128Modules` returns the bar pattern as 1 (bar) / 0 (space) modules,
 * including the 10-module quiet zones on both sides.
 */

const PATTERNS = (
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 ' +
  '221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
  '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 ' +
  '212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
  '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 ' +
  '231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 ' +
  '112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 ' +
  '214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
  '114131 311141 411131 211412 211214 211232'
).split(' ');
const STOP = '2331112';
const START_B = 104;
const START_C = 105;

/** Symbol values for a string (start, data, checksum). Throws on unsupported characters. */
export function code128Values(text: string): number[] {
  if (!text) throw new Error('Empty barcode text');
  const values: number[] = [];
  if (/^\d+$/.test(text) && text.length % 2 === 0) {
    values.push(START_C);
    for (let i = 0; i < text.length; i += 2) values.push(parseInt(text.slice(i, i + 2), 10));
  } else {
    values.push(START_B);
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if (code < 32 || code > 126) throw new Error(`Unsupported barcode character: ${ch}`);
      values.push(code - 32);
    }
  }
  let sum = values[0];
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103);
  return values;
}

export function code128Modules(text: string, quietModules = 10): number[] {
  const modules: number[] = Array(quietModules).fill(0);
  const push = (pattern: string) => {
    let bar = 1;
    for (const w of pattern) {
      for (let i = 0; i < Number(w); i++) modules.push(bar);
      bar = bar ? 0 : 1;
    }
  };
  for (const v of code128Values(text)) push(PATTERNS[v]);
  push(STOP);
  modules.push(...Array(quietModules).fill(0));
  return modules;
}

export const _internal = { PATTERNS, STOP };
