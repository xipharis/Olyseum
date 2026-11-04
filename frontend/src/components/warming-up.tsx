"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";

const PHRASES = [
  "Warming up prices",
  "Starting the market services",
  "Indexing on-chain data",
  "Reading the order book",
  "Syncing with Monad testnet",
  "Checking the latest block",
];

/**
 * Shown wherever trading data has not arrived yet: one short phrase per second, plus a steady note.
 * Screen readers get the stable label once; the rotating phrase is visual only.
 */
export function WarmingUp({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % PHRASES.length), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div role="status" className={cx("flex flex-col items-center gap-2 text-center", className)}>
      <span className="sr-only">Loading market data. Give it some more time.</span>
      <p aria-hidden className={cx("flex items-center gap-2 font-medium text-fg", compact ? "text-xs" : "text-sm")}>
        <span className="warming-pulse h-2 w-2 shrink-0 rounded-sm bg-signal" />
        <span key={index} className="warming-phrase tnum">{PHRASES[index]}…</span>
      </p>
      <p aria-hidden className={cx("leading-relaxed text-fg-3", compact ? "text-2xs" : "text-xs")}>
        Give it some more time — Osyleum allows leveraged trades on events.
      </p>
    </div>
  );
}
