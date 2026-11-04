"use client";

import { useRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { Tone } from "@/lib/enums";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

/** Roving keyboard selection for tab lists and button-based radio groups. */
export function selectionKeys(event: KeyboardEvent<HTMLElement>) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled), [role="radio"]:not(:disabled)')];
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + items.length) % items.length;
  items[next].focus();
  items[next].click();
}

/** Tabular number whose changed characters flip into place; unchanged columns never move. */
export function Num({ value, className }: { value: string; className?: string }) {
  const prev = useRef(value);
  const old = prev.current;
  prev.current = value;
  return (
    <span className={cx("tnum whitespace-nowrap", className)}>
      <span className="sr-only">{value}</span>
      {Array.from(value).map((ch, i) => {
        const changed = old !== value && old[i] !== ch;
        return (
          <span key={changed ? `${i}-${ch}-${value}` : `${i}`} aria-hidden className={changed ? "digit-new" : undefined}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}

const TONE: Record<Tone, string> = {
  signal: "text-signal-text shadow-[inset_0_0_0_1px_var(--color-signal)]",
  warn: "text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]",
  neutral: "text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]",
  bid: "text-bid shadow-[inset_0_0_0_1px_var(--color-bid)]",
  ask: "text-ask shadow-[inset_0_0_0_1px_var(--color-ask)]",
  muted: "text-fg-3 shadow-[inset_0_0_0_1px_var(--color-line)]",
};

export function Chip({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", TONE[tone], className)}>
      {children}
    </span>
  );
}

/** Region header: a mono label row (e.g. ORDER.TICKET) ruled by a hard line. */
export function RegionHead({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex h-12 shrink-0 items-center justify-between gap-3 px-4 shadow-[inset_0_-1px_0_var(--color-line)]", className)}>
      <h2 className="text-sm font-medium text-fg">{title}</h2>
      {children && <div className="flex items-center gap-2 text-xs text-fg-3">{children}</div>}
    </div>
  );
}

/** Section divider: `// SECTION: NAME ———— 004`. The number is a real ordinal of the page's sections. */
export function SectionRule({ name, index }: { name: string; index: number }) {
  return (
    <div className="eyebrow flex items-center gap-4">
      <span className="tnum">{String(index).padStart(2, "0")}</span>
      <span>{name.replace(/_/g, " ")}</span>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "bid" | "ask" | "yes" | "no";
  size?: "sm" | "md" | "lg";
  /** Prefix the label with the Signal arrow square (primary actions). */
  arrow?: boolean;
};

const VARIANT = {
  primary: "bg-action text-on-action hover:bg-action-hover disabled:bg-press disabled:text-fg-4",
  secondary: "bg-panel text-fg hover:bg-hover active:bg-press disabled:text-fg-4",
  ghost: "text-fg-2 hover:bg-hover hover:text-fg active:bg-press disabled:text-fg-4",
  bid: "bg-bid text-on-bid hover:brightness-110 disabled:bg-press disabled:text-fg-4",
  ask: "bg-ask text-on-ask hover:brightness-110 disabled:bg-press disabled:text-fg-4",
  yes: "bg-yes text-on-yes hover:brightness-110 disabled:bg-press disabled:text-fg-4",
  no: "bg-no text-on-no hover:brightness-110 disabled:bg-press disabled:text-fg-4",
};
const SIZE = { sm: "h-8 px-3.5", md: "h-9 px-4", lg: "h-12 px-5" };

export function Button({ variant = "secondary", size = "md", arrow, className, children, ...rest }: BtnProps) {
  const base = "inline-flex select-none items-center justify-center gap-2 rounded-full text-sm font-medium tracking-[-0.01em] transition-colors duration-150 disabled:cursor-not-allowed";
  if (arrow) {
    // Grass pill: the label, then a round arrow chip in the button's inverse colour.
    return (
      <button data-variant={variant} className={cx("ui-button group", base, VARIANT[variant], SIZE[size], "pr-1.5", className)} {...rest}>
        <span className="flex-1 text-center">{children}</span>
        <span className="flex aspect-square h-[calc(100%-10px)] shrink-0 items-center justify-center rounded-full bg-ground/90 text-fg group-disabled:bg-ground/60 group-disabled:text-fg-4" aria-hidden>
          <ArrowRight size={14} strokeWidth={2} className="ui-nudge" />
        </span>
      </button>
    );
  }
  return (
    <button data-variant={variant} className={cx("ui-button", base, VARIANT[variant], SIZE[size], className)} {...rest}>
      {children}
    </button>
  );
}

export function Stat({ label, children, tone }: { label: string; children: ReactNode; tone?: "signal" | "bid" | "ask" | "warn" }) {
  const t = tone ? { signal: "text-signal-text", bid: "text-bid", ask: "text-ask", warn: "text-fg" }[tone] : "text-fg";
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="label text-fg-3">{label}</span>
      <span className={cx("text-sm font-medium", t)}>{children}</span>
    </div>
  );
}

/**
 * Unknown is stated as a mark, never as zero (frontend.md R4): an outlined box (Signal-outlined for
 * the mark price) followed by a short reason.
 */
export function Unavailable({ reason, short = "unavailable", signal = false }: { reason: string; short?: string; signal?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-3" title={reason}>
      <span
        className={cx("h-2.5 w-2.5 shrink-0", signal ? "shadow-[inset_0_0_0_1px_var(--color-signal)]" : "shadow-[inset_0_0_0_1px_var(--color-fg-3)]")}
        aria-hidden
      />
      <span className="text-sm">{short}</span>
    </span>
  );
}

export function Row({ k, v, hint }: { k: ReactNode; v: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-xs" title={hint}>
      <dt className="text-fg-3">{k}</dt>
      <dd className="tnum text-right text-fg">{v}</dd>
    </div>
  );
}
