import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backedCashQ, marginTopUpQ, requiredCollateralQ, qToAtomsCeil, withOrder } from '../src/lib/required-collateral.ts';

const E18 = 10n ** 18n;
// 50 claims = 50,000 lots. 1 USDC = 10^24 Q.

test('leveraged long at the mark needs notional / leverage', () => {
  // 50,000 × 0.8 × 10^21 / 4 = 10^25 Q = 10 USDC.
  assert.equal(requiredCollateralQ({ lots: 50000n, tick: 800, isBuy: true, leverage: 4, markWad: 8n * 10n ** 17n, imQ: 6n * 10n ** 24n }), 10n ** 25n);
});

test('the initial margin wins when it is larger', () => {
  assert.equal(requiredCollateralQ({ lots: 50000n, tick: 800, isBuy: true, leverage: 4, markWad: 8n * 10n ** 17n, imQ: 2n * 10n ** 25n }), 2n * 10n ** 25n);
});

test('a limit above the mark adds the spread loss', () => {
  // loss 10^19 per lot; 50,000 × (8×10^20 + 4×10^19) / 4 = 1.05×10^25.
  assert.equal(requiredCollateralQ({ lots: 50000n, tick: 810, isBuy: true, leverage: 4, markWad: 8n * 10n ** 17n, imQ: 6n * 10n ** 24n }), 105n * 10n ** 23n);
  // imQ + loss = 6×10^24 + 5×10^23 dominates only when it is larger.
  assert.equal(requiredCollateralQ({ lots: 50000n, tick: 810, isBuy: true, leverage: 4, markWad: 8n * 10n ** 17n, imQ: 11n * 10n ** 24n }), 115n * 10n ** 23n);
});

test('1x, a missing mark or a missing margin read means full backing', () => {
  assert.equal(requiredCollateralQ({ lots: 50000n, tick: 800, isBuy: true, leverage: 1, markWad: 8n * 10n ** 17n }), 4n * 10n ** 25n);
  assert.equal(requiredCollateralQ({ lots: 50000n, tick: 800, isBuy: false, leverage: 1 }), 50000n * 200n * E18);
  assert.equal(requiredCollateralQ({ lots: 50000n, tick: 800, isBuy: true, leverage: 4 }), 4n * 10n ** 25n);
  assert.equal(requiredCollateralQ({ lots: 50000n, tick: 800, isBuy: true, leverage: 4, markWad: 8n * 10n ** 17n }), 4n * 10n ** 25n);
});

test('never more than full backing, and rounds up', () => {
  assert.equal(requiredCollateralQ({ lots: 1000n, tick: 500, isBuy: true, leverage: 2, markWad: 5n * 10n ** 17n, imQ: 10n ** 30n }), 1000n * 500n * E18);
  // 3.34×10^20 / 3 = 111333…333.33 → rounds up.
  assert.equal(requiredCollateralQ({ lots: 1n, tick: 334, isBuy: true, leverage: 3, markWad: 334n * 10n ** 15n, imQ: 0n }), 111333333333333333334n);
  // A short's notional is the NO side: 1000 − tick.
  assert.equal(requiredCollateralQ({ lots: 1000n, tick: 800, isBuy: false, leverage: 2, markWad: 8n * 10n ** 17n, imQ: 0n }), 1000n * 200n * E18 / 2n);
  assert.equal(qToAtomsCeil(E18), 1n);
  assert.equal(qToAtomsCeil(E18 + 1n), 2n);
  assert.equal(qToAtomsCeil(0n), 0n);
});

// Q per lot·tick is 10^18; payoff is 1000 × 10^18 per lot. Expected values below are hand arithmetic.
const none = { bidLots: 0n, bidValueQ: 0n, askLots: 0n, askValueQ: 0n };

test('adding to a backed long needs the new order paid in full', () => {
  // Long 150 claims, cash 0, buying 135 claims at 0.556: 135,000 × 556 × 10^18 = 75.06 USDC.
  const sums = withOrder(none, 135000n, 556, true);
  assert.equal(backedCashQ(150000n, sums), 135000n * 556n * E18);
  assert.equal(qToAtomsCeil(backedCashQ(150000n, sums)), 75060000n);
});

test('a flat 1x order matches requiredCollateralQ on both sides', () => {
  assert.equal(backedCashQ(0n, withOrder(none, 50000n, 800, true)), requiredCollateralQ({ lots: 50000n, tick: 800, isBuy: true, leverage: 1 }));
  assert.equal(backedCashQ(0n, withOrder(none, 50000n, 800, false)), requiredCollateralQ({ lots: 50000n, tick: 800, isBuy: false, leverage: 1 }));
});

test('adding to a short needs its YES-endpoint loss covered', () => {
  // Short 1 claim, selling 1 more at 0.600: (1000 + 1000) × 1000 × 10^18 − 1000 × 600 × 10^18 = 1.4 × 10^24.
  assert.equal(backedCashQ(-1000n, withOrder(none, 1000n, 600, false)), 14n * 10n ** 23n);
});

test('closing a long needs no collateral; a flip needs the far side covered', () => {
  assert.equal(backedCashQ(1000n, withOrder(none, 1000n, 600, false)), 0n);
  // Long 1 claim, selling 3 at 0.600: (3000 − 1000) × 1000 × 10^18 − 3000 × 600 × 10^18 = 2 × 10^23.
  assert.equal(backedCashQ(1000n, withOrder(none, 3000n, 600, false)), 2n * 10n ** 23n);
});

test('resting orders count toward the requirement', () => {
  const resting = withOrder(none, 1000n, 500, true);
  assert.equal(backedCashQ(0n, withOrder(resting, 1000n, 600, true)), (500000n + 600000n) * E18);
});

test('margin top-up is the margin plus spread loss less mark equity, never negative', () => {
  // Buying 1 claim at 0.810 against a 0.800 mark loses 1000 × 10 × 10^18 = 10^22.
  const base = { lots: 1000n, tick: 810, isBuy: true, markWad: 8n * 10n ** 17n };
  assert.equal(marginTopUpQ({ ...base, markEquityQ: 5n * 10n ** 22n, imQ: 7n * 10n ** 22n }), 3n * 10n ** 22n);
  assert.equal(marginTopUpQ({ ...base, markEquityQ: 9n * 10n ** 22n, imQ: 7n * 10n ** 22n }), 0n);
});
