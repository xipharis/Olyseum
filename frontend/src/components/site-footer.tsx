"use client";

import Link from "next/link";
import { BrandImage } from "./brand-image";

export const COOKIE_NOTICE_EVENT = "eros:cookie-notice";

const LINKS = [
  { href: "/markets", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/start", label: "Get started" },
  { href: "/docs", label: "Docs" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function SiteFooter() {
  return <footer className="mt-24 border-t border-line">
    <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-12 md:grid-cols-[1fr_auto] md:px-6">
      <div className="max-w-sm">
        <Link href="/" aria-label="Osyleum home"><BrandImage /></Link>
        <p className="mt-4 text-sm font-light leading-relaxed text-fg-3">Trade the odds on what happens next. Every market is a YES / NO question with a scheduled answer, settled on Monad.</p>
      </div>
      <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm text-fg-2 sm:grid-cols-3">
        {LINKS.map((l) => <Link key={l.href} className="inline-flex min-h-9 items-center hover:text-fg" href={l.href}>{l.label}</Link>)}
        <button type="button" className="inline-flex min-h-9 cursor-pointer items-center text-left hover:text-fg" onClick={() => window.dispatchEvent(new Event(COOKIE_NOTICE_EVENT))}>Cookies & storage</button>
      </nav>
    </div>
    <div className="border-t border-line">
      <p className="mx-auto flex max-w-[1320px] flex-wrap justify-between gap-2 px-4 py-5 text-xs text-fg-3 md:px-6">
        <span>© 2026 Osyleum</span><span>Monad testnet · test collateral, no monetary value</span>
      </p>
    </div>
  </footer>;
}
