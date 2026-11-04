import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ledgerFlow, recordFlow, readLedger, appendSample } from '../src/lib/money-ledger.ts';

const engine = '0x0ff5EAE643CB7E303f1726A92C03686674D445C0';
const vault = '0x1111111111111111111111111111111111111111';
const owner = '0x2222222222222222222222222222222222222222';
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('only confirmed market funding and releases move the ledger', () => {
  assert.deepEqual(ledgerFlow({ address: vault, functionName: 'allocate', args: [engine, 10_200000n, false] }), { engine, atoms: 10_200000n });
  assert.deepEqual(ledgerFlow({ address: engine, functionName: 'release', args: [4_000000n] }), { engine, atoms: -4_000000n });
  // Reserve (liquidity) funding, deposits, withdrawals and orders are not trader collateral flows.
  assert.equal(ledgerFlow({ address: vault, functionName: 'allocate', args: [engine, 1n, true] }), undefined);
  for (const functionName of ['deposit', 'withdraw', 'approve', 'placeOrder', 'claim'])
    assert.equal(ledgerFlow({ address: vault, functionName, args: [1n] }), undefined);
});

test('flows accumulate per chain, market and wallet, case-insensitively', () => {
  const s = memory();
  recordFlow(s, 10143, engine, owner, 10_200000n, 1000);
  recordFlow(s, 10143, engine.toLowerCase(), owner.toUpperCase().replace('0X', '0x'), 5_000000n, 2000);
  recordFlow(s, 10143, engine, owner, -4_000000n, 3000);
  assert.deepEqual(readLedger(s, 10143, engine, owner), { allocatedAtoms: 15_200000n, releasedAtoms: 4_000000n, since: 1000 });
  assert.equal(readLedger(s, 10143, vault, owner), undefined);
  assert.equal(readLedger(s, 1, engine, owner), undefined);
});

test('a corrupt or blocked store reads as no ledger instead of throwing', () => {
  const s = memory(); s.setItem(`eros:ledger:10143:${engine.toLowerCase()}:${owner}`, '{not json');
  assert.equal(readLedger(s, 10143, engine, owner), undefined);
  const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(readLedger(blocked, 10143, engine, owner), undefined);
  assert.doesNotThrow(() => recordFlow(blocked, 10143, engine, owner, 1n, 1));
});

test('value samples keep changes, throttle repeats and stay bounded', () => {
  let series = [];
  series = appendSample(series, { t: 0, v: 10 }, 4, 30_000);
  series = appendSample(series, { t: 5_000, v: 10 }, 4, 30_000);   // same value, too soon: skipped
  series = appendSample(series, { t: 6_000, v: 10.5 }, 4, 30_000); // changed: kept
  series = appendSample(series, { t: 40_000, v: 10.5 }, 4, 30_000); // same value after the interval: kept
  assert.deepEqual(series.map((p) => p.t), [0, 6_000, 40_000]);
  for (let i = 1; i <= 5; i++) series = appendSample(series, { t: 40_000 + i * 1000, v: 11 + i }, 4, 30_000);
  assert.equal(series.length, 4);
  assert.equal(series.at(-1).v, 16);
});
