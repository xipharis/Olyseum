/** `full`: the whole position (Close position), whose remaining collateral is returned to the wallet. */
export type CloseIntent = { nonce: number; side: "buy" | "sell"; size: string; price: string; full: boolean };
export function expiryBlock(input: string, current: bigint) {
  if (!input.trim()) return 0;
  if (!/^\d+$/.test(input)) throw new Error("Expiry must be a block number");
  const block = BigInt(input);
  if (block <= current || block > 0xffffffffn) throw new Error("Expiry must be a future block below 4,294,967,296");
  return Number(block);
}
/** Worst price a market order or close may reach beyond the touch: 20 ticks (0.020). */
export const MARKET_SLIPPAGE_TICKS = 20;
export const CLOSE_SLIPPAGE_TICKS = MARKET_SLIPPAGE_TICKS;
type DepthLevel = { tick: number; bidLots: bigint; askLots: bigint };

/**
 * Limit tick for an order priced like a market order: the level at which the book depth (`levels`) covers
 * the whole size, never more than `maxSlip` ticks beyond the touch. Without depth it uses the touch; 0 when
 * the opposite side of the book is empty.
 */
export function marketTick(lots: bigint, isBuy: boolean, bid: number, ask: number, levels: DepthLevel[] = [], maxSlip = MARKET_SLIPPAGE_TICKS) {
  const touch = isBuy ? ask : bid;
  if (!touch || !levels.length) return touch;
  const bound = isBuy ? Math.min(999, touch + maxSlip) : Math.max(1, touch - maxSlip);
  let filled = 0n;
  for (const l of reachableLevels(isBuy, touch, bound, levels)) { filled += isBuy ? l.askLots : l.bidLots; if (filled >= lots) return l.tick; }
  return bound;
}

function reachableLevels(isBuy: boolean, touch: number, bound: number, levels: DepthLevel[]) {
  return levels.filter((l) => isBuy ? l.tick >= touch && l.tick <= bound && l.askLots > 0n : l.tick <= touch && l.tick >= bound && l.bidLots > 0n)
    .sort((a, b) => isBuy ? a.tick - b.tick : b.tick - a.tick);
}

/**
 * What a market order can actually take: the requested size, or all the depth within `maxSlip` of the
 * touch when that is smaller, and the limit that reaches it. An IOC drops the rest, so sizing to this
 * keeps collateral from being added for lots that cannot fill. Without a usable depth read the size is
 * kept and the contract decides.
 */
export function marketFill(lots: bigint, isBuy: boolean, bid: number, ask: number, levels: DepthLevel[] = [], maxSlip = MARKET_SLIPPAGE_TICKS) {
  const touch = isBuy ? ask : bid;
  const bound = isBuy ? Math.min(999, touch + maxSlip) : Math.max(1, touch - maxSlip);
  const side = touch ? reachableLevels(isBuy, touch, bound, levels) : [];
  if (!side.length) return { tick: touch, lots };
  let filled = 0n;
  for (const l of side) { filled += isBuy ? l.askLots : l.bidLots; if (filled >= lots) return { tick: l.tick, lots }; }
  return { tick: side[side.length - 1].tick, lots: filled };
}

/** Reduce-only close priced like a market sale (see `marketTick`). */
export function closeIntent(lots: bigint, bid: number, ask: number, bps = 10000, levels: DepthLevel[] = [], maxSlip = CLOSE_SLIPPAGE_TICKS): CloseIntent {
  if (!lots || !Number.isInteger(bps) || bps < 1 || bps > 10000) throw new Error("No position to reduce");
  return reduceIntent(lots, (lots < 0n ? -lots : lots) * BigInt(bps) / 10000n, bid, ask, levels, maxSlip);
}

/** Reduce-only order for an exact amount of the position, priced like `closeIntent`. All of it is a full close. */
export function reduceIntent(lots: bigint, amount: bigint, bid: number, ask: number, levels: DepthLevel[] = [], maxSlip = CLOSE_SLIPPAGE_TICKS): CloseIntent {
  const position = lots < 0n ? -lots : lots;
  if (!position) throw new Error("No position to reduce");
  if (amount <= 0n) throw new Error("Reduction is below one lot");
  if (amount > position) throw new Error("Amount is larger than the position");
  const selling = lots > 0n;
  const tick = marketTick(amount, !selling, bid, ask, levels, maxSlip);
  return { nonce: Date.now(), side: selling ? "sell" : "buy", size: `${amount / 1000n}.${String(amount % 1000n).padStart(3, "0")}`,
    price: tick ? `0.${String(tick).padStart(3, "0")}` : "", full: amount === position };
}

/** Lots one reduce-only order can fill now: the opposite book from the touch to the slippage bound. */
export function reducibleDepth(lots: bigint, bid: number, ask: number, levels: DepthLevel[] = [], maxSlip = CLOSE_SLIPPAGE_TICKS) {
  const selling = lots > 0n, touch = selling ? bid : ask;
  if (!touch) return 0n;
  const bound = selling ? Math.max(1, touch - maxSlip) : Math.min(999, touch + maxSlip);
  return levels.filter((l) => selling ? l.tick <= touch && l.tick >= bound : l.tick >= touch && l.tick <= bound)
    .reduce((sum, l) => sum + (selling ? l.bidLots : l.askLots), 0n);
}

/** A typed number of shares in lots (three decimals), or undefined when it is not one. */
export function sharesToLots(input: string) {
  const match = /^(\d+)(?:\.(\d{0,3}))?$/.exec(input.trim());
  return match ? BigInt(match[1]) * 1000n + BigInt((match[2] ?? "").padEnd(3, "0")) : undefined;
}
