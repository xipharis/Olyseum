"use client";

import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Asterisk, Layers, Scale } from "lucide-react";
import { MarketBoard } from "./markets-index";
import { LoadingPanel } from "./feedback";

/** Grass-style pill button: label beside a round arrow chip. */
function PillLink({ href, children, tone = "dark" }: { href: string; children: React.ReactNode; tone?: "dark" | "light" }) {
  const dark = tone === "dark";
  return <Link href={href} className={`group inline-flex h-12 items-center gap-3 rounded-full pr-1.5 pl-6 text-[15px] transition-colors ${dark ? "bg-action text-on-action hover:bg-action-hover" : "bg-panel text-fg hover:bg-hover"}`}>
    {children}
    <span className={`flex h-9 w-9 items-center justify-center rounded-full ${dark ? "bg-ground text-fg" : "bg-fg text-ground"}`} aria-hidden>
      <ArrowRight size={16} className="ui-nudge" />
    </span>
  </Link>;
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-[1320px] gap-8 px-4 pt-14 pb-12 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-end md:px-6 md:pt-24 md:pb-16">
      <div>
        <p className="eyebrow inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden />Prediction markets on Monad</p>
        <h1 className="display mt-5 text-[clamp(2.75rem,6.2vw,5.25rem)] leading-[0.98] text-fg">Trade the odds on<br className="max-sm:hidden" /> what happens next.</h1>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <PillLink href="/markets">Browse markets</PillLink>
          <Link href="#how-it-works" className="inline-flex h-12 items-center rounded-full bg-panel px-6 text-[15px] text-fg hover:bg-hover">How it works</Link>
        </div>
      </div>
      <p className="max-w-md text-lg font-light leading-snug tracking-[-0.02em] text-fg-3 md:justify-self-end md:text-xl">
        Buy YES or NO on real questions. The price is the chance. Hold to the answer and every YES share pays 1, or add leverage and trade the move.
      </p>
    </section>
  );
}

const REASONS = [
  { icon: Asterisk, title: "Simple as YES or NO", body: "Every market is one question with a scheduled answer. Pick a side at the price you see.", dark: true },
  { icon: Layers, title: "Leverage when you want it", body: "Markets that allow it let you size up to the listed cap. An isolated reserve covers losses beyond your collateral, so you never owe a debt." },
  { icon: Scale, title: "Settled on chain", body: "The order book, margin and payout all live on Monad. A layered oracle decides the outcome, with disputes on record." },
];

function Reasons() {
  return (
    <section className="mx-auto max-w-[1320px] px-4 pt-24 md:px-6">
      <p className="eyebrow">Why Osyleum</p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <h2 className="display max-w-2xl text-[clamp(2rem,4vw,3rem)] leading-[1.05] text-fg">Three reasons to trade the question, not the noise.</h2>
        <PillLink href="/start">Get started</PillLink>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {REASONS.map(({ icon: Icon, title, body, dark }) => (
          <div key={title} className={`flex min-h-72 flex-col justify-between rounded-box p-7 ${dark ? "bg-ink text-ivory" : "bg-panel text-fg"}`}>
            <Icon size={28} strokeWidth={1.5} aria-hidden />
            <div>
              <h3 className="text-[26px] font-medium leading-tight tracking-[-0.03em]">{title}</h3>
              <p className={`mt-3 text-[15px] font-light leading-snug ${dark ? "text-ivory-3" : "text-fg-3"}`}>{body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  { n: "01", title: "Fund your wallet", body: "Log in with email or a wallet you already have, then get test collateral from the faucet." },
  { n: "02", title: "Pick a side", body: "Buy YES if you think it happens, NO if you think it won’t. 54¢ means a 54% chance." },
  { n: "03", title: "Sell any time, or hold", body: "Close early at the market price, or hold until the answer and claim 1 per winning share." },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-[1320px] scroll-mt-24 px-4 pt-24 md:px-6">
      <p className="eyebrow">How it works</p>
      <h2 className="display mt-4 max-w-2xl text-[clamp(2rem,4vw,3rem)] leading-[1.05] text-fg">From question to payout in three steps.</h2>
      <ol className="mt-10 grid gap-px overflow-hidden rounded-box bg-line md:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n} className="flex flex-col gap-10 bg-panel p-7">
            <span className="tnum text-sm text-fg-3">{s.n}</span>
            <div>
              <h3 className="text-[22px] font-medium tracking-[-0.03em] text-fg">{s.title}</h3>
              <p className="mt-2 text-[15px] font-light leading-snug text-fg-3">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-fg-4">Testnet: collateral is a test token, layer-one resolution runs on a single simulation node and disputes go to an Osyleum-run UMA sandbox.</p>
    </section>
  );
}

export function Landing() {
  return (
    <main>
      <Hero />
      <section className="mx-auto max-w-[1320px] px-4 md:px-6" aria-label="Markets">
        <Suspense fallback={<LoadingPanel label="Loading markets" />}><MarketBoard featured /></Suspense>
      </section>
      <Reasons />
      <HowItWorks />
    </main>
  );
}
