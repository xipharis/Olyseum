"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useMoney } from "@/lib/use-money";
import { useHead, useMarket, useTrader } from "@/lib/reads";
import { type MarketManifest } from "@/config/deployment";
import { isSpotOnly } from "@/config/native";
import { useMarketList } from "@/lib/market-list";
import { atomsToUsdc, qToMoney } from "@/lib/units";
import { positionLabel } from "@/lib/position-label";
import { HEALTH } from "@/lib/enums";
import { LoadingPanel } from "./feedback";
import { chipFor } from "./market-parts";
import { useLoginAction, useOwner } from "./wallet";
import { Button, Chip, Num, SectionRule, cx } from "./ui";

const two = (s: string) => s.replace(/(\.\d{2})\d+$/, "$1");
const usd = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Report = { value?: number; pnl?: number; funded: boolean; wallet?: bigint; free?: bigint; symbol?: string };

function Line({ mk, owner, block, onReport }: { mk: MarketManifest; owner: `0x${string}`; block?: bigint; onReport: (engine: string, r: Report) => void }) {
  const m = useMarket(mk.engine, block);
  const t = useTrader(mk.engine, owner, block);
  const p = t.data?.account?.preview;
  const chip = m.data ? chipFor(m.data) : null;
  const money = useMoney(mk.engine, owner, t.data);
  useEffect(() => { onReport(mk.engine, { value: money.value, pnl: money.pnl, funded: !!p, wallet: t.data?.wallet, free: t.data?.free, symbol: t.data?.assets.symbol }); },
    [mk.engine, money.value, money.pnl, p, t.data?.wallet, t.data?.free, t.data?.assets.symbol, onReport]);
  return (
    <tr className="hair-b">
      <td className="py-3 pr-6 pl-4"><Link href={`/m/${mk.engine}`} className="text-sm font-medium text-fg hover:underline">{mk.short}</Link>{mk.archived && <p className="label mt-1 text-fg-3">Archived</p>}</td>
      <td className="pr-6">{chip && <Chip tone={chip.tone}>{chip.label}</Chip>}{(m.isError || t.isError) && <p role="alert" className="mt-1 text-xs text-ask">Read failed. <button className="underline" onClick={() => { void m.refetch(); void t.refetch(); }}>Retry</button></p>}</td>
      <td className="tnum pr-6 text-right text-sm">{p ? positionLabel(p.positionLots) : <span className="text-fg-3">{t.isError ? "unavailable" : t.data ? "not funded" : "Reading…"}</span>}</td>
      <td className="tnum pr-6 text-right text-sm">{money.value !== undefined ? usd(money.value) : p ? two(qToMoney(p.cashQ).usdc) : "—"}</td>
      <td className={cx("tnum pr-6 text-right text-sm", money.pnl === undefined ? "text-fg-3" : money.pnl >= 0 ? "text-bid" : "text-ask")}>{money.pnl !== undefined ? `${money.pnl >= 0 ? "+" : "−"}${usd(Math.abs(money.pnl))}` : "—"}</td>
      <td className="tnum pr-6 text-right text-sm">{p ? `${two(qToMoney(p.e1Q).usdc)} / ${two(qToMoney(p.e0Q).usdc)}` : "—"}</td>
      <td className="pr-6 text-sm text-fg-2">{p ? p.id.markAvailable || p.positionLots === 0n ? HEALTH[p.status] : "unavailable" : "—"}</td>
      <td className="tnum pr-4 text-right text-sm">{p ? atomsToUsdc(p.usableReleaseAtoms, 2) : "—"}</td>
    </tr>
  );
}

function LoggedOut() {
  const login = useLoginAction();
  return (
    <div className="frame mt-4 flex flex-wrap items-center justify-between gap-4 p-6">
      <p className="max-w-[52ch] text-sm leading-relaxed text-fg-2">
        Log in to see your money in every market: what it is worth, your profit or loss, and what you can release.{" "}
        <Link href="/start" className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg">New here? Start in five steps.</Link>
      </p>
      <Button variant="primary" size="lg" arrow disabled={!login.ready} onClick={() => login.login()}>
        Log in
      </Button>
    </div>
  );
}

export function PortfolioPage() {
  const discovery = useMarketList();
  const { markets } = discovery;
  const owner = useOwner();
  const head = useHead();
  const [reports, setReports] = useState<Record<string, Report>>({});
  const onReport = useCallback((engine: string, r: Report) => setReports((all) => ({ ...all, [engine]: r })), []);
  const rows = Object.values(reports);
  const any = rows.find((r) => r.wallet !== undefined);
  const fundedRows = rows.filter((r) => r.funded);
  const totalValue = fundedRows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const pnlRows = fundedRows.filter((r) => r.pnl !== undefined);
  const totalPnl = pnlRows.reduce((sum, r) => sum + r.pnl!, 0);
  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 pt-10 pb-16 md:px-8">
      <h1 className="display text-5xl leading-none text-fg">Portfolio</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-2">
        Your account in each market, read from the contracts. Markets are isolated: balances are never netted across them.
      </p>
      {owner.address && head.data && <section aria-label="Your money" className="frame mt-8 grid gap-px overflow-hidden bg-line sm:grid-cols-3">
        <div className="bg-ground p-5">
          <p className="label text-fg-3">In markets</p>
          <p className="mt-2 flex items-baseline gap-2"><Num value={usd(totalValue)} className="text-3xl font-semibold tracking-[-0.03em] text-fg" /><span className="text-xs text-fg-3">{any?.symbol ?? "tUSDC"}</span></p>
          <p className="mt-1 text-xs text-fg-3">{fundedRows.length} {fundedRows.length === 1 ? "market" : "markets"} funded</p>
        </div>
        <div className="bg-ground p-5">
          <p className="label text-fg-3">Profit / loss</p>
          <p className={cx("mt-2 text-3xl font-semibold tracking-[-0.03em] tnum", !pnlRows.length ? "text-fg-3" : totalPnl >= 0 ? "text-bid" : "text-ask")}>
            {pnlRows.length ? `${totalPnl >= 0 ? "+" : "−"}${usd(Math.abs(totalPnl))}` : "—"}
          </p>
          <p className="mt-1 text-xs text-fg-3">{pnlRows.length ? "Since funding, across markets with deposit history" : "Appears after your first funded trade"}</p>
        </div>
        <div className="bg-ground p-5">
          <p className="label text-fg-3">Ready to trade</p>
          <p className="mt-2 flex items-baseline gap-2"><Num value={any ? usd(Number(any.wallet! + any.free!) / 1e6) : "—"} className="text-3xl font-semibold tracking-[-0.03em] text-fg" /><span className="text-xs text-fg-3">{any?.symbol ?? "tUSDC"}</span></p>
          <p className="mt-1 text-xs text-fg-3">Wallet and free vault balance</p>
        </div>
      </section>}
      {owner.address && head.data && rows.length > 0 && !fundedRows.length && <p className="mt-4 text-sm text-fg-2">
        Nothing funded yet. <Link href="/start" className="inline-flex items-center gap-1 text-fg underline decoration-line-strong underline-offset-4">Start in five steps <ArrowRight size={13} aria-hidden /></Link>
      </p>}
      <div className="mt-10">
        <SectionRule name="POSITIONS" index={1} />
      </div>
      {(head.isError || discovery.isError) && <p role="alert" className="mt-4 text-xs text-ask">Some market data is unavailable. This list may be incomplete. <button className="underline" onClick={() => { void head.refetch(); void discovery.refetch(); }}>Retry</button></p>}
      {!owner.address ? (
        <LoggedOut />
      ) : !head.data && !head.isError ? <div className="mt-4"><LoadingPanel label="Reading your portfolio" /></div> : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[920px] border-t border-line-strong frame text-left">
            <thead>
              <tr className="hair-b text-2xs text-fg-3">
                <th className="py-2.5 pr-6 pl-4 font-medium">Market</th>
                <th className="pr-6 font-medium">Status</th>
                <th className="pr-6 text-right font-medium">Net position</th>
                <th className="pr-6 text-right font-medium">Value</th>
                <th className="pr-6 text-right font-medium">P&amp;L</th>
                <th className="pr-6 text-right font-medium">Value if YES / NO</th>
                <th className="pr-6 font-medium">Health</th>
                <th className="pr-4 text-right font-medium">Releasable</th>
              </tr>
            </thead>
            <tbody>
              {markets.filter((mk) => !isSpotOnly(mk.engine)).map((mk) => (
                <Line key={mk.engine} mk={mk} owner={owner.address!} block={head.data?.number} onReport={onReport} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
