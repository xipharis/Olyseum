"use client";

import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useSwitchChain } from "wagmi";
import { formatEther, type Address } from "viem";
import { ArrowRight, Check } from "lucide-react";
import { chain } from "@/config/chain";
import { isSpotOnly } from "@/config/native";
import { client } from "@/lib/public-client";
import { marketOptions, useHead, useTrader, type MarketSnapshot } from "@/lib/reads";
import { useMarketList } from "@/lib/market-list";
import { useTx } from "@/lib/tx";
import { atomsToUsdc, shortAddr } from "@/lib/units";
import { chipFor } from "./market-parts";
import { useLoginAction, useOwner } from "./wallet";
import { Button, cx } from "./ui";
import { TxFeedback } from "./tx-feedback";

const faucetAbi = [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }] as const;
const GAS_READY_WEI = 2n * 10n ** 17n; // 0.2 MON covers a first funded trade with room to spare.

type Step = { title: string; done: boolean; summary?: string; body: React.ReactNode };

function ActionLink({ href, children, external = false }: { href: string; children: React.ReactNode; external?: boolean }) {
  const cls = "ui-button group inline-flex min-h-10 items-stretch self-start overflow-hidden rounded-control";
  const inner = <>
    <span className="ui-arrow flex w-10 items-center justify-center bg-signal text-on-signal" aria-hidden><ArrowRight size={14} strokeWidth={2} /></span>
    <span className="ui-sweep label flex items-center bg-action px-4 text-on-action group-hover:bg-action-hover">{children}</span>
  </>;
  return external ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{inner}</a> : <Link href={href} className={cls}>{inner}</Link>;
}

export function StartJourney() {
  const owner = useOwner();
  const login = useLoginAction();
  const { switchChain } = useSwitchChain();
  const head = useHead();
  const block = head.data?.number;
  const tx = useTx();
  const busy = tx.state.status === "pending" || tx.state.status === "sent";

  // The market to trade first: a live perp if one is trading, else the first listed perp.
  const perps = useMarketList().markets.filter((mk) => !mk.archived && !isSpotOnly(mk.engine));
  const reads = useQueries({ queries: perps.map((mk) => marketOptions(mk.engine, block)) });
  const target = perps.find((_, i) => { const d = reads[i]?.data as MarketSnapshot | undefined; return d && chipFor(d).label === "Trading"; }) ?? perps[0];
  const trader = useTrader((target?.engine ?? "0x0000000000000000000000000000000000000000") as Address, target ? owner.address : undefined, target ? block : undefined);
  const t = trader.data;
  const gas = useQuery({ queryKey: ["native-balance", owner.address], enabled: !!owner.address, refetchInterval: 10_000,
    queryFn: () => client.getBalance({ address: owner.address! }) });

  const loggedIn = owner.connected && !owner.wrongChain;
  const gasReady = loggedIn && gas.data !== undefined && gas.data >= GAS_READY_WEI;
  const usdcReady = gasReady && !!t && t.wallet + t.free + (t.account?.preview.cashQ ?? 0n) / 10n ** 18n >= 1_000000n;
  const funded = usdcReady && !!t?.traderId;
  const trading = funded && !!t?.account && t.account.preview.positionLots !== 0n;
  const symbol = t?.assets.symbol ?? "tUSDC";

  const steps: Step[] = [
    {
      title: "Log in", done: loggedIn,
      summary: owner.address ? `Signed in as ${shortAddr(owner.address)}` : undefined,
      body: <>
        <p>Use email or Google and Olyseum creates a wallet for you, or connect a wallet you already have. Trades in a Privy wallet are signed instantly, without pop-ups.</p>
        {owner.connected && owner.wrongChain
          ? <Button variant="primary" size="lg" arrow className="self-start" onClick={() => switchChain({ chainId: chain.id })}>Switch to Monad testnet</Button>
          : <Button variant="primary" size="lg" arrow className="self-start" disabled={!login.ready} onClick={() => login.login()}>Log in</Button>}
      </>,
    },
    {
      title: "Get test MON for gas", done: gasReady,
      summary: gas.data !== undefined ? `${Number(formatEther(gas.data)).toFixed(2)} MON for gas` : undefined,
      body: <>
        <p>Every transaction on Monad needs a little MON. Test MON is free: paste your address into the Monad faucet, then come back. This step ticks itself when it arrives.</p>
        {owner.address && <p className="break-all rounded-md bg-panel px-3 py-2 tnum text-fg">{owner.address}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <ActionLink href="https://faucet.monad.xyz/" external>Open the Monad faucet</ActionLink>
          {owner.address && <Button variant="ghost" onClick={() => { void navigator.clipboard?.writeText(owner.address!); }}>Copy address</Button>}
        </div>
        <p className="text-fg-3">Balance now: {gas.data !== undefined ? `${Number(formatEther(gas.data)).toFixed(3)} MON` : "reading…"} · needs 0.2</p>
      </>,
    },
    {
      title: `Get test ${symbol}`, done: usdcReady,
      summary: t ? `${atomsToUsdc(t.wallet + t.free, 2)} ${symbol} available` : undefined,
      body: <>
        <p>{symbol} is the test dollar you trade with. It has no monetary value. One click mints 1,000 to your wallet.</p>
        <Button variant="primary" size="lg" arrow className="self-start" disabled={busy || !t || !owner.address}
          onClick={() => owner.address && t && tx.run(owner.address, [{ address: t.assets.token, abi: faucetAbi, functionName: "mint", args: [owner.address, 1000_000000n], label: `get 1,000 ${symbol}` }])}>
          {busy ? "Minting…" : `Get 1,000 ${symbol}`}
        </Button>
        <TxFeedback state={tx.state} />
      </>,
    },
    {
      title: "Make your first trade", done: trading,
      summary: trading && t?.account ? "Position open" : undefined,
      body: <>
        <p>{target ? <>Open <span className="text-fg">{target.short}</span>. </> : null}Pick <span className="text-fg">Long YES</span> if you think the odds will rise or <span className="text-fg">Short YES</span> if you think they will fall, enter how many claims, and choose your leverage.</p>
        <p>The order form works out the collateral that trade needs and adds it from your wallet in the same click. It lists every step before anything is signed.</p>
        {target && <ActionLink href={`/m/${target.engine}`}>Open the market</ActionLink>}
      </>,
    },
    {
      title: "Watch your money move", done: false,
      body: <>
        <p>Your money in a market is its collateral plus or minus how the trade is doing. It moves with the price; the market page and your portfolio show the value, the profit or loss since you funded, your leverage and how much room you have before liquidation.</p>
        <div className="flex flex-wrap gap-3">
          <ActionLink href="/portfolio">See your portfolio</ActionLink>
          {target && <Link href={`/m/${target.engine}`} className="label inline-flex min-h-10 items-center gap-1.5 text-fg-2 hover:text-fg">Back to the market <ArrowRight size={13} aria-hidden /></Link>}
        </div>
      </>,
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  const doneCount = trading ? steps.length : steps.filter((s) => s.done).length;

  return (
    <main className="mx-auto w-full max-w-[880px] px-4 pt-10 pb-16 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-xl">
          <h1 className="display text-5xl leading-none text-fg">Start</h1>
          <p className="mt-3 text-sm leading-relaxed text-fg-2">Five steps, about three minutes. Everything runs on Monad testnet with free test money, so nothing here can cost you.</p>
        </div>
        <Link href="/markets" className="label inline-flex min-h-11 items-center gap-1.5 text-fg-3 hover:text-fg">I&apos;ll explore on my own <ArrowRight size={13} aria-hidden /></Link>
      </div>

      <div className="mt-10" aria-label={`Step ${Math.min(current < 0 ? steps.length : current + 1, steps.length)} of ${steps.length}`}>
        <p className="label flex justify-between text-fg-3"><span>{trading ? "All set" : `Step ${current + 1} of ${steps.length}`}</span><span className="tnum">{doneCount}/{steps.length}</span></p>
        <ol className="mt-2 grid grid-cols-5 gap-1" aria-hidden>
          {steps.map((s, i) => <li key={s.title} className={cx("h-1 rounded-full", s.done || trading ? "bg-fg" : i === current ? "bg-signal" : "bg-line-strong")} />)}
        </ol>
      </div>

      {trading && <div className="frame mt-6 bg-panel p-5">
        <p className="text-lg font-semibold text-fg">You&apos;re trading.</p>
        <p className="mt-1 text-sm text-fg-2">Your money now moves with the market. Check it any time from the market page or your portfolio.</p>
      </div>}

      <ol className="mt-6 flex flex-col gap-3">
        {steps.map((s, i) => {
          const open = i === current || (trading && i === steps.length - 1);
          return <li key={s.title} aria-current={i === current ? "step" : undefined}
            className={cx("frame bg-ground", open ? "border-fg-3" : "", !s.done && !open && "opacity-60")}>
            <div className="flex items-center gap-4 px-5 py-4">
              <span aria-hidden className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold tnum",
                s.done ? "bg-fg text-ground" : open ? "bg-signal text-on-signal" : "shadow-[inset_0_0_0_1px_var(--color-line-strong)] text-fg-3")}>
                {s.done ? <Check size={14} strokeWidth={3} /> : i + 1}
              </span>
              <h2 className={cx("min-w-0 flex-1 font-semibold", open ? "text-lg text-fg" : "text-sm text-fg-2")}>{s.title}<span className="sr-only">{s.done ? " (done)" : open ? " (current step)" : ""}</span></h2>
              {s.done && s.summary && <span className="hidden text-xs tnum text-fg-3 sm:inline">{s.summary}</span>}
            </div>
            {open && <div className="flex flex-col gap-3 px-5 pb-5 pl-16 text-sm leading-relaxed text-fg-2 max-sm:pl-5">{s.body}</div>}
          </li>;
        })}
      </ol>
    </main>
  );
}
