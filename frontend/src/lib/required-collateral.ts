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

/** Q to collateral atoms (10^18 Q each), rounded up so a deposit always covers the requirement. */
export const qToAtomsCeil = (q: bigint) => q <= 0n ? 0n : (q + 10n ** 18n - 1n) / 10n ** 18n;
