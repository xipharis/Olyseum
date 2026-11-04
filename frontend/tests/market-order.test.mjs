import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketTick, MARKET_SLIPPAGE_TICKS } from '../src/lib/trade-intent.ts';

// Asks 0.510 ×2, 0.512 ×3, 0.530 ×9 claims; bids 0.500 ×2, 0.498 ×2, 0.470 ×5 claims.
const levels = [
  { tick: 510, bidLots: 0n, askLots: 2000n }, { tick: 512, bidLots: 0n, askLots: 3000n }, { tick: 530, bidLots: 0n, askLots: 9000n },
  { tick: 500, bidLots: 2000n, askLots: 0n }, { tick: 498, bidLots: 2000n, askLots: 0n }, { tick: 470, bidLots: 5000n, askLots: 0n },
];

test('a market buy prices at the ask level whose cumulative depth covers the size', () => {
  assert.equal(MARKET_SLIPPAGE_TICKS, 20);
  assert.equal(marketTick(1000n, true, 500, 510, levels), 510);
  assert.equal(marketTick(2000n, true, 500, 510, levels), 510);
  assert.equal(marketTick(4000n, true, 500, 510, levels), 512);
  // 0.530 is exactly 20 ticks past the touch, so its depth still counts.
  assert.equal(marketTick(6000n, true, 500, 510, levels), 530);
  // Deeper than the band: the limit is the band edge and the rest is cancelled (IOC).
  assert.equal(marketTick(20000n, true, 500, 510, levels), 530);
});

test('a market sell walks bids downwards and stops at the band edge', () => {
  assert.equal(marketTick(1000n, false, 500, 510, levels), 500);
  assert.equal(marketTick(3000n, false, 500, 510, levels), 498);
  // 0.470 is 30 ticks below the touch, outside the band: the limit is 0.480.
  assert.equal(marketTick(5000n, false, 500, 510, levels), 480);
});

test('without depth a market order uses the touch, and an empty side has no price', () => {
  assert.equal(marketTick(5000n, true, 500, 510), 510);
  assert.equal(marketTick(5000n, true, 500, 0, levels), 0);
  assert.equal(marketTick(5000n, false, 0, 510, levels), 0);
  assert.equal(marketTick(5000n, true, 500, 990, [{ tick: 990, bidLots: 0n, askLots: 1000n }]), 999);
  assert.equal(marketTick(5000n, false, 10, 990, [{ tick: 10, bidLots: 1000n, askLots: 0n }]), 1);
});
