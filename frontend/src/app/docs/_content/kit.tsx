import katex from "katex";
import Link from "next/link";
import type { ReactNode } from "react";

export type DocSection = { id: string; title: string; body: ReactNode };
export type DocPage = { slug: string; title: string; summary: string; sections: DocSection[] };
export type DocGroup = { title: string; pages: DocPage[] };

/** An aside inside a section: a plain note, or a warning about something that can cost you. */
export function Note({ tone = "note", title, children }: { tone?: "note" | "warn"; title?: string; children: ReactNode }) {
  return (
    <aside className={`rounded-[var(--radius-control)] border-l-2 bg-panel px-4 py-3 ${tone === "warn" ? "border-signal" : "border-line-strong"}`}>
      <p className={`label mb-1 ${tone === "warn" ? "text-signal-text" : "text-fg-3"}`}>{title ?? (tone === "warn" ? "Warning" : "Note")}</p>
      <div className="space-y-2 text-sm leading-7 text-fg-2">{children}</div>
    </aside>
  );
}

/** A plain table: the first row is the header. */
export function Table({ rows }: { rows: ReactNode[][] }) {
  const [head, ...body] = rows;
  return (
    <div className="overflow-x-auto rounded-[var(--radius-box)] border border-line-strong">
      <table className="w-full min-w-[480px] text-left text-xs leading-6">
        <thead><tr>{head.map((h, i) => <th key={i} className="label border-b border-line-strong px-3 py-2 font-medium text-fg-3">{h}</th>)}</tr></thead>
        <tbody>{body.map((row, r) => <tr key={r} className="border-b border-line last:border-0">{row.map((c, i) => <td key={i} className="px-3 py-2 align-top text-fg-2 [&:first-child]:text-fg">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** Framed link cards, used on the overview page. */
export function Cards({ items }: { items: { href: string; title: string; text: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((c) => (
        <Link key={c.href} href={c.href} className="frame group block bg-panel p-4 !no-underline hover:bg-hover">
          <span className="text-sm font-semibold text-fg">{c.title} <span className="text-signal-text transition-transform group-hover:translate-x-0.5">→</span></span>
          <span className="mt-1 block text-xs leading-6 text-fg-3">{c.text}</span>
        </Link>
      ))}
    </div>
  );
}

const tex = (source: string, displayMode: boolean) => ({ __html: katex.renderToString(source, { displayMode, throwOnError: true, strict: "error" }) });

/** A formula in TeX, typeset as display math and set apart from the prose. */
export function Formula({ tex: source }: { tex: string }) {
  return <div className="overflow-x-auto rounded-[var(--radius-control)] border border-line bg-panel px-4 py-1 text-sm text-fg" dangerouslySetInnerHTML={tex(source, true)} />;
}

/** An inline TeX expression inside prose or a table cell. */
export function Tex({ children }: { children: string }) {
  return <span dangerouslySetInnerHTML={tex(children, false)} />;
}
