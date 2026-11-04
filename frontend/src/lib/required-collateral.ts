/**
 * Market cash a flat account needs before an order of `lots` at `tick` is admitted at `leverage`×.
 * Inverse of `leverageLots`: N / (cash − spread loss) ≤ leverage, and cash − spread loss ≥ the kernel's
 * initial margin (`imQ`, from the margin lens). Never more than full backing, which is always admissible.
 * Without a live mark or margin read only full backing is safe. Q = 10^24 per token; rounds up.
 * Admission (previewOrder) remains authoritative.
 */
export function requiredCollateralQ({ lots, tick, isBuy, leverage, markWad, imQ }: {
  lots: bigint; tick: number; isBuy: boolean; leverage: number; markWad?: bigint; imQ?: bigint;
}): bigint {
  if (lots <= 0n || !Number.isInteger(tick) || tick < 1 || tick > 999 || !Number.isInteger(leverage) || leverage < 1 || leverage > 5)
    throw new Error("Invalid collateral inputs.");
  const fullQ = lots * BigInt(isBuy ? tick : 1000 - tick) * 10n ** 18n;
  if (leverage === 1 || markWad === undefined || imQ === undefined) return fullQ;
  if (markWad <= 0n || markWad >= 10n ** 18n || imQ < 0n) throw new Error("Invalid collateral inputs.");
  const entryQ = BigInt(tick) * 10n ** 18n, markQ = markWad * 1000n, x = BigInt(leverage);
  const adverseQ = isBuy ? entryQ - markQ : markQ - entryQ;
  const lossQ = lots * (adverseQ > 0n ? adverseQ : 0n);
  const notionalQ = lots * (isBuy ? markQ : 10n ** 21n - markQ);
  const byLeverage = (notionalQ + x * lossQ + x - 1n) / x;
  const byMargin = imQ + lossQ;
  const need = byLeverage > byMargin ? byLeverage : byMargin;
  return need < fullQ ? need : fullQ;
}

type OrderSums = { bidLots: bigint; bidValueQ: bigint; askLots: bigint; askValueQ: bigint };
const PAYOFF_Q_PER_LOT = 1000n * 10n ** 18n;

/** Commitments with one more order at `tick` added. */
export function withOrder(s: OrderSums, lots: bigint, tick: number, isBuy: boolean): OrderSums {
  const valueQ = lots * BigInt(tick) * 10n ** 18n;
  return isBuy ? { ...s, bidLots: s.bidLots + lots, bidValueQ: s.bidValueQ + valueQ }
    : { ...s, askLots: s.askLots + lots, askValueQ: s.askValueQ + valueQ };
}

/**
 * Market cash that leaves no deficit at either outcome once every commitment fills: the full-backing
 * predicate of CoverageMath.deficits with a zero fee cap (DEC-11). Admission remains authoritative.
 */
export function backedCashQ(positionLots: bigint, s: OrderSums): bigint {
  const atNo = s.bidValueQ;
  const atYes = (s.askLots - positionLots) * PAYOFF_Q_PER_LOT - s.askValueQ;
  const need = atNo > atYes ? atNo : atYes;
  return need > 0n ? need : 0n;
}

/**
 * Cash to add so a leveraged position can grow on its own side, with no resting orders: `imQ` is the
 * margin on the position after the order and the spread paid at the limit counts against mark equity
 * (OrderAdmissionMath.eMinQ against imUpperQ).
 */
export function marginTopUpQ({ markEquityQ, lots, tick, isBuy, markWad, imQ }: {
  markEquityQ: bigint; lots: bigint; tick: number; isBuy: boolean; markWad: bigint; imQ: bigint;
}): bigint {
  const entryQ = BigInt(tick) * 10n ** 18n, markQ = markWad * 1000n;
  const adverseQ = isBuy ? entryQ - markQ : markQ - entryQ;
  const need = imQ + lots * (adverseQ > 0n ? adverseQ : 0n) - markEquityQ;
  return need > 0n ? need : 0n;
}

/** Q to collateral atoms (10^18 Q each), rounded up so a deposit always covers the requirement. */
export const qToAtomsCeil = (q: bigint) => q <= 0n ? 0n : (q + 10n ** 18n - 1n) / 10n ** 18n;
