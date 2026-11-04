"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { engineAbi } from "@/abi/engine";
import { client, type MarketSnapshot, type TraderSnapshot } from "@/lib/reads";
import { usePermissions } from "@/lib/privy-api";
import { expiryBlock, marketFill, MARKET_SLIPPAGE_TICKS, type CloseIntent } from "@/lib/trade-intent";
import { ownerTrader } from "@/lib/trader";
import { closeToWalletCalls } from "@/lib/close-to-wallet";
import { targetLeverageLots } from "@/lib/leverage";
import { orderPreviewCurrent, orderPreviewOptions } from "@/lib/order-preview";
import { canonicalTrade, displayTickForOutcome, type TradeIntent } from "@/lib/trade-view";
import { useMaxOrder } from "@/lib/use-max-order";
import { OrderSummary } from "./order-summary";
import { WarmingUp } from "./warming-up";
import { useWalletSession } from "./wallet-session";
import { verifiedProfile } from "@/lib/capabilities";
import { sideMarginAt } from "@/lib/margin-lens";
import { backedCashQ, marginTopUpQ, requiredCollateralQ, qToAtomsCeil, withOrder } from "@/lib/required-collateral";
import { fundingPlan } from "@/lib/funds";
import { allocationBlocker, validateAllocation } from "@/lib/allocation-guard";
import { atomsToUsdc } from "@/lib/units";
import { qToMoney } from "@/lib/units";
import { REJECT, ORDER_KIND } from "@/lib/enums";
import { useTx, summarizeOrder } from "@/lib/tx";
import { lotsToClaims, parseClaimsToLots, parsePriceToTick } from "@/lib/units";
import { FieldError, useFieldErrors } from "./feedback";
import { TxFeedback } from "./tx-feedback";
import { Check, ChevronDown } from "lucide-react";
import { useLoginAction, useOwner } from "./wallet";
import { useSwitchChain } from "wagmi";
import { chain } from "@/config/chain";
import { marketByEngine } from "@/config/deployment";
import { Button, Row, cx, selectionKeys } from "./ui";

import type { BookPriceIntent } from "./order-book";

type Parsed = { ok: true; tick: number; lots: bigint } | { ok: false; error: string };
// Long NO is Short YES and Short NO is Long YES, so the ticket offers the two YES directions only.
const TRADE_CHOICES: TradeIntent[] = [{ outcome: "YES", direction: "long" }, { outcome: "YES", direction: "short" }];
// Shown as the prediction-market choice: Long YES buys YES, Short YES is the same position as buying NO.
const intentLabel = (intent: TradeIntent) => intent.direction === "long" ? "Buy Yes" : "Buy No";

// Market is an IOC priced from book depth; the other types map to the engine's order kinds.
type OrderType = "Market" | (typeof ORDER_KIND)[number];
const ORDER_TYPES: { type: OrderType; kind: number; hint: string }[] = [
  { type: "Market", kind: 1, hint: `Trades now at the best prices on the book, up to ${(MARKET_SLIPPAGE_TICKS / 1000).toFixed(3)} past the best. Anything unfilled is cancelled.` },
  { type: "Limit", kind: 0, hint: "You set the price. Whatever does not fill right away waits on the book." },
  { type: "IOC", kind: 1, hint: "Immediate or cancel: fills what it can at your price now, then cancels the rest." },
  { type: "Post only", kind: 2, hint: "Only waits on the book. Rejected if it would trade immediately." },
];
type DepthLevel = { tick: number; bidLots: bigint; askLots: bigint };

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function Ticket({ engine, market, trader, intent, bookPrice, levels, readUnavailable = false, initialSide = "yes" }: { engine: Address; market?: MarketSnapshot; trader?: TraderSnapshot; intent?: CloseIntent; bookPrice?: BookPriceIntent; levels?: DepthLevel[]; readUnavailable?: boolean; initialSide?: "yes" | "no" }) {
  const archived = marketByEngine(engine)?.archived ?? false;
  const owner = useOwner();
  const loginAction = useLoginAction();
  const { switchChain, error: chainError } = useSwitchChain();
  const [tradeIntent, setTradeIntent] = useState<TradeIntent>(TRADE_CHOICES[initialSide === "no" ? 1 : 0]);
  const side = canonicalTrade(tradeIntent, 500).side;
  const [orderType, setOrderType] = useState<OrderType>("Market");
  const kind = ORDER_TYPES.find((o) => o.type === orderType)!.kind;
  const marketOrder = orderType === "Market";
  const rests = orderType === "Limit" || orderType === "Post only";
  const optionsId = useId();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [expiryOn, setExpiryOn] = useState(false);
  const [limitPrice, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [inputRevision, setInputRevision] = useState(0);
  const [reduceOnlyChoice, setReduceOnly] = useState(false);
  const reduceOnly = archived || reduceOnlyChoice;
  const tx = useTx();
  const permissions = usePermissions(owner.address);
  const delegated = permissions.data?.modes.find((p) => p.mode === "trade" && p.granted && p.engines.includes(engine.toLowerCase()));
  const [oneClick, setOneClick] = useState(false);
  const [expiry, setExpiry] = useState("");
  useEffect(() => { if (intent) { setTradeIntent({ outcome: "YES", direction: intent.side === "buy" ? "long" : "short" }); setSize(intent.size); setPrice(intent.price); setReduceOnly(true); setOrderType("IOC"); setExpiryOn(false); setExpiry(""); setTargetLeverage(undefined); setInputRevision((n) => n + 1); } }, [intent]);
  // A book click carries a YES price, which makes the order a limit. Convert once when that new click arrives.
  useEffect(() => { if (bookPrice) { setPrice((displayTickForOutcome(tradeIntent.outcome, bookPrice.tick) / 1000).toFixed(3)); setOrderType((t) => t === "Market" ? "Limit" : t); setTargetLeverage(undefined); setInputRevision((n) => n + 1); } }, [bookPrice]);
  let expires = 0, expiryError = "";
  if (rests && expiryOn) try { expires = expiryBlock(expiry, market?.block ?? 0n); } catch (e) { expiryError = (e as Error).message; }
  const cap = market?.leverageCaps[side === "buy" ? "long" : "short"];
  // A market order's limit is the depth level that covers the size (the touch until a size is entered).
  let sizeLots = 0n;
  try { sizeLots = parseClaimsToLots(size); } catch { /* Incomplete input. */ }
  const fill = marketFill(sizeLots || 1n, side === "buy", market?.bestBid ?? 0, market?.bestAsk ?? 0, levels ?? []);
  const touchTick = fill.tick;
  // A market order only asks for (and only adds collateral for) what the book can fill.
  const orderLots = marketOrder && sizeLots > fill.lots ? fill.lots : sizeLots;
  const price = marketOrder ? (touchTick ? (displayTickForOutcome(tradeIntent.outcome, touchTick) / 1000).toFixed(3) : "") : limitPrice;
  const bestTick = (side === "buy" ? market?.bestAsk : market?.bestBid) ?? 0;
  const [targetLeverage, setTargetLeverage] = useState<number>();
  useEffect(() => { setTargetLeverage(undefined); }, [cap]);
  // Leverage sizing targets the whole position. Flat: equity is cash, even before a normal mark
  // exists. Open position: mark equity and the held side's mark price, so a live mark is required.
  const positionLots = trader?.account?.preview.positionLots ?? 0n;
  const cashQ = trader?.account?.preview.cashQ ?? 0n;
  const flat = positionLots === 0n;
  // Selling or closing sets reduce-only and prefills the order. Once flat, clear both: reduce-only would block
  // leverage, and the leftover size would open the opposite position if submitted again.
  const flatAccount = !!trader?.account && flat;
  useEffect(() => { if (flatAccount && reduceOnlyChoice) { setReduceOnly(false); setSize(""); setOrderType("Market"); setInputRevision((n) => n + 1); } }, [flatAccount, reduceOnlyChoice]);
  const markLive = !!market?.risk.markAvailable;
  const sizingEquity = flat ? cashQ : markLive ? trader?.account?.preview.markEquityQ ?? 0n : 0n;
  const reservedOrders = !!trader?.account && (trader.account.preview.orders.bidLots > 0n || trader.account.preview.orders.askLots > 0n);
  const canSizeLeverage = !!trader?.account && !reservedOrders && !reduceOnly && sizingEquity > 0n && (flat || markLive);
  // A fresh position: leverage is chosen, not derived from cash, and any missing collateral comes from the wallet.
  const fresh = flat && !reservedOrders && !reduceOnly && !archived;
  const [openLeverage, setOpenLeverage] = useState(1);
  useEffect(() => { if (cap !== undefined && BigInt(openLeverage) > cap) setOpenLeverage(1); }, [cap, openLeverage]);
  useEffect(() => { if (!markLive) setOpenLeverage(1); }, [markLive]);
  // An order against the held side lowers leverage, so the side's cap does not limit it.
  const reducing = !flat && (side === "buy") !== (positionLots > 0n);
  // Keyed on cash and position, not mark equity, so a selection survives ordinary mark updates.
  useEffect(() => { setTargetLeverage(undefined); }, [engine, owner.address, cashQ, positionLots, reservedOrders]);


  const parsed = useMemo((): Parsed => {
    try {
      const tick = canonicalTrade(tradeIntent, parsePriceToTick(price)).tick;
      if (parseClaimsToLots(size) === 0n) return { ok: false, error: "Enter a size" };
      return { ok: true, tick, lots: orderLots };
    } catch (e) {
      return { ok: false, error: price && size ? (e as Error).message : "" };
    }
  }, [price, size, tradeIntent, orderLots]);

  const fieldErrors = { price: "", size: "", expiry: expiryError };
  if (!marketOrder) try { parsePriceToTick(price); } catch { fieldErrors.price = "Enter a price from 0.001 to 0.999 (up to 3 decimals)."; }
  try { if (parseClaimsToLots(size) === 0n) fieldErrors.size = "Enter at least 0.001 claims."; } catch { fieldErrors.size = "Enter a positive claim size with up to 3 decimals."; }
  const validation = useFieldErrors(fieldErrors);

  const traderId = trader?.traderId ?? 0;
  const dParsed = useDebounced(parsed);
  const previewQuery = useQuery({
    ...orderPreviewOptions(engine, owner.address, traderId, side, dParsed.ok ? dParsed.tick : 1, dParsed.ok ? dParsed.lots : 1n, reduceOnly, market?.block ?? 0n),
    enabled: traderId > 0 && dParsed.ok && !!market && trader?.block === market.block && !readUnavailable,
  });
  const sameIntent = parsed.ok && dParsed.ok && parsed.tick === dParsed.tick && parsed.lots === dParsed.lots;
  const preview = { ...previewQuery, data: sameIntent && !readUnavailable && orderPreviewCurrent(previewQuery.data, market, trader) ? previewQuery.data?.value : undefined };

  let priceTick: number | undefined;
  try { priceTick = canonicalTrade(tradeIntent, parsePriceToTick(price)).tick; } catch { /* Incomplete input. */ }
  // Lots per target (1x..5x); 0n means the position cannot reach that leverage with this side.
  const leverageSizes = [1, 2, 3, 4, 5].map((x) => {
    if (!canSizeLeverage || priceTick === undefined) return undefined;
    try {
      return targetLeverageLots({ equityQ: sizingEquity, positionLots, tick: priceTick, isBuy: side === "buy", leverage: x,
        markWad: markLive ? market!.risk.markWad : undefined });
    } catch { return undefined; }
  });
  const profile = market ? verifiedProfile(market.profile.profileHash, market.listing.template, market.listing.deploymentCapX) : undefined;
  const markTick = markLive ? Number(market!.risk.markWad / 10n ** 15n) : 0;
  const heldLots = positionLots < 0n ? -positionLots : positionLots;
  const restingOrders = trader?.account?.preview.orders;
  // An order that keeps its account fully backed stays that way; only an already leveraged one tops up to margin.
  const backedAccount = !restingOrders || backedCashQ(positionLots, restingOrders) <= cashQ;
  const admitted = preview.data?.rejection === 0 && !!parsed.ok && preview.data.acceptedCapLots >= parsed.lots;
  const sameSideAdd = !flat && !reducing && !reservedOrders;
  const topsUpMargin = !fresh && !reduceOnly && !archived && !backedAccount && !admitted && !!preview.data
    && sameSideAdd && markLive && cap !== undefined && cap > 1n;
  const margin = useQuery({
    queryKey: ["side-margin", engine, side, dParsed.ok ? ((fresh ? 0n : heldLots) + dParsed.lots).toString() : "", markTick, market?.block.toString()],
    enabled: (topsUpMargin || (fresh && openLeverage > 1)) && markTick > 0 && markTick < 1000 && !!profile && dParsed.ok && !readUnavailable,
    queryFn: () => sideMarginAt((fresh ? 0n : heldLots) + (dParsed.ok ? dParsed.lots : 1n), side === "buy", markTick, market!.risk.secsToT, market!.risk.asOfTime, profile!, market!.block),
    staleTime: 3500, retry: false,
  });
  // Collateral this order needs in the market. Leveraged requirements carry a 1% margin for time and rounding.
  let requiredAtoms: bigint | undefined;
  if (fresh && parsed.ok) try {
    const imQ = openLeverage === 1 ? undefined : margin.data?.imQ;
    if (openLeverage === 1 || imQ !== undefined) {
      const need = qToAtomsCeil(requiredCollateralQ({ lots: parsed.lots, tick: parsed.tick, isBuy: side === "buy", leverage: openLeverage, markWad: markLive ? market!.risk.markWad : undefined, imQ }));
      requiredAtoms = openLeverage === 1 ? need : need + (need + 99n) / 100n;
    }
  } catch { /* Incomplete input. */ }
  const marketCashAtoms = cashQ > 0n ? cashQ / 10n ** 18n : 0n;
  // Collateral this order adds from the wallet. previewOrder reports no margin figures for a size it
  // cannot admit, so the amount is worked out here; the preview still decides admission once it is added.
  const backedOrderCashQ = restingOrders && parsed.ok ? backedCashQ(positionLots, withOrder(restingOrders, parsed.lots, parsed.tick, side === "buy")) : 0n;
  const backedTopUp = backedOrderCashQ > cashQ ? qToAtomsCeil(backedOrderCashQ - cashQ) : 0n;
  let marginTopUp: bigint | undefined;
  if (topsUpMargin && parsed.ok && margin.data) {
    const need = qToAtomsCeil(marginTopUpQ({ markEquityQ: trader!.account!.preview.markEquityQ, lots: parsed.lots, tick: parsed.tick, isBuy: side === "buy", markWad: market!.risk.markWad, imQ: margin.data.imQ }));
    const buffered = need + (need + 99n) / 100n;
    marginTopUp = !margin.data.fullBacking && buffered < backedTopUp ? buffered : backedTopUp;
  }
  // A leverage target above 1× is sized from the equity already in this market, so it adds nothing.
  const usesBacking = !fresh && !reduceOnly && !archived && (backedAccount ? !(targetLeverage && targetLeverage > 1) : !admitted && !topsUpMargin && !!preview.data);
  const shortfall = fresh ? (requiredAtoms !== undefined && requiredAtoms > marketCashAtoms ? requiredAtoms - marketCashAtoms : 0n)
    : topsUpMargin ? marginTopUp ?? 0n : usesBacking ? backedTopUp : 0n;
  const fundable = !!trader && trader.wallet + trader.free >= shortfall;
  const fundingBlocked = shortfall > 0n && market ? allocationBlocker(market) : undefined;
  const symbol = trader?.assets.symbol ?? "tUSDC";
  const session = useWalletSession();
  // Added collateral answers these rejections; 9 and 10 only clear when it removes the deficit altogether.
  const fullyBacks = fresh ? openLeverage === 1 : usesBacking;
  const fundingClears = preview.data?.rejection === 0 || preview.data?.rejection === 8 || (fullyBacks && (preview.data?.rejection === 9 || preview.data?.rejection === 10));
  const maximum = useMaxOrder({ engine, owner: owner.address, market, trader, tick: priceTick,
    isBuy: side === "buy", reduceOnly, unavailable: readUnavailable, inputRevision });

  function chooseIntent(next: TradeIntent) {
    if (next.outcome !== tradeIntent.outcome) {
      try { setPrice((displayTickForOutcome(next.outcome, canonicalTrade(tradeIntent, parsePriceToTick(price)).tick) / 1000).toFixed(3)); }
      catch { setPrice(""); }
    }
    setTradeIntent(next);
    setTargetLeverage(undefined);
    setReduceOnly(false); // Picking a side starts a normal order; selling is prepared from the Position tab.
  }

  // The state that keeps the order from being sent, in the order the user meets it. Disabled
  // labels name a state; actions the user can take (log in, switch network) stay enabled.
  const blocker = tx.recovery ? "Recover previous request first"
    : archived && !trader?.account?.preview.positionLots ? "Archived · no position to reduce"
    : readUnavailable ? "Live reads unavailable"
    : !market
    ? "Loading market"
    : market.halted
      ? "Market halted"
      : !market.active
        ? "Opens on activation"
        : owner.connected && !trader ? "Reading your account…"
          : trader && trader.block !== market.block ? "Refreshing account…"
              : marketOrder && !touchTick ? (side === "buy" ? "No sell orders to buy from" : "No buy orders to sell to")
              : !parsed.ok
                ? parsed.error || "Enter price and size"
                : expiryError ? expiryError
                : (fresh && requiredAtoms === undefined) || (topsUpMargin && marginTopUp === undefined) ? (margin.isError ? "Margin estimate unavailable" : "Checking collateral…")
                : shortfall > 0n && trader && !fundable ? `Needs ${atomsToUsdc(shortfall)} ${symbol} · wallet has ${atomsToUsdc(trader.wallet + trader.free)}`
                : fundingBlocked ? fundingBlocked
                // An unfunded account has no preview; funding happens first and the order re-checks admission.
                : shortfall > 0n && (traderId === 0 || fundingClears) ? null
                : traderId === 0 ? "Enter a size to fund this market"
                : preview.isError ? "Order preview unavailable"
                : !preview.data || !dParsed.ok || parsed.tick !== dParsed.tick || parsed.lots !== dParsed.lots ? "Checking order…"
                : preview.data.rejection !== 0
                  ? REJECT[preview.data.rejection] || "Order cannot be admitted"
                  : preview.data.acceptedCapLots < parsed.lots ? "Reduce size to the admissible limit"
                  : null;

  // Close position, submitted as prepared: once it fills completely, the remaining collateral goes back to
  // the wallet (release, then withdraw), like a spot sale. Any edit to the order turns it into a plain reduce.
  // A leverage target sizes from equity alone; the engine's margin grows with size, so confirm the size is
  // admissible and shrink it to the largest admissible one when it is not.
  const [clampNote, setClampNote] = useState<string>();
  useEffect(() => {
    setClampNote(undefined);
    if (targetLeverage === undefined || reducing || !maximum.enabled || !parsed.ok) return;
    const want = parsed.lots, x = targetLeverage;
    void maximum.search((max) => {
      if (max >= want) return;
      setSize(lotsToClaims(max));
      setClampNote(`${x}× would be ${lotsToClaims(want)} claims; the engine admits up to ${lotsToClaims(max)} at this price (margin rises with size).`);
    });
  }, [targetLeverage, inputRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nothing tradable to show yet: data still loading, reads down, or the market waking up.
  const warming = !archived && (!market || readUnavailable || preview.isError || margin.isError || (owner.connected && !trader)
    || (!market.halted && (!market.active || market.risk.accountingState !== 0 || !market.risk.indexAvailable)));

  const [closeNote, setCloseNote] = useState<string>();
  // Embedded wallets: one in-app approval covers funding and the order. Any edit needs a fresh approval.
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { setConfirming(false); }, [size, price, side, orderType, openLeverage, reduceOnly, shortfall]);
  const closing = !!intent?.full && reduceOnly && size === intent.size && price === intent.price && side === intent.side;

  async function submit(approvedOnce = false) {
    setConfirming(false);
    if (!owner.address || !market || !parsed.ok || blocker || owner.wrongChain) return;
    setCloseNote(undefined);
    const sdk = ownerTrader(engine, owner.address);
    const funding: Parameters<typeof tx.run>[1] = [];
    if (shortfall > 0n && trader) {
      const plan = fundingPlan(shortfall, trader.free, trader.wallet, trader.allowance);
      const validate = (block: bigint) => validateAllocation(engine, block);
      if (plan.approve) funding.push({ ...sdk.approve(plan.approve), label: "approve collateral", validate });
      if (plan.deposit) funding.push({ ...sdk.deposit(plan.deposit), label: "deposit collateral", validate });
      funding.push({ ...sdk.allocate(plan.allocate), label: "fund market", validate });
    }
    const filled = await tx.run(
      owner.address,
      [
        ...funding,
        {
          ...sdk.placeOrder({ kind, isBuy: side === "buy", reduceOnly, tick: parsed.tick, size: parsed.lots, maxFills: market.maxFills, expiryBlock: expires }),
          label: "order",
          validate: async (blockNumber) => {
            const id = await client.readContract({ address: engine, abi: engineAbi, functionName: "participantId", args: [owner.address!], blockNumber });
            const fresh = await client.readContract({ address: engine, abi: engineAbi, functionName: "previewOrder", args: [id, side === "buy" ? 0 : 1, parsed.tick, parsed.lots, reduceOnly], blockNumber });
            if (expires && BigInt(expires) <= blockNumber) throw new Error("The order expiry has passed. Choose a later block.");
            if (fresh.rejection || fresh.acceptedCapLots < parsed.lots) throw new Error(REJECT[fresh.rejection] || "The latest preview does not admit this exact size. Refresh and review the order.");
          },
        },
      ],
      summarizeOrder,
      oneClick && delegated && !funding.length ? { previewBlock: market.block } : undefined,
      false,
      approvedOnce,
    );
    if (!filled || !closing) return;
    let sweep: Awaited<ReturnType<typeof closeToWalletCalls>>;
    try { sweep = await closeToWalletCalls(engine, owner.address); }
    catch { setCloseNote("Your order went through, but returning funds could not start. They stay available in Manage collateral."); return; }
    // A thin book fills only part of a close: say so, because margin stays locked until the position is flat.
    if (sweep.open) setCloseNote("The book could not fill the whole position, so part of it is still open and your funds stay in this market. Press Close position again when new orders appear.");
    if (sweep.calls.length) await tx.run(owner.address, sweep.calls,
      () => ({ summary: "Position closed. Funds returned to your wallet.", tone: "neutral" }));
  }

  const field = "h-11 w-full bg-ground px-3 text-[15px] tnum text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)] placeholder:text-fg-4 focus:shadow-[inset_0_0_0_2px_var(--color-fg)] focus:outline-none";

  return (
    <section aria-label="Order ticket" className="@container flex h-full flex-col">
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Outcome">
          {TRADE_CHOICES.map((choice) => {
            const selected = tradeIntent.outcome === choice.outcome && tradeIntent.direction === choice.direction;
            const long = choice.direction === "long";
            // YES buys at the best ask; NO is one minus the best YES bid.
            const quote = market ? (long ? market.bestAsk : market.bestBid ? 1000 - market.bestBid : 0) : 0;
            return (
              <button
                key={intentLabel(choice)}
                type="button"
                aria-pressed={selected}
                onClick={() => chooseIntent(choice)}
                className={cx(
                  "ui-toggle flex h-14 flex-col items-center justify-center gap-0.5 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                  selected
                    ? long ? "bg-yes text-on-yes" : "bg-no text-on-no"
                    : long ? "bg-yes/10 text-yes hover:bg-yes/15" : "bg-no/10 text-no hover:bg-no/15",
                )}
              >
                <span className="text-[15px] font-medium">{long ? "Yes" : "No"} <span className="tnum">{quote ? `${(quote / 10).toFixed(1).replace(/\.0$/, "")}¢` : "—"}</span></span>
                <span className={cx("text-xs", selected ? "opacity-80" : "opacity-70")}>{long ? "Long YES · odds up" : "Short YES · odds down"}</span>
              </button>
            );
          })}
        </div>
        {archived && <p className="text-xs text-fg-3">This market accepts position reductions only in this interface.</p>}

        <div className="rounded-control bg-ground shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
          <button type="button" aria-expanded={optionsOpen} aria-controls={optionsId} onClick={() => setOptionsOpen((open) => !open)}
            className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
            <span className="label text-fg-3">Order type</span>
            <span className="text-sm font-medium text-fg">{orderType}</span>
            {(reduceOnly || expires > 0) && <span className="label min-w-0 truncate text-signal-text">{[reduceOnly && "Reduce only", expires > 0 && `Expires at #${expires}`].filter(Boolean).join(" · ")}</span>}
            <ChevronDown size={16} aria-hidden className={cx("ml-auto shrink-0 text-fg-3 transition-transform duration-200", optionsOpen && "rotate-180")} />
          </button>
          {optionsOpen && <div id={optionsId} className="grid gap-4 border-t border-line p-2 pb-3">
            <div className="grid gap-1" role="radiogroup" aria-label="Order type" onKeyDown={selectionKeys}>
              {ORDER_TYPES.map((o) => {
                const checked = orderType === o.type;
                return <button key={o.type} type="button" role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1}
                  onClick={() => { if (o.type !== "Market" && marketOrder && touchTick) setPrice(price); setOrderType(o.type); setTargetLeverage(undefined); }}
                  className={cx("grid grid-cols-[0.875rem_minmax(0,1fr)] items-baseline gap-x-2.5 rounded-md px-2 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-signal", checked ? "bg-press" : "hover:bg-hover")}>
                  <span aria-hidden className={cx("relative top-0.5 h-3.5 w-3.5 rounded-full border", checked ? "border-signal" : "border-line-strong")}>
                    {checked && <span className="absolute inset-[3px] rounded-full bg-signal" />}
                  </span>
                  <span className={cx("text-sm font-medium", checked ? "text-fg" : "text-fg-2")}>{o.type}</span>
                  <span className="col-start-2 text-xs leading-relaxed text-fg-3">{o.hint}</span>
                </button>;
              })}
            </div>
            <div className="grid gap-4 border-t border-line px-2 pt-3">
              <label className="flex items-start gap-2 text-sm text-fg">
                <span className="relative mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={reduceOnly}
                    disabled={archived}
                    onChange={(e) => { setReduceOnly(e.target.checked); setTargetLeverage(undefined); }}
                    className="peer absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none border border-line-strong bg-ground checked:bg-action"
                  />
                  <Check size={11} strokeWidth={3} className="pointer-events-none relative hidden text-on-action peer-checked:block" aria-hidden />
                </span>
                <span className="grid gap-0.5">Reduce only<span className="text-xs leading-relaxed text-fg-3">Only shrinks your current position; never opens or flips one.</span></span>
              </label>
              <div className="grid gap-2">
                <button type="button" role="switch" aria-checked={rests && expiryOn} disabled={!rests} onClick={() => setExpiryOn((on) => !on)}
                  className="flex items-start justify-between gap-3 text-left disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
                  <span className="grid gap-0.5 text-sm text-fg">Expire at a block
                    <span className="text-xs leading-relaxed text-fg-3">{rests ? "Cancels the order automatically if it is still open at the block you choose." : "Available for Limit and Post only orders, which wait on the book."}</span>
                  </span>
                  <span aria-hidden className={cx("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200", rests && expiryOn ? "bg-signal" : "bg-press shadow-[inset_0_0_0_1px_var(--color-line-strong)]", !rests && "opacity-50")}>
                    <span className={cx("absolute top-0.5 h-4 w-4 rounded-full transition-[left] duration-200", rests && expiryOn ? "left-[18px] bg-on-signal" : "left-0.5 bg-fg-3")} />
                  </span>
                </button>
                {rests && expiryOn && <label className="flex flex-col gap-1.5 text-xs text-fg-2">
                  <span className="label flex justify-between text-fg-3"><span>Block number</span>{market && <span className="tnum">Now #{market.block.toString()}</span>}</span>
                  <input className={field} inputMode="numeric" placeholder="Enter a future block" value={expiry} {...validation.props("expiry")} onChange={(e) => setExpiry(e.target.value)} />
                  <FieldError id={validation.errorId("expiry")}>{validation.message("expiry")}</FieldError>
                </label>}
              </div>
            </div>
          </div>}
        </div>

        <div className="grid gap-x-6 gap-y-3 @2xl:grid-cols-2">
        <div className="flex flex-col gap-3">
        {marketOrder ? <div className="flex items-baseline justify-between gap-3 rounded-md bg-panel px-3 py-2.5" aria-live="polite">
          <span className="label text-fg-3">Market price</span>
          <span className="text-sm tnum text-fg">{touchTick ? `${side === "buy" ? "at most" : "at least"} ${price}` : "No orders on the book"}</span>
        </div> : <>
        <label htmlFor={validation.props("price").id} className="flex flex-col gap-1.5">
          <span className="label flex justify-between text-fg-3">
            <span>{tradeIntent.outcome} price</span>
            {bestTick > 0 && (
              <button type="button" className="text-fg-2 hover:text-fg" onClick={() => { setPrice((displayTickForOutcome(tradeIntent.outcome, bestTick) / 1000).toFixed(3)); setTargetLeverage(undefined); }}>
                Use best {tradeIntent.direction === "long" ? "ask" : "bid"}
              </button>
            )}
          </span>
          <input className={field} inputMode="decimal" placeholder="0.000" value={price} aria-label={`${tradeIntent.outcome} price`} {...validation.props("price")} onChange={(e) => { setPrice(e.target.value); setTargetLeverage(undefined); }} />
          <FieldError id={validation.errorId("price")}>{validation.message("price")}</FieldError>
        </label>

        </>}
        <label htmlFor={validation.props("size").id} className="flex flex-col gap-1.5">
          <span className="label flex justify-between text-fg-3">
            <span>Shares</span>
            <button type="button" disabled={!maximum.enabled || maximum.busy} title="Search available order capacity at this price" className="text-fg-2 hover:text-fg disabled:opacity-40" onClick={() => { void maximum.search((lots) => { setSize(lotsToClaims(lots)); setTargetLeverage(undefined); }); }}>
              {maximum.busy ? "Finding Max…" : "Max"}
            </button>
          </span>
          <input className={field} inputMode="decimal" placeholder="0.000" value={size} aria-label="Shares" {...validation.props("size")} onChange={(e) => { setSize(e.target.value); setTargetLeverage(undefined); setInputRevision((n) => n + 1); }} />
          {validation.message("size") ? <FieldError id={validation.errorId("size")}>{validation.message("size")}</FieldError>
            : <span className="text-xs text-fg-3">Each YES share pays 1 if the answer is YES; NO pays if it is not.</span>}
        </label>
        {marketOrder && orderLots < sizeLots && <p role="status" className="text-xs leading-relaxed text-signal-text">The book only has {lotsToClaims(orderLots)} shares within {(MARKET_SLIPPAGE_TICKS / 1000).toFixed(3)} of the best price, so this order buys {lotsToClaims(orderLots)}. Use a Limit order to wait for the rest.</p>}
        {clampNote ? <p role="status" className="text-xs leading-relaxed text-signal-text">{clampNote}</p>
          : maximum.message && <p role="status" className="text-xs leading-relaxed text-fg-3">{maximum.message}</p>}
        {maximum.error && <p role="alert" className="text-xs leading-relaxed text-ask">{maximum.error}</p>}
        </div>
        <div className="flex flex-col gap-3">

        <div className="grid gap-1.5">
          <p className="label flex justify-between text-fg-3"><span>Leverage</span><span>{cap === undefined ? "Reading limit…" : `Current limit ${cap}×`}</span></p>
          <div className="grid grid-cols-5 gap-1" role="group" aria-label="Target leverage">
            {[1, 2, 3, 4, 5].map((x) => fresh ? <button key={x} type="button" aria-pressed={openLeverage === x}
              title={x > 1 && !markLive ? "Leverage needs a live mark price" : cap !== undefined && BigInt(x) > cap ? `This market currently allows up to ${cap}×` : undefined}
              disabled={cap === undefined || BigInt(x) > cap || (x > 1 && !markLive) || readUnavailable}
              className={cx("ui-toggle h-8 border text-xs tnum disabled:cursor-not-allowed", openLeverage === x ? "border-signal bg-signal/10 text-signal-text" : "border-line-strong bg-panel text-fg-2 hover:bg-press")}
              onClick={() => setOpenLeverage(x)}>{x}×</button>
              : <button key={x} type="button" aria-pressed={targetLeverage === x}
              title={leverageSizes[x - 1] === 0n ? (reducing ? `Your position is already at or below ${x}×` : `Your position is already at or above ${x}×`) : undefined}
              disabled={!canSizeLeverage || cap === undefined || (!reducing && BigInt(x) > cap) || (x > 1 && !markLive) || !!fieldErrors.price || readUnavailable || trader?.block !== market?.block || !leverageSizes[x - 1]}
              className={cx("ui-toggle h-8 border text-xs tnum disabled:cursor-not-allowed", targetLeverage === x ? "border-signal bg-signal/10 text-signal-text" : "border-line-strong bg-panel text-fg-2 hover:bg-press")}
              onClick={() => { const lots = leverageSizes[x - 1]; if (!lots) { setTargetLeverage(undefined); return; } setSize(lotsToClaims(lots)); setTargetLeverage(x); setInputRevision((n) => n + 1); }}>{x}×</button>)}
          </div>
          {fresh ? <div className="flex items-baseline justify-between gap-3 rounded-md bg-panel px-3 py-2.5" aria-live="polite">
            <span className="label text-fg-3">Collateral needed</span>
            <span className="text-right text-sm tnum text-fg">{requiredAtoms === undefined ? (parsed.ok ? (margin.isError ? "Unavailable" : "Calculating…") : "Enter a size")
              : <>{atomsToUsdc(requiredAtoms)} {symbol}{!owner.connected
                ? <span className="block text-xs text-fg-3">Comes from your wallet when you trade</span>
                : shortfall > 0n && <span className="block text-xs text-fg-3">{marketCashAtoms > 0n ? `${atomsToUsdc(marketCashAtoms)} already in this market · ` : ""}{atomsToUsdc(shortfall)} from your wallet</span>}</>}</span>
          </div> : shortfall > 0n && <div className="flex items-baseline justify-between gap-3 rounded-md bg-panel px-3 py-2.5" aria-live="polite">
            <span className="label text-fg-3">Collateral added</span>
            <span className="text-right text-sm tnum text-fg">{atomsToUsdc(shortfall)} {symbol}<span className="block text-xs text-fg-3">From your wallet when you trade</span></span>
          </div>}
          {owner.connected && shortfall > 0n && !session.instant && <p className="text-xs leading-relaxed text-fg-3">Your wallet asks you to confirm each step.</p>}
          <details className="text-xs text-fg-3">
            <summary className="cursor-pointer py-1 hover:text-fg">Trading details</summary>
            <div className="grid gap-2 pb-1 pt-2 leading-relaxed">
              <p>Long YES is the same as Short NO, and Short YES is the same as Long NO. Both directions net into one position; an opposite trade can close it.</p>
              {market?.active && !market.halted && cap !== undefined && cap < market.listing.deploymentCapX && <p className="border-l-2 border-signal/60 pl-2 text-fg-2">{market.risk.pricingMode === 0 ? "Bootstrap: 1× until the price windows are ready and normal pricing activates." : !market.risk.indexAvailable || !market.risk.markAvailable ? "Higher leverage is temporarily unavailable while the price windows recover." : "The current risk or reserve limit is below the deployment cap."}</p>}
              {fresh && <p>{openLeverage === 1 ? "1× is fully backed: your collateral covers the most this position can lose, so it can never be liquidated." : `At ${openLeverage}× you put up about 1/${openLeverage} of the position's value (at least the market's margin requirement) and the reserve covers the rest. If the price moves against you, the position can be liquidated.`} Missing collateral moves from your wallet into this market when you trade, and stays there until you release it.</p>}
              {!fresh && <p>{reservedOrders ? "Cancel open orders before sizing by leverage." : reduceOnly ? "Turn off Reduce only to size by leverage." : !canSizeLeverage ? (flat ? "Fund this market to size by leverage." : "Sizing an open position by leverage needs a live mark.") : fieldErrors.price ? "Enter a valid order price or use the best price, then choose your leverage." : flat ? "Sizes against the live mark and accounts for the spread. The order preview checks margin and fees." : "Sizes this order so your whole position ends at the chosen leverage against your mark equity, accounting for the spread. On the opposite side it reduces toward that leverage and never flips your position. The order preview checks margin and fees."} Limits adjust with price readiness and risk.</p>}
            </div>
          </details>
        </div>

        </div>
        </div>

        <OrderSummary engine={engine} owner={owner.address} market={market} trader={trader} tradeIntent={tradeIntent}
          order={parsed.ok ? { tick: parsed.tick, lots: parsed.lots, isBuy: side === "buy", reduceOnly } : undefined}
          feeCapQ={preview.data?.rejection === 0 ? preview.data.feeCapQ : undefined} admittedLots={preview.data?.acceptedCapLots} unavailable={readUnavailable} />
        {preview.data && <details className="text-xs text-fg-3">
          <summary className="cursor-pointer py-1 hover:text-fg">Margin and reserve</summary>
          {preview.data && <dl className="mt-2"><Row k="Required initial margin" v={preview.data.fullBackingRequired ? "Fully backed" : qToMoney(preview.data.requiredImQ).usdc} /><Row k="Equity after reservations" v={preview.data.id.markAvailable ? qToMoney(preview.data.eMinQ).usdc : "No mark"} /><Row k="Deficit if NO / YES" v={`${qToMoney(preview.data.d0AfterQ).usdc} / ${qToMoney(preview.data.d1AfterQ).usdc}`} /><Row k="Reserve coverage" v={preview.data.marketCoverageAfter ? "Covered" : "Unavailable"} /></dl>}
        </details>}

        {delegated && <label className="flex items-start gap-2 text-xs text-fg-2"><input type="checkbox" checked={oneClick} onChange={(e) => setOneClick(e.target.checked)} />Use Privy one-click trading for this order</label>}
        {tx.recovery && <div className="border border-line p-3 text-xs text-fg-2">
          <p>A previous one-click request still needs confirmation. Recover it before starting another order.</p>
          <p className="mt-2 break-all">Wallet: {tx.recovery.body.wallet}</p>
          <p className="mt-2 break-all">Market: {tx.recovery.body.engine}</p>
          {tx.recovery.body.action === "placeOrder" && <p className="mt-1">{tx.recovery.body.place.isBuy ? "Buy YES" : "Sell YES"} · {lotsToClaims(BigInt(tx.recovery.body.place.size))} claims at YES {(tx.recovery.body.place.tick / 1000).toFixed(3)}</p>}
          <Button className="mt-2" disabled={owner.wrongChain || tx.state.status === "pending" || tx.state.status === "sent"} onClick={() => owner.address && tx.recover(owner.address)}>Recover previous request</Button>
        </div>}
        {warming && <WarmingUp compact className="rounded-md bg-panel px-3 py-3" />}
        {!owner.connected ? (
          <Button variant="primary" size="lg" arrow disabled={!loginAction.ready} onClick={() => loginAction.login()}>
            Log in to trade
          </Button>
        ) : owner.wrongChain ? (
          <Button variant="secondary" size="lg" onClick={() => switchChain({ chainId: chain.id })}>
            Switch to Monad testnet
          </Button>
        ) : (
          <Button variant={side === "buy" ? "bid" : "ask"} size="lg" arrow disabled={!!blocker || confirming || tx.state.status === "pending" || tx.state.status === "sent"} onClick={() => { if (session.embedded && !session.instant) setConfirming(true); else void submit(); }}>
            {blocker ?? (tx.state.status === "pending" || tx.state.status === "sent" ? tx.state.step : closing ? "Close position" : shortfall > 0n ? `${intentLabel(tradeIntent)} · add ${atomsToUsdc(shortfall)} ${symbol}` : intentLabel(tradeIntent))}
          </Button>
        )}
        {confirming && !blocker && parsed.ok && <div role="dialog" aria-label="Approve this trade" className="grid gap-2 rounded-md p-3 text-xs shadow-[inset_0_0_0_1px_var(--color-signal)]">
          <p className="label text-signal-text">Approve this trade</p>
          <p className="text-sm text-fg">{side === "buy" ? "Buy" : "Sell"} {lotsToClaims(parsed.lots)} YES at {side === "buy" ? "up to" : "at least"} {(parsed.tick / 1000).toFixed(3)}{fresh && openLeverage > 1 ? ` · ${openLeverage}×` : ""}</p>
          {shortfall > 0n && <p className="text-sm text-fg">You pay <strong>{atomsToUsdc(shortfall)} {symbol}</strong> from your wallet as collateral.</p>}
          <p className="leading-relaxed text-fg-3">This one approval signs {shortfall > 0n ? "the funding steps and the order" : "the order"} on Monad testnet. Gas is paid in test MON.</p>
          <div className="flex gap-2">
            <Button variant={side === "buy" ? "bid" : "ask"} size="sm" onClick={() => void submit(true)}>Approve and trade</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </div>}
        {closing && owner.address && !owner.wrongChain && <p className="text-xs leading-relaxed text-fg-3">
          When the close fills completely, your remaining collateral is returned to your wallet (two more confirmations). A partial fill keeps the rest of the position open.
        </p>}

        {preview.isError && <button type="button" className="self-start text-xs text-fg-3 underline hover:text-fg" onClick={() => { void preview.refetch(); }}>Check the order again</button>}
        {owner.wrongChain && chainError && <p role="alert" className="text-xs text-ask">Network switch was not completed. Unlock your wallet and try again.</p>}
        {preview.data && preview.data.rejection !== 0 && parsed.ok && <p role="status" className="text-xs leading-relaxed text-ask">{REJECT[preview.data.rejection] || "This order cannot be admitted. Review your price, size, and collateral."}</p>}
        <TxFeedback state={tx.state} />
        {closeNote && <p role="status" className="text-xs text-signal-text">{closeNote}</p>}
        {!market?.active && market && (
          <p className="text-xs leading-relaxed text-fg-3">
            Orders open once governance activates this market and the signed index feed is running.
          </p>
        )}
      </div>
    </section>
  );
}
