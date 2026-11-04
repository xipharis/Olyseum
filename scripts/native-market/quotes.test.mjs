import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// quotes.sh runs `cast keccak` and `cast wallet` when sourced, so cast is a double. `rd call` returns getOrder
// for the id: SIZE_<id> is the remaining size; an unset size is a failed read.
const thin = (ids, sizes, lots = 1000000) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'quotes-'));
  const state = path.join(dir, 'ids');
  if (ids !== null) writeFileSync(state, ids.map(i => `${i}\n`).join(''));
  const script = `
    cast() { echo 0x0; }
    . scripts/native-market/quotes.sh
    rd() { local v="SIZE_$4"; [ -n "\${!v:-}" ] || return 1; echo "(1, \${!v} [1e5], 0, 0, 556, 4, 0, 0, 0, 0, 0, 0)"; }
    if quotes_thin ${lots}; then echo thin; else echo full; fi`;
  return execFileSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, R: 'r', ENG: '0xE', PERP_MAKER_KEY: 'k', HERE: '.', QUOTE_STATE: state,
    ...Object.fromEntries(Object.entries(sizes).map(([id, s]) => [`SIZE_${id}`, String(s)])) } }).trim();
};

test('full and half-used quotes are left alone', () => {
  assert.equal(thin([4, 5], { 4: 1000000, 5: 1000000 }), 'full');
  assert.equal(thin([4, 5], { 4: 500000, 5: 1000000 }), 'full');
});

test('a quote under half of LOTS, or filled away, is thin', () => {
  assert.equal(thin([4, 5], { 4: 1000000, 5: 499999 }), 'thin');
  assert.equal(thin([4, 5], { 4: 0, 5: 1000000 }), 'thin');
  // A quote at the old size is thin against a larger LOTS.
  assert.equal(thin([4, 5], { 4: 150000, 5: 150000 }), 'thin');
});

test('no state file and failed reads never trigger a re-quote', () => {
  assert.equal(thin(null, {}), 'full');
  assert.equal(thin([4, 5], {}), 'full');
});
