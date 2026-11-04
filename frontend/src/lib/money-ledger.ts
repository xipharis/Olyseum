import type { Address } from "viem";

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export type Ledger = { allocatedAtoms: bigint; releasedAtoms: bigint; since: number };
export type ValuePoint = { t: number; v: number };

const key = (chainId: number, engine: string, owner: string) => `eros:ledger:${chainId}:${engine.toLowerCase()}:${owner.toLowerCase()}`;

/**
 * Collateral a confirmed call moved into (+) or out of (−) a market account. Only trader funding
 * (`allocate` with reserve=false) and `release` count; deposits, withdrawals and orders do not.
 */
export function ledgerFlow(call: { address: string; functionName: string; args?: readonly unknown[] }): { engine: Address; atoms: bigint } | undefined {
  const args = call.args ?? [];
  if (call.functionName === "allocate" && args[2] === false && typeof args[0] === "string" && typeof args[1] === "bigint")
    return { engine: args[0] as Address, atoms: args[1] };
  if (call.functionName === "release" && typeof args[0] === "bigint") return { engine: call.address as Address, atoms: -args[0] };
}

/** This browser's record of what it moved into one market; history from the indexer is preferred when present. */
export function readLedger(store: Store, chainId: number, engine: string, owner: string): Ledger | undefined {
  try {
    const raw = store.getItem(key(chainId, engine, owner));
    if (!raw) return;
    const v = JSON.parse(raw) as { allocated: string; released: string; since: number };
    return { allocatedAtoms: BigInt(v.allocated), releasedAtoms: BigInt(v.released), since: Number(v.since) };
  } catch { return; }
}

export function recordFlow(store: Store, chainId: number, engine: string, owner: string, atoms: bigint, nowMs: number) {
  const prior = readLedger(store, chainId, engine, owner) ?? { allocatedAtoms: 0n, releasedAtoms: 0n, since: nowMs };
  const next = atoms >= 0n ? { ...prior, allocatedAtoms: prior.allocatedAtoms + atoms } : { ...prior, releasedAtoms: prior.releasedAtoms - atoms };
  try {
    store.setItem(key(chainId, engine, owner), JSON.stringify({ allocated: next.allocatedAtoms.toString(), released: next.releasedAtoms.toString(), since: next.since }));
  } catch { /* Storage blocked: the panel falls back to history or shows value only. */ }
}

/** Keep every change, at most one repeat per interval, and the newest `max` points. */
export function appendSample(series: ValuePoint[], point: ValuePoint, max = 300, minIntervalMs = 30_000): ValuePoint[] {
  const last = series.at(-1);
  if (last && last.v === point.v && point.t - last.t < minIntervalMs) return series;
  const next = [...series, point];
  return next.length > max ? next.slice(next.length - max) : next;
}
