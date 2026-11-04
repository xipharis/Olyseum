"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { useHead, useLadder, useMarket, useTradingSnapshot, type MarketSnapshot } from "@/lib/reads";
import { usePriceSeries } from "@/lib/price-history";
import { useMarketActivity } from "@/lib/use-market-activity";
import { wakeProgress } from "@/lib/wake-progress";
import type { MarketManifest } from "@/config/deployment";
import { fmtDuration, fmtUtc, lotsToClaims, wadToUnit } from "@/lib/units";
import { PriceAxis } from "./price-axis";
import { OrderBook, type BookPriceIntent } from "./order-book";
import { MarketTrades } from "./market-trades";
import { closeIntent, type CloseIntent } from "@/lib/trade-intent";
import { Ticket } from "./ticket";
import { AccountPanel, DeadlineStrip, MarketInfo, PositionPanel, chipFor } from "./market-parts";
import { useOwner } from "./wallet";
import { cx, selectionKeys } from "./ui";
import { OpenOrders } from "./open-orders";
import { ProtectionPanel } from "./protection-panel";
import { RiskPanel } from "./risk-panel";
import { ReservePanel } from "./reserve-panel";
import { OperationsPanel } from "./operations-panel";
import { OracleMarket } from "./resolution";
import { ResolutionBanner, ResolutionStory } from "./resolution-story";
import { SpotHeader, SpotWorkspace, VenueBar, useKuruTrades } from "./spot-terminal";
import { useSpot } from "@/lib/spot";
import { nativeBinding } from "@/config/native";
import { AccountHistory } from "./account-history";

const TABS = ["Position", "Open orders", "History", "Order book", "Trades", "Rules"] as const;
const DETAILS = ["Protection", "Risk", "Liquidity", "Operations"] as const;
type Tab = (typeof TABS)[number] | (typeof DETAILS)[number];

/** Question first: category, title, the chance of YES at scale, and the facts a bettor reads next. */
function QuestionHeader({ manifest, m, now, readError }: { manifest: MarketManifest; m?: MarketSnapshot; now?: bigint; readError: boolean }) {
  const chip = m ? chipFor(m) : undefined;
  // Index, else mark, else the midpoint of the live book, each named; never a guessed price.
  const mid = m && m.bestBid && m.bestAsk ? (m.bestBid + m.bestAsk) / 2000 : undefined;
  const p = m?.risk.indexAvailable ? wadToUnit(m.risk.indexWad) : m?.risk.markAvailable ? wadToUnit(m.risk.markWad) : mid;
  const source = m?.risk.indexAvailable ? "Index" : m?.risk.markAvailable ? "Mark" : mid !== undefined ? "Book mid" : undefined;
  const T = m?.listing.scheduledT;
  const caps = m?.leverageCaps;
  const live = chip?.label === "Trading";
  return <header className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="eyebrow">{manifest.category ?? "Event"}</span>
      {chip && <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-xs text-fg-2">
        <span className={cx("h-1.5 w-1.5 rounded-full", live ? "warming-pulse bg-ask" : m?.halted ? "bg-fg-4" : "bg-signal")} aria-hidden />
        {live ? "Live" : chip.label}
      </span>}
      {manifest.source && <span className="text-xs text-fg-3">Source · {manifest.source}</span>}
    </div>
    <h1 className="display text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.06] text-fg text-balance">{manifest.title}</h1>
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
      <div>
        <p className="flex items-baseline gap-1 leading-none">
          <span className="display text-5xl tnum text-fg">{p === undefined ? "—" : Math.round(p * 100)}</span>
          <span className="text-2xl text-fg-3">%</span>
          <span className="ml-2 text-base text-fg-3">chance</span>
        </p>
        <p className="mt-2 text-xs text-fg-3">{!m && !readError ? "Loading…" : source ? `${source} ${p!.toFixed(3)}` : readError ? "Price unavailable" : "Waiting for the first published price"}</p>
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <div><dt className="text-xs text-fg-3">Open interest</dt><dd className="mt-0.5 tnum text-fg">{m ? `${lotsToClaims(m.oiLots)} shares` : "—"}</dd></div>
        <div><dt className="text-xs text-fg-3">Leverage</dt><dd className="mt-0.5 tnum text-fg">{caps ? `${caps.long > caps.short ? caps.long : caps.short}× now · ${m!.listing.deploymentCapX}× max` : "—"}</dd></div>
        <div><dt className="text-xs text-fg-3">{m?.halted || (T !== undefined && now !== undefined && T <= now) ? "Closed" : "Closes in"}</dt>
          <dd className="mt-0.5 inline-flex items-center gap-1 tnum text-fg" title={T !== undefined ? fmtUtc(T) : undefined}>
            <Clock size={13} className="text-fg-3" aria-hidden />
            {T === undefined || now === undefined ? "—" : m?.halted || T <= now ? fmtUtc(T) : fmtDuration(T - now)}
          </dd></div>
      </dl>
    </div>
  </header>;
}

export function Terminal({ manifest }: { manifest: MarketManifest }) {
  const tabsId = useId();
  const ticketRef = useRef<HTMLElement>(null);
  const initialSide = useSearchParams().get("side") === "no" ? "no" : "yes";
  const head = useHead();
  const block = head.data?.number;
  const owner = useOwner();
  const binding = nativeBinding(manifest.engine);
  const native = !!binding, spotOnly = !!binding?.spotOnly;
  const [venue, setVenue] = useState<"perp" | "spot">(spotOnly ? "spot" : "perp");
  const spotView = native && (spotOnly || venue === "spot");
  // Each view polls only what it shows: the shared read proxy admits a few requests at a time.
  const spot = useSpot(manifest.engine, spotView ? owner.address : undefined, native ? block : undefined);
  const kuruTrades = useKuruTrades(manifest.engine, native);
  // A spot-only market's engine is a resolution anchor: none of the perp reads below apply to it.
  const market = useMarket(manifest.engine, spotOnly ? undefined : block);
  const snapshot = useTradingSnapshot(manifest.engine, owner.address, spotView ? undefined : block);
  const md = market.data;
  const actionMarket = snapshot.data?.market;
  const trader = snapshot.data?.trader;
  const publicUnavailable = head.isError || market.isError;
  const readUnavailable = publicUnavailable || snapshot.isError || !!snapshot.data?.accountError;
  // Custody actions use the trading snapshot only; display reads (market header, ladder, prices) cannot block them.
  const custodyUnavailable = head.isError || snapshot.isError || !!snapshot.data?.accountError;
  const ladder = useLadder(manifest.engine, spotView ? undefined : md?.block, md?.bestBid ?? 0, md?.bestAsk ?? 0);
  const live = usePriceSeries(manifest.engine, spotOnly ? undefined : block);
  useMarketActivity(manifest.engine, !manifest.archived && !spotOnly);
  const waking = md && !publicUnavailable ? wakeProgress({ active: md.active, halted: md.halted, archived: manifest.archived,
    accountingState: md.risk.accountingState, indexAvailable: md.risk.indexAvailable, markAvailable: md.risk.markAvailable,
    longCap: md.leverageCaps.long, shortCap: md.leverageCaps.short, deploymentCapX: md.listing.deploymentCapX }) : undefined;
  const [intent, setIntent] = useState<CloseIntent>();
  const [bookPrice, setBookPrice] = useState<BookPriceIntent>();
  const [tab, setTab] = useState<Tab>("Position");

  const activityRef = useRef<HTMLElement>(null);
  // A halted market's main story is its resolution: open that tab once, unless the viewer already chose one.
  const chosen = useRef(false);
  useEffect(() => { if (md?.halted && !chosen.current) { chosen.current = true; setTab("Rules"); } }, [md?.halted]);
  const openResolution = () => { setTab("Rules"); activityRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  useEffect(() => setIntent(undefined), [owner.address]);
  const primaryIndex = TABS.findIndex(value => value === tab);
  // The book's centre price: the latest public fill, else the mark. Moves compare against the fill before it.
  const last = useMemo(() => {
    const [latest, before] = [...live.trades].sort((a, b) => Number(b.block - a.block) || b.t - a.t);
    if (latest) return { tick: latest.tick, move: before ? Math.sign(latest.tick - before.tick) : 0, label: "Last trade price" };
    if (md?.risk.markAvailable) return { tick: Number(md.risk.markWad / 10n ** 15n), move: 0, label: "Mark price" };
    return undefined;
  }, [live.trades, md]);
  const emptyReason = !md ? "Loading market prices…"
    : manifest.archived ? "Historical prices only."
    : !md.active ? "Prices appear when trading opens."
    : "Waiting for fresh market prices.";

  function reduce(bps: number) {
    if (readUnavailable || !actionMarket || trader?.block !== actionMarket.block || !trader?.account?.preview.positionLots) return;
    setIntent(closeIntent(trader.account.preview.positionLots, actionMarket.bestBid, actionMarket.bestAsk, bps, ladder.data ?? []));
    ticketRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" });
    ticketRef.current?.focus({ preventScroll: true });
  }

  const card = "overflow-clip rounded-box border border-line-strong bg-ground";

  return <main aria-label="Market"
    data-market-state={publicUnavailable ? "error" : md ? "ready" : "loading"}
    data-account-state={!owner.address ? "disconnected" : readUnavailable ? "error" : trader ? "ready" : "loading"}
    className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-4 pt-6 md:px-6">
    <Link href="/markets" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-3 hover:text-fg">
      <ArrowLeft size={15} aria-hidden />All markets
    </Link>

    {spotView ? <div className={cx(card, "px-1")}><SpotHeader manifest={manifest} s={spot.data} trades={kuruTrades.data?.trades} now={Number(head.data?.timestamp ?? BigInt(Math.floor(Date.now() / 1000)))} /></div>
      : <QuestionHeader manifest={manifest} m={md} now={head.data?.timestamp} readError={!!live.error || publicUnavailable} />}

    <ResolutionBanner manifest={manifest} m={md} onOpen={openResolution} />
    {native && !spotOnly && <VenueBar s={spot.data} engine={manifest.engine} venue={venue} onChange={setVenue} />}
    {!spotView && manifest.archived && !md?.halted && <p role="status" className="rounded-box bg-panel px-4 py-3 text-sm text-fg-2">Archived market. New positions are disabled; existing positions and funds remain accessible.</p>}
    {!spotView && (readUnavailable || ladder.isError) && <p role="alert" className="flex flex-wrap items-center gap-2 rounded-box bg-no/10 px-4 py-3 text-sm text-no">Connection interrupted. Refresh before trading.<button className="underline" onClick={() => { void head.refetch(); void market.refetch(); void snapshot.refetch(); void ladder.refetch(); }}>Retry</button></p>}

    {!spotView && waking && <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-box bg-panel px-4 py-3 text-sm text-fg-2">
      <span className="font-medium text-fg">Market waking up</span>
      <ol className="flex items-center gap-3" aria-label="Wake-up progress">
        {waking.steps.map(step => <li key={step.label} className={cx("inline-flex items-center gap-1.5 text-xs", step.done ? "text-yes" : "text-fg-3")}>
          <span className={cx("h-1.5 w-1.5 rounded-full", step.done ? "bg-yes" : "bg-fg-4")} aria-hidden />{step.label}<span className="sr-only">{step.done ? " ready" : " pending"}</span></li>)}
      </ol>
      <span className="text-xs text-fg-3">{waking.detail}</span>
    </div>}

    {spotView ? <SpotWorkspace manifest={manifest} halted={spotOnly ? !!spot.data?.resolved : !!md?.halted} spot={spot} trades={kuruTrades} live={live} />
      : <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className={cx(card, "flex min-h-[26rem]")} aria-busy={!md && !publicUnavailable}>
          <div className="flex min-w-0 flex-1 [&>*]:min-w-0 [&>*]:flex-1">
            <PriceAxis index={live.index} perp={live.perp}
              markUnit={md?.risk.markAvailable ? wadToUnit(md.risk.markWad) : undefined}
              indexUnit={md?.risk.indexAvailable ? wadToUnit(md.risk.indexWad) : undefined}
              emptyTitle={!md ? "Loading market" : manifest.archived ? "Market archived" : !md.active ? "Trading has not opened" : "Waiting for price"}
              emptyReason={emptyReason} warming={!manifest.archived} historyStatus={live.historyStatus} readError={!!live.error || publicUnavailable} source={manifest.source} />
          </div>
        </div>

        <section ref={activityRef} className="flex flex-col gap-3" aria-label="Market activity">
          <div className="flex flex-wrap items-center gap-2">
            <div className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1" role="tablist" aria-label="Market activity" onKeyDown={selectionKeys}>
              {TABS.map((value, index) => <button key={value} role="tab" id={`${tabsId}-${index}`} aria-controls={`${tabsId}-panel`}
                tabIndex={tab === value || (primaryIndex < 0 && index === 0) ? 0 : -1} aria-selected={tab === value}
                onClick={() => { chosen.current = true; setTab(value); }}
                className={cx("h-9 shrink-0 rounded-full px-4 text-sm transition-colors", tab === value ? "bg-fg text-ground" : "bg-panel text-fg-2 hover:bg-hover hover:text-fg")}>
                {value}
              </button>)}
            </div>
            <select id={`${tabsId}-details`} aria-label="More market details" value={primaryIndex < 0 ? tab : ""}
              className={cx("h-9 cursor-pointer rounded-full border px-3 text-sm", primaryIndex < 0 ? "border-fg bg-fg text-ground" : "border-line-strong bg-ground text-fg-2")}
              onChange={event => { if (event.target.value) { chosen.current = true; setTab(event.target.value as Tab); } }}>
              <option value="" disabled>More</option>
              {DETAILS.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div className={cx(card, "min-h-40")} role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={primaryIndex < 0 ? `${tabsId}-details` : `${tabsId}-${primaryIndex}`} tabIndex={0}>
            {tab === "Position" ? <PositionPanel engine={manifest.engine} m={actionMarket} t={trader} onReduce={readUnavailable ? undefined : reduce} />
              : tab === "Open orders" || tab === "History" ? (owner.address && !trader
                ? <p role="status" className="p-5 text-sm text-fg-3">{readUnavailable ? "Account unavailable. Retry to refresh." : "Reading your account…"}</p>
                : tab === "Open orders" ? <OpenOrders engine={manifest.engine} traderId={trader?.traderId} block={actionMarket?.block} readUnavailable={readUnavailable} />
                : <AccountHistory engine={manifest.engine} traderId={trader?.traderId} block={actionMarket?.block} />)
              : tab === "Order book" ? <div className="flex max-h-[32rem] min-h-72"
                  data-book-state={ladder.isError || publicUnavailable ? "error" : md && ladder.data ? "ready" : "loading"}
                  aria-busy={!publicUnavailable && !ladder.isError && (!md || !ladder.data)}>
                  <div className="flex flex-1 overflow-auto">
                    <OrderBook levels={ladder.isError ? [] : ladder.data ?? []} bestBid={md?.bestBid ?? 0} bestAsk={md?.bestAsk ?? 0} last={last}
                      emptyReason={ladder.isError || publicUnavailable ? "Book unavailable" : !md || (!ladder.data && !!(md.bestBid || md.bestAsk)) ? "Loading book…" : "No resting orders"}
                      warming={ladder.isError || publicUnavailable || !md || (!ladder.data && !!(md.bestBid || md.bestAsk)) || (!manifest.archived && !md.halted && (!md.active || !md.risk.indexAvailable))}
                      onPrice={tick => setBookPrice({ tick, nonce: Date.now() })} />
                  </div>
                </div>
              : tab === "Trades" ? <div className="flex max-h-[32rem]"><MarketTrades trades={live.trades} status={live.error ? "Trades unavailable" : !md ? "Loading trades…" : "No trades yet"} /></div>
              : tab === "Rules" ? <>
                  {manifest.oracleMarketId ? <ResolutionStory manifest={manifest} m={md} /> : <p className="p-5 text-sm text-fg-3">This test market uses manual settlement.</p>}
                  <details className="border-t border-line"><summary className="cursor-pointer px-5 py-3 text-sm text-fg-3">Market details</summary><MarketInfo manifest={manifest} m={md} /></details>
                  <details className="border-t border-line"><summary className="cursor-pointer px-5 py-3 text-sm text-fg-3">Trading deadlines</summary><DeadlineStrip m={md} now={head.data?.timestamp} /></details>
                  {manifest.oracleMarketId && <details className="border-t border-line"><summary className="cursor-pointer px-5 py-3 text-sm text-fg-3">Oracle record</summary><OracleMarket id={manifest.oracleMarketId} engine={manifest.engine} /></details>}
                </>
              : tab === "Protection" ? (actionMarket ? <ProtectionPanel key={owner.address ?? "disconnected"} engine={manifest.engine} m={actionMarket} t={trader} readUnavailable={readUnavailable} /> : <p className="p-5 text-sm text-fg-3">Loading protection…</p>)
              : tab === "Risk" ? (actionMarket ? <RiskPanel key={`${manifest.engine}:${owner.address ?? "disconnected"}`} m={actionMarket} t={trader} /> : <p className="p-5 text-sm text-fg-3">Loading risk…</p>)
              : tab === "Liquidity" ? (actionMarket ? <ReservePanel engine={manifest.engine} m={actionMarket} t={trader} readUnavailable={readUnavailable} /> : <p className="p-5 text-sm text-fg-3">Loading liquidity…</p>)
              : actionMarket ? <OperationsPanel engine={manifest.engine} m={actionMarket} readUnavailable={readUnavailable} /> : <p className="p-5 text-sm text-fg-3">Loading operations…</p>}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-24">
        <aside ref={ticketRef} tabIndex={-1} className={cx(card, "shadow-[0_8px_30px_rgb(0_0_0/5%)]")} aria-label="Trade">
          <Ticket key={owner.address ?? "disconnected"} engine={manifest.engine} market={actionMarket} trader={trader} intent={intent} bookPrice={bookPrice} levels={ladder.isError ? undefined : ladder.data} readUnavailable={readUnavailable} initialSide={initialSide} />
        </aside>
        <div className={card}>
          <AccountPanel engine={manifest.engine} m={actionMarket} t={trader} readUnavailable={custodyUnavailable} />
        </div>
      </div>
    </div>}
  </main>;
}
