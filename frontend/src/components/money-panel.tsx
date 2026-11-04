"use client";

import type { Address } from "viem";
import type { MarketSnapshot, TraderSnapshot } from "@/lib/reads";
import { useMoney, qToNumber } from "@/lib/use-money";
import type { ValuePoint } from "@/lib/money-ledger";
import { positionLabel } from "@/lib/position-label";
import { HEALTH } from "@/lib/enums";
import { Num, cx } from "./ui";

const usd = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${usd(Math.abs(v))}`;

/** Account value over time on this device; the line is the user's money, so it reads in side colour. */
function ValueLine({ points, up }: { points: ValuePoint[]; up: boolean }) {
  const W = 240, H = 56;
  const lo = Math.min(...points.map((p) => p.v)), hi = Math.max(...points.map((p) => p.v));
  const flat = hi - lo < 0.005, t0 = points[0].t, t1 = points.at(-1)!.t;
  const y = (v: number) => flat ? H / 2 : H - 4 - ((v - lo) / (hi - lo)) * (H - 8);
  const d = points.map((p, i) => `${i ? "L" : "M"}${(((p.t - t0) / Math.max(t1 - t0, 1)) * W).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  return <figure className="min-w-0 flex-1" aria-label={flat ? `Account value steady at ${usd(lo)}` : `Account value between ${usd(lo)} and ${usd(hi)} since sampling began`}>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="trace-draw h-14 w-full overflow-visible" aria-hidden>
      <line x1="0" x2={W} y1={H - 1} y2={H - 1} className="stroke-line" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" className={up ? "stroke-bid" : "stroke-ask"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
    <figcaption className="mt-1 text-2xs text-fg-3">Value · sampled on this device</figcaption>
  </figure>;
}

/**
 * The user's money in one market: what it is worth now, how far it has moved since funding,
 * and the perp details behind that number.
 */
export function MoneyPanel({ engine, owner, m, t, compact = false }: { engine: Address; owner?: Address; m?: MarketSnapshot; t?: TraderSnapshot; compact?: boolean }) {
  const money = useMoney(engine, owner, t);
  const p = t?.account?.preview;
  if (!owner || !t) return null;
  if (!p) return compact ? null : <p className="text-sm leading-relaxed text-fg-2">
    Not funded yet. Pick Long or Short in the order form: it works out the collateral and adds it to your first trade.
  </p>;

  const up = (money.pnl ?? 0) >= 0;
  const pnlLine = money.pnl !== undefined
    ? <span className={cx("tnum font-medium", up ? "text-bid" : "text-ask")}>{signed(money.pnl)} ({money.pnlPct! >= 0 ? "+" : "−"}{Math.abs(money.pnlPct!).toFixed(2)}%)</span>
    : <span className="text-fg-3">{money.value === undefined ? "Waiting for a mark price" : "Profit and loss need your deposit history"}</span>;

  if (compact) return <div className="flex items-baseline justify-between gap-3 border-t border-line px-3 py-2.5 text-xs" aria-label="Your money in this market">
    <span className="text-fg-3">Your money</span>
    <span className="flex items-baseline gap-2 text-right">
      {money.value !== undefined ? <Num value={usd(money.value)} className="text-fg" /> : <span className="text-fg-3">—</span>}
      {money.pnl !== undefined && pnlLine}
    </span>
  </div>;

  const lots = p.positionLots, markOk = p.id.markAvailable, mark = Number(p.id.markWad / 10n ** 12n) / 1e6;
  const sidePrice = lots >= 0n ? p.id.markWad : 10n ** 18n - p.id.markWad;
  const exposureQ = (lots < 0n ? -lots : lots) * 1000n * sidePrice;
  const leverage = markOk && p.markEquityQ > 0n && lots !== 0n ? Number(exposureQ * 100n / p.markEquityQ) / 100 : undefined;
  const room = markOk && !p.fullBackingRequired ? qToNumber(p.markEquityQ - BigInt(p.mmQ)) : undefined;
  const stats: [string, React.ReactNode, string?][] = [
    ["Position", positionLabel(lots)],
    ["Average entry", money.entry !== undefined ? money.entry.toFixed(3) : "—", money.entry === undefined ? "Needs trade history from the indexer." : "Weighted-average YES price of your open position."],
    ["Mark now", markOk ? mark.toFixed(3) : "No mark"],
    ["Leverage", leverage !== undefined ? `${leverage.toFixed(2)}×` : lots === 0n ? "No position" : "—"],
    ["Before liquidation", p.fullBackingRequired || lots === 0n ? "Fully backed" : room !== undefined ? `${usd(room)} room` : "—",
      "Equity above the maintenance margin. Below zero the position can be liquidated. Fully backed positions cannot be."],
    ["If YES / if NO", `${usd(qToNumber(p.e1Q))} / ${usd(qToNumber(p.e0Q))}`, "What the account is worth at settlement in each outcome."],
    ["Funding accrued", usd(qToNumber(p.projectedFundingQ)), "Already in your balance. Positive means you pay."],
    ["Health", markOk || lots === 0n ? HEALTH[p.status] : "Unavailable"],
  ];

  return <section aria-label="Your money in this market" className="flex flex-col gap-4">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
      <div className="shrink-0">
        <p className="label text-fg-3">Your money</p>
        <p className="mt-1 flex items-baseline gap-2 leading-none">
          {money.value !== undefined ? <Num value={usd(money.value)} className="text-4xl font-semibold tracking-[-0.03em] text-fg" /> : <span className="text-2xl text-fg-3">—</span>}
          <span className="text-sm text-fg-3">{t.assets.symbol}</span>
        </p>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-xs">
          {pnlLine}
          {money.pnl !== undefined && <span className="text-fg-3">since funding{money.netSource === "browser" ? " · deposits from this browser" : ""}</span>}
        </p>
      </div>
      {money.series.length > 1 && <ValueLine points={money.series} up={up} />}
    </div>
    {lots === 0n && <p className="text-xs leading-relaxed text-fg-3">Funded and ready. Place a trade and this number starts moving with the market.</p>}
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-line text-xs md:grid-cols-4">
      {stats.map(([k, v, hint]) => <div key={k} className="min-w-0 bg-panel px-3 py-2.5" title={hint}>
        <dt className="label text-fg-3">{k}</dt>
        <dd className="mt-1 tnum text-fg">{v}</dd>
      </div>)}
    </dl>
  </section>;
}
