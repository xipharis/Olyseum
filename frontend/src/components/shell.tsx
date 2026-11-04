"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { useHead } from "@/lib/reads";
import { WalletButton } from "./wallet";
import { cx } from "./ui";
import { BrandImage } from "./brand-image";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/markets", label: "Markets", match: "/m/" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/resolution", label: "Resolution" },
  { href: "/docs", label: "Docs", match: "/docs/" },
];

function HeadIndicator() {
  const head = useHead();
  const stale = head.data ? Date.now() - head.data.at > 10_000 : false;
  const down = head.isError && !head.data;
  return (
    <span className="hidden items-center gap-1.5 text-xs text-fg-3 xl:flex" title="Connection to Monad testnet">
      <span className={cx("h-1.5 w-1.5 rounded-full", down ? "bg-ask" : stale ? "bg-fg-4" : "bg-bid")} aria-hidden />
      {down ? "RPC unreachable" : stale ? "RPC lagging" : "Monad testnet"}
    </span>
  );
}

/** Search that sends its query to the market board, which reads `?q=`. */
function HeaderSearch() {
  const router = useRouter();
  const path = usePathname();
  const [q, setQ] = useState("");
  useEffect(() => { if (path === "/markets") setQ(new URLSearchParams(window.location.search).get("q") ?? ""); }, [path]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    router.push(q.trim() ? `/markets?q=${encodeURIComponent(q.trim())}` : "/markets");
  };
  return (
    <form role="search" onSubmit={submit} className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-panel px-4 focus-within:bg-hover md:max-w-md">
      <Search size={16} className="shrink-0 text-fg-3" aria-hidden />
      <label htmlFor="header-search" className="sr-only">Search markets</label>
      <input id="header-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search markets"
        autoComplete="off" spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none" />
    </form>
  );
}

export function TopBar() {
  const path = usePathname();
  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4 px-4 md:gap-6 md:px-6">
        <Link href="/" className="flex shrink-0 items-center" aria-label="Osyleum home">
          <BrandImage />
        </Link>
        <div className="hidden min-w-0 flex-1 md:flex"><HeaderSearch /></div>
        <nav aria-label="Primary" className="hidden items-center gap-1 rounded-full bg-panel p-1 lg:flex">
          {NAV.map((n) => {
            const active = path === n.href || (n.match ? path.startsWith(n.match) : false);
            return (
              <Link key={n.label} href={n.href} aria-current={active ? (path === n.href ? "page" : "location") : undefined}
                className={cx("rounded-full px-4 py-2 text-sm transition-colors", active ? "bg-ground text-fg shadow-[0_1px_2px_rgb(0_0_0/8%)]" : "text-fg-3 hover:text-fg")}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <HeadIndicator />
          <ThemeToggle />
          <WalletButton />
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
        <div className="flex min-w-0 flex-1 md:hidden"><HeaderSearch /></div>
        {NAV.map((n) => {
          const active = path === n.href || (n.match ? path.startsWith(n.match) : false);
          return <Link key={n.label} href={n.href} className={cx("hidden shrink-0 rounded-full px-3 py-2 text-sm md:inline-flex", active ? "bg-panel text-fg" : "text-fg-3")}>{n.label}</Link>;
        })}
      </div>
      <nav aria-label="Sections" className="flex justify-around border-t border-line md:hidden">
        {NAV.map((n) => {
          const active = path === n.href || (n.match ? path.startsWith(n.match) : false);
          return <Link key={n.label} href={n.href} className={cx("flex min-h-11 flex-1 items-center justify-center text-xs", active ? "font-medium text-fg" : "text-fg-3")}>{n.label}</Link>;
        })}
      </nav>
    </header>
  );
}

/** Testnet stand-ins are disclosed, never dressed up as production (frontend.md R11). */
export function TestnetStrip() {
  return (
    <div className="border-b border-line bg-panel">
      <p className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-1.5 text-xs text-fg-3 md:px-6">
        <span className="font-medium text-signal-text">Testnet</span>
        <span>Collateral is a test token with no monetary value</span>
        <span aria-hidden className="max-md:hidden">·</span>
        <span className="max-md:hidden">Prices from Polymarket and Osyleum native (Kuru) books</span>
      </p>
    </div>
  );
}
