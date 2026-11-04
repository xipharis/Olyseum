import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredCollateralQ, qToAtomsCeil } from '../src/lib/required-collateral.ts';

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
