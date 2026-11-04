"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { chain } from "@/config/chain";
import type { TraderSnapshot } from "./reads";
import { useHistory } from "./history-reads";
import { historyTotals } from "./history";
import { usePositionBasis } from "./use-position-basis";
import { appendSample, readLedger, type ValuePoint } from "./money-ledger";

const Q_PER_USDC = 10n ** 24n;
export const qToNumber = (q: bigint) => Number(q * 1_000_000n / Q_PER_USDC) / 1_000_000;
const seriesKey = (engine: string, owner: string) => `eros:value:${chain.id}:${engine.toLowerCase()}:${owner.toLowerCase()}`;

function readSeries(engine: string, owner: string): ValuePoint[] {
  try { return JSON.parse(window.localStorage.getItem(seriesKey(engine, owner)) ?? "[]") as ValuePoint[]; } catch { return []; }
}

/**
 * What one market account is worth and how it has moved. Value is mark equity (cash when flat).
 * Net deposited comes from complete indexer history, else from what this browser moved in and out.
 */
export function useMoney(engine: Address, owner: Address | undefined, trader: TraderSnapshot | undefined) {
  const p = trader?.account?.preview;
  const traderId = trader?.traderId ?? 0;
  const history = useHistory(engine, owner, traderId || undefined, owner && traderId ? trader?.block : undefined);
  const basis = usePositionBasis({ engine, owner, traderId, history: history.data, block: trader?.block,
    positionLots: p?.positionLots, positionVersion: trader?.account?.positionVersion, enabled: !!p && p.positionLots !== 0n });

  const [ledgerTick, setLedgerTick] = useState(0);
  useEffect(() => {
    const bump = () => setLedgerTick((n) => n + 1);
    window.addEventListener("eros:ledger", bump);
    window.addEventListener("storage", bump);
    return () => { window.removeEventListener("eros:ledger", bump); window.removeEventListener("storage", bump); };
  }, []);
  const ledger = owner && typeof window !== "undefined" ? readLedger(window.localStorage, chain.id, engine, owner) : undefined;
  void ledgerTick;

  const totals = history.data?.complete && traderId ? historyTotals(history.data.events, traderId) : undefined;
  const net = totals ? { atoms: totals.allocated - totals.released, source: "history" as const }
    : ledger ? { atoms: ledger.allocatedAtoms - ledger.releasedAtoms, source: "browser" as const } : undefined;

  const valueQ = !p ? undefined : p.positionLots === 0n ? p.cashQ : p.id.markAvailable ? p.markEquityQ : undefined;
  const value = valueQ !== undefined ? qToNumber(valueQ) : undefined;
  const deposited = net ? Number(net.atoms) / 1e6 : undefined;
  const pnl = value !== undefined && deposited !== undefined && deposited > 0 ? value - deposited : undefined;

  // A live line of account value, sampled as snapshots arrive and kept on this device.
  const [series, setSeries] = useState<ValuePoint[]>([]);
  useEffect(() => { setSeries(owner ? readSeries(engine, owner) : []); }, [engine, owner]);
  useEffect(() => {
    if (!owner || value === undefined) return;
    setSeries((prev) => {
      const next = appendSample(prev, { t: Date.now(), v: value });
      if (next !== prev) try { window.localStorage.setItem(seriesKey(engine, owner), JSON.stringify(next)); } catch { /* In memory only. */ }
      return next;
    });
  }, [engine, owner, value]);

  const lots = p?.positionLots ?? 0n;
  const entry = basis.available && lots !== 0n
    ? Number(basis.entryValueQ.numerator * 1000n / (basis.entryValueQ.denominator * 10n ** 18n * (lots < 0n ? -lots : lots))) / 1_000_000
    : undefined;

  return { value, deposited, pnl, pnlPct: pnl !== undefined && deposited ? (pnl / deposited) * 100 : undefined,
    netSource: net?.source, series, entry, historyAvailable: !!history.data };
}
