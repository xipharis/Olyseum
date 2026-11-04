"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowDownRight, ArrowUpRight, Clock, Search, X } from "lucide-react";
import type { Address } from "viem";
import { marketOptions, useHead, type MarketSnapshot } from "@/lib/reads";
import { readSpot, type SpotSnapshot } from "@/lib/spot";
import { isSpotOnly, nativeBinding } from "@/config/native";
import type { MarketManifest } from "@/config/deployment";
import { useMarketList } from "@/lib/market-list";
import { lotsToClaims, shortAddr, wadToUnit } from "@/lib/units";
import type { Tone } from "@/lib/enums";
import { chipFor } from "./market-parts";
import { cx } from "./ui";

/** One question, traded as a perp, as Kuru YES/NO tokens, or both (same question text). */
type Question = { key: string; title: string; category?: string; perp?: MarketManifest; spot?: MarketManifest };
type Point = { t: number; v: number };

function groupQuestions(markets: MarketManifest[]): Question[] {
  const byTitle = new Map<string, Question>();
  for (const mk of markets) {
    const q = byTitle.get(mk.title) ?? { key: mk.engine, title: mk.title, category: mk.category };
    if (isSpotOnly(mk.engine)) q.spot ??= mk; else q.perp ??= mk;
    byTitle.set(mk.title, q);
  }
  return [...byTitle.values()];
}

// Same query key as useSpot(engine, undefined, block), so the market page reuses this read.
const spotOptions = (engine: Address, block: bigint | undefined) => ({
  queryKey: ["spot", engine.toLowerCase(), undefined] as const,
  enabled: !!nativeBinding(engine) && block !== undefined,
  queryFn: () => readSpot(engine, undefined, block!),
  refetchInterval: 8000,
});

/** Everything a card shows, derived from live reads only. */
function summarize(q: Question, perp: MarketSnapshot | undefined, spot: SpotSnapshot | undefined, now: bigint | undefined) {
  const yesBid = spot?.books.yes.bids[0]?.tick, yesAsk = spot?.books.yes.asks[0]?.tick;
  const spotMid = yesBid !== undefined && yesAsk !== undefined ? (yesBid + yesAsk) / 2000 : undefined;
  const odds = perp?.risk.indexAvailable ? { p: wadToUnit(perp.risk.indexWad), source: "Index" }
    : perp?.risk.markAvailable ? { p: wadToUnit(perp.risk.markWad), source: "Mark" }
    : spotMid !== undefined ? { p: spotMid, source: "Kuru mid" } : undefined;
  const raw: { label: string; tone: Tone } | undefined = perp ? chipFor(perp)
    : spot ? (spot.resolved ? { label: "Resolved", tone: "muted" } : spot.issuanceOpen ? { label: "Trading", tone: "neutral" } : { label: "Halted", tone: "warn" })
    : undefined;
  const chip = raw;
  // Both sides of a quote come from one venue: YES buys at the ask, NO buys at one minus the YES bid.
  const quote = perp && (perp.bestBid || perp.bestAsk) ? { bid: perp.bestBid, ask: perp.bestAsk, venue: "Perp" }
    : yesBid || yesAsk ? { bid: yesBid, ask: yesAsk, venue: "Kuru" } : undefined;
  const scheduledT = perp?.listing.scheduledT ?? (q.spot ? BigInt(nativeBinding(q.spot.engine)!.scheduledT) : undefined);
  const caps = perp ? (perp.leverageCaps.long > perp.leverageCaps.short ? perp.leverageCaps.long : perp.leverageCaps.short) : undefined;
  const trading = chip?.label === "Trading";
  const closed = !!perp?.halted || !!spot?.resolved;
  return {
    odds, chip, trading, closed,
    quote,
    toT: scheduledT !== undefined && now !== undefined ? scheduledT - now : undefined,
    oi: perp?.oiLots,
    capX: perp ? Number(perp.listing.deploymentCapX) : undefined,
    liveCap: caps,
    rank: closed ? 3 : trading ? 0 : chip ? 1 : 2,
  };
}
type Summary = ReturnType<typeof summarize>;

/** The last 24h of published index prices (perp), or of Kuru YES fills (spot only). */
function useTrace(q: Question) {
  const engine = (q.perp ?? q.spot)?.engine;
  return useQuery({
    queryKey: ["question-trace", engine?.toLowerCase()],
    enabled: !!engine,
    refetchInterval: 60_000,
    queryFn: async ({ signal }): Promise<Point[]> => {
      if (q.perp) {
        const r = await fetch(`/api/price-history/${q.perp.engine}`, { signal, cache: "no-store" });
        if (!r.ok) throw new Error("History unavailable");
        const body = await r.json() as { prices: { kind: string; payload: string }[] };
        return body.prices.filter((e) => e.kind === "ObservationAccepted").map((e) => JSON.parse(e.payload))
          .filter((p) => p.depthValid === true).map((p) => ({ t: Number(p.observedAt), v: Number(BigInt(p.priceWad) / 10n ** 12n) / 1e6 }))
          .sort((a, b) => a.t - b.t);
      }
      const r = await fetch(`/api/kuru-trades/${q.spot!.engine}`, { signal, cache: "no-store" });
      if (!r.ok) throw new Error("Trades unavailable");
      const body = await r.json() as { trades: { outcome: string; timestamp: number; tick: number }[] };
      return body.trades.filter((t) => t.outcome === "yes").map((t) => ({ t: t.timestamp, v: t.tick / 1000 })).sort((a, b) => a.t - b.t);
    },
  });
}

const cents = (tick?: number) => tick ? `${(tick / 10).toFixed(1).replace(/\.0$/, "")}¢` : "—";

/** Short, human countdown for a card: "3d", "5h", "12m", or "Ended". */
function shortWhen(toT?: bigint) {
  if (toT === undefined) return undefined;
  const s = Number(toT);
  if (s <= 0) return "Ended";
  if (s >= 86_400) return `${Math.floor(s / 86_400)}d left`;
  if (s >= 3_600) return `${Math.floor(s / 3_600)}h left`;
  return `${Math.max(1, Math.floor(s / 60))}m left`;
}

/** Half-ring chance gauge, as on a prediction-market card. */
function ChanceGauge({ p }: { p?: number }) {
  const r = 22, c = Math.PI * r;
  const tone = p === undefined ? "var(--color-line-strong)" : p >= 0.5 ? "var(--color-yes)" : "var(--color-no)";
  return <div className="relative flex w-16 shrink-0 flex-col items-center" aria-label={p === undefined ? "No live chance" : `${Math.round(p * 100)}% chance of YES`}>
    <svg viewBox="0 0 56 32" className="w-16" aria-hidden>
      <path d="M6 28 A22 22 0 0 1 50 28" fill="none" stroke="var(--color-press)" strokeWidth="5" strokeLinecap="round" />
      {p !== undefined && <path d="M6 28 A22 22 0 0 1 50 28" fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${c * Math.min(Math.max(p, 0), 1)} ${c}`} />}
    </svg>
    <span className="-mt-3.5 text-[15px] font-semibold leading-none tnum text-fg">{p === undefined ? "—" : `${Math.round(p * 100)}%`}</span>
    <span className="mt-0.5 text-[10px] leading-none text-fg-3">chance</span>
  </div>;
}

/** 24h line in the outcome colour, filled softly underneath. */
function Sparkline({ points, className }: { points: Point[]; className?: string }) {
  const W = 400, H = 120;
  const lo = Math.min(...points.map((p) => p.v)), hi = Math.max(...points.map((p) => p.v));
  const flat = hi - lo < 0.0005, span = hi - lo, t0 = points[0].t, t1 = points.at(-1)!.t;
  const y = (v: number) => flat ? H / 2 : H - 8 - ((v - lo) / span) * (H - 16);
  const xy = points.map((p) => [((p.t - t0) / Math.max(t1 - t0, 1)) * W, y(p.v)] as const);
  const d = xy.map(([x, yy], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${yy.toFixed(1)}`).join(" ");
  const up = points.at(-1)!.v >= points[0].v;
  const stroke = up ? "var(--color-yes)" : "var(--color-no)";
  return <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cx("trace-draw w-full overflow-visible", className)} aria-hidden>
    <path d={`${d} L${W} ${H} L0 ${H} Z`} fill={stroke} opacity="0.08" />
    <path d={d} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
  </svg>;
}

/** Where a card's YES/NO buttons trade: the live perp first, else the Kuru spot books. */
function tradeHref(q: Question, s: Summary, side: "yes" | "no") {
  const mk = q.perp && (s.trading || !q.spot) ? q.perp : q.spot ?? q.perp;
  return `/m/${mk!.engine}?side=${side}`;
}

function OutcomeButtons({ q, s, size = "md" }: { q: Question; s: Summary; size?: "md" | "lg" }) {
  const yes = s.quote?.ask, no = s.quote?.bid ? 1000 - s.quote.bid : undefined;
  const h = size === "lg" ? "h-12 text-[15px]" : "h-10 text-sm";
  return <div className="grid grid-cols-2 gap-2">
    <Link href={tradeHref(q, s, "yes")} className={cx("flex items-center justify-center gap-1.5 rounded-control bg-yes/10 font-medium text-yes transition-colors hover:bg-yes hover:text-on-yes", h)}>
      Buy Yes <span className="tnum opacity-80">{cents(yes)}</span>
    </Link>
    <Link href={tradeHref(q, s, "no")} className={cx("flex items-center justify-center gap-1.5 rounded-control bg-no/10 font-medium text-no transition-colors hover:bg-no hover:text-on-no", h)}>
      Buy No <span className="tnum opacity-80">{cents(no)}</span>
    </Link>
  </div>;
}

function StatusDot({ s }: { s: Summary }) {
  if (!s.chip) return <span className="text-xs text-fg-4">Reading…</span>;
  return <span className={cx("inline-flex items-center gap-1.5 text-xs", s.trading ? "text-fg-2" : "text-fg-3")}>
    <span className={cx("h-1.5 w-1.5 rounded-full", s.trading ? "warming-pulse bg-ask" : s.closed ? "bg-fg-4" : "bg-signal")} aria-hidden />
    {s.trading ? "Live" : s.chip.label.replace(/^Paused: /, "Paused · ")}
  </span>;
}

function CardMeta({ q, s }: { q: Question; s: Summary }) {
  const when = shortWhen(s.toT);
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">
    {q.perp && s.oi !== undefined && <span className="tnum">{lotsToClaims(s.oi)} open</span>}
    {when && <span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden />{when}</span>}
    {q.perp && s.capX && s.capX > 1 ? <span className="rounded-full bg-panel px-2 py-0.5 text-fg-2">up to {s.capX}×</span> : null}
    {q.spot && !q.perp && <span className="rounded-full bg-panel px-2 py-0.5 text-fg-2">Spot</span>}
  </div>;
}

function QuestionCard({ q, s }: { q: Question; s: Summary }) {
  const trace = useTrace(q);
  const points = trace.data && trace.data.length > 1 ? trace.data : undefined;
  const odds = s.odds ?? (points ? { p: points.at(-1)!.v, source: "Last published" } : undefined);
  const main = q.perp && (s.trading || !q.spot) ? q.perp : q.spot ?? q.perp!;
  return <li className="group flex min-w-0 flex-col gap-4 rounded-box border border-line-strong bg-ground p-4 transition-shadow hover:shadow-[0_8px_30px_rgb(0_0_0/6%)]">
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="eyebrow !text-[10px] !tracking-[0.2em]">{q.category ?? "Event"}</span>
          <StatusDot s={s} />
        </div>
        <Link href={`/m/${main.engine}`} className="line-clamp-3 text-[17px] font-medium leading-snug tracking-[-0.02em] text-fg text-balance hover:underline hover:decoration-line-strong hover:underline-offset-4">{q.title}</Link>
      </div>
      <ChanceGauge p={odds?.p} />
    </div>
    <div className="mt-auto flex flex-col gap-3">
      <OutcomeButtons q={q} s={s} />
      <CardMeta q={q} s={s} />
    </div>
  </li>;
}

/** The lead question at scale: title, chance, 24h move and its line, beside big YES / NO buttons. */
function FeaturedCard({ q, s }: { q: Question; s: Summary }) {
  const trace = useTrace(q);
  const points = trace.data && trace.data.length > 1 ? trace.data : undefined;
  const odds = s.odds ?? (points ? { p: points.at(-1)!.v, source: "Last published" } : undefined);
  const move = points ? (points.at(-1)!.v - points[0].v) * 100 : undefined;
  const main = q.perp && (s.trading || !q.spot) ? q.perp : q.spot ?? q.perp!;
  return <section aria-label="Featured market" className="grid overflow-hidden rounded-3xl bg-panel md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="flex items-center gap-3"><span className="eyebrow">{q.category ?? "Event"}</span><StatusDot s={s} /></div>
      <Link href={`/m/${main.engine}`} className="display text-[clamp(1.75rem,3.2vw,2.5rem)] leading-[1.08] text-fg text-balance hover:underline hover:decoration-line-strong hover:underline-offset-8">{q.title}</Link>
      <div className="flex items-end gap-4">
        <p className="display text-6xl leading-none tnum text-fg">{odds ? Math.round(odds.p * 100) : "—"}<span className="text-3xl text-fg-3">%</span></p>
        <div className="pb-1 text-sm text-fg-3">
          <p>chance of YES</p>
          {move !== undefined && <p className={cx("inline-flex items-center gap-0.5 tnum", Math.abs(move) < 0.05 ? "text-fg-3" : move > 0 ? "text-yes" : "text-no")}>
            {Math.abs(move) < 0.05 ? "unchanged" : <>{move > 0 ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}{Math.abs(move).toFixed(1)} pts</>} · 24h
          </p>}
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-3">
        <OutcomeButtons q={q} s={s} size="lg" />
        <CardMeta q={q} s={s} />
      </div>
    </div>
    <div className="relative flex min-h-56 items-end bg-ground/50 p-6 md:p-8">
      {points ? <Sparkline points={points} className="h-48 md:h-64" />
        : <p className="m-auto text-sm text-fg-3">{trace.isError ? "Price history unavailable" : trace.isPending ? "Loading 24h history…" : "No price history in the last 24h"}</p>}
      <span className="eyebrow absolute top-6 right-6 !text-[10px] md:top-8 md:right-8">24h</span>
    </div>
  </section>;
}

/** What sets an archived deployment apart: its metadata note (e.g. "1x perp, retired", "resolved YES"), else its venue. */
function deploymentLabel(mk: MarketManifest) {
  const note = mk.short.match(/\(([^)]+)\)\s*$/)?.[1];
  if (note) return note.charAt(0).toUpperCase() + note.slice(1);
  return isSpotOnly(mk.engine) ? "Kuru spot" : nativeBinding(mk.engine) ? "Native market" : "Perp";
}

/** Archived deployments of one question, each named by what differs, with its contract for reference. */
function ClosedQuestion({ title, items }: { title: string; items: MarketManifest[] }) {
  return <li className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
    <span className="min-w-0 text-sm text-fg-2">{title}</span>
    <span className="flex flex-wrap gap-x-5">
      {items.map((mk) => <Link key={mk.engine} href={`/m/${mk.engine}`} aria-label={`Open ${title}: ${deploymentLabel(mk)}, contract ${mk.engine}`}
        className="group inline-flex min-h-11 items-center gap-2 text-xs text-fg-2 hover:text-fg">
        <span className="font-medium">{deploymentLabel(mk)}</span>
        <span className="font-mono tnum text-fg-4 group-hover:text-fg-3">{shortAddr(mk.engine)}</span>
        <ArrowRight size={13} aria-hidden />
      </Link>)}
    </span>
  </li>;
}

/** The market board: category pills, optional featured card, and a grid of question cards. */
export function MarketBoard({ featured = false, searchable = true }: { featured?: boolean; searchable?: boolean }) {
  const head = useHead();
  const block = head.data?.number, now = head.data?.timestamp;
  const discovery = useMarketList();
  const listed = useMemo(() => discovery.markets.filter((market) => !market.archived), [discovery.markets]);
  const archived = discovery.markets.filter((market) => market.archived);
  const search = useSearchParams().get("q") ?? "";
  const [query, setQuery] = useState(search);
  const [category, setCategory] = useState<string>("All");
  const setSearch = (value: string) => {
    setQuery(value);
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("q", value); else url.searchParams.delete("q");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const searchInput = useRef<HTMLInputElement>(null);
  const normalize = (value: string) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const matches = (mk: MarketManifest) => terms.every((term) => normalize([mk.title, mk.short, mk.category, mk.source].filter(Boolean).join(" ")).includes(term));
  const questions = useMemo(() => groupQuestions(listed), [listed]);
  const categories = useMemo(() => ["All", ...new Set(questions.map((q) => q.category ?? "Event"))], [questions]);

  // The board ranks by live state, so it reads every listed market up front (shared with the market pages).
  const perpReads = useQueries({ queries: questions.map((q) => marketOptions((q.perp?.engine ?? q.key) as Address, q.perp ? block : undefined)) });
  const spotReads = useQueries({ queries: questions.map((q) => spotOptions((q.spot?.engine ?? q.key) as Address, q.spot ? block : undefined)) });
  const summaries = new Map(questions.map((q, i) => [q.key, summarize(q,
    q.perp ? perpReads[i].data as MarketSnapshot | undefined : undefined, q.spot ? spotReads[i].data : undefined, now)]));
  const board = questions
    .filter((q) => category === "All" || (q.category ?? "Event") === category)
    .filter((q) => [q.perp, q.spot].some((mk) => mk && matches(mk))).sort((a, b) => {
      const x = summaries.get(a.key)!, y = summaries.get(b.key)!;
      return x.rank - y.rank || Number((x.toT ?? 0n) - (y.toT ?? 0n));
    });
  const lead = featured && !terms.length && category === "All" ? board[0] : undefined;
  const rest = lead ? board.slice(1) : board;
  const closed = archived.filter(matches).filter((mk) => category === "All" || (mk.category ?? "Event") === category);
  const tradingCount = questions.filter((q) => summaries.get(q.key)?.trading).length;
  const clearSearch = () => { setSearch(""); searchInput.current?.focus(); };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1" role="tablist" aria-label="Categories">
          {categories.map((c) => <button key={c} type="button" role="tab" aria-selected={category === c} onClick={() => setCategory(c)}
            className={cx("h-9 shrink-0 rounded-full px-4 text-sm transition-colors", category === c ? "bg-fg text-ground" : "bg-panel text-fg-2 hover:bg-hover hover:text-fg")}>
            {c}
          </button>)}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-xs tnum text-fg-3 sm:flex">
            {tradingCount > 0 && <span className="warming-pulse h-1.5 w-1.5 rounded-full bg-ask" aria-hidden />}
            {tradingCount} live · {questions.length} {questions.length === 1 ? "market" : "markets"}
          </span>
          {searchable && <div role="search" className="flex h-9 w-full items-center gap-2 rounded-full border border-line-strong px-3 focus-within:border-fg sm:w-64">
            <Search size={15} className="shrink-0 text-fg-3" aria-hidden />
            <label htmlFor="market-search" className="sr-only">Search markets</label>
            <input ref={searchInput} id="market-search" type="search" value={query}
              onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") clearSearch(); }}
              placeholder="Filter markets" autoComplete="off" spellCheck={false} aria-controls="market-results"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none" />
            {query && <button type="button" onClick={clearSearch} aria-label="Clear search" className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-3 hover:bg-hover hover:text-fg"><X size={14} aria-hidden /></button>}
          </div>}
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{`${board.length} of ${questions.length} markets`}</p>

      {head.isError && <p role="alert" className="text-sm text-ask">Live market data is unavailable. <button className="underline" onClick={() => head.refetch()}>Retry connection</button></p>}

      {lead && <FeaturedCard q={lead} s={summaries.get(lead.key)!} />}

      <div id="market-results">
        {questions.length === 0 ? <div className="rounded-box bg-panel p-8">
          <h2 className="text-xl font-medium tracking-[-0.02em] text-fg">A new market is on the way</h2>
          <p className="mt-2 max-w-xl text-sm text-fg-3">The previous demo has been archived while we prepare its replacement. Existing balances and orders remain accessible in your portfolio.</p>
          <Link href="/portfolio" className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-action px-5 text-sm text-on-action hover:bg-action-hover">View portfolio <ArrowRight size={14} aria-hidden /></Link>
        </div> : board.length === 0 ? <div className="rounded-box bg-panel px-8 py-12 text-center">
          <h2 className="text-xl font-medium tracking-[-0.02em] text-fg">No matching markets</h2>
          <p className="mt-2 text-sm text-fg-3">Try another event, team, or topic.</p>
          <button type="button" onClick={() => { clearSearch(); setCategory("All"); }} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-action px-5 text-sm text-on-action hover:bg-action-hover">Show all markets</button>
        </div> : rest.length > 0 && <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rest.map((q) => <QuestionCard key={q.key} q={q} s={summaries.get(q.key)!} />)}
        </ul>}
      </div>

      {closed.length > 0 && <section aria-labelledby="closed-markets" className="mt-10">
        <p className="eyebrow">Closed</p>
        <h2 id="closed-markets" className="display mt-3 text-3xl text-fg">Archived markets</h2>
        <p className="mt-2 max-w-2xl text-sm text-fg-3">Archived markets take no new positions. Open one to reduce a position, release collateral or claim a payout.</p>
        <ul className="mt-5 divide-y divide-line rounded-box border border-line-strong">
          {[...closed.reduce((groups, mk) => groups.set(mk.title, [...(groups.get(mk.title) ?? []), mk]), new Map<string, MarketManifest[]>())]
            .map(([title, items]) => <ClosedQuestion key={title} title={title} items={items} />)}
        </ul>
      </section>}

      <p className="max-w-2xl text-xs leading-relaxed text-fg-4">
        {discovery.isError ? "Registry discovery is unavailable. Showing the last verified markets." : discovery.isPending ? "Checking the verified markets against the registry…" : "Showing markets in the verified deployment. New listings become tradable after their deployment manifest is verified and updated."}
        {discovery.isError && <> <button className="underline" onClick={() => discovery.refetch()}>Retry discovery</button></>}
        {block !== undefined && <> · Block {block.toLocaleString("en-US")}</>}
      </p>
    </div>
  );
}

export function MarketsIndex() {
  return (
    <main className="mx-auto w-full max-w-[1320px] px-4 pt-10 md:px-6">
      <p className="eyebrow">Markets</p>
      <h1 className="display mt-3 text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.02] text-fg">Every question, one price.</h1>
      <p className="mt-3 max-w-xl text-lg font-light leading-snug tracking-[-0.02em] text-fg-3">The price of YES is the market’s chance it happens. One share pays 1 if the answer is YES.</p>
      <div className="mt-10"><MarketBoard /></div>
    </main>
  );
}
