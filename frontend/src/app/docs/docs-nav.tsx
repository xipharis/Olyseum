"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

type NavGroup = { title: string; pages: { href: string; title: string }[] };

function Links({ groups, path }: { groups: NavGroup[]; path: string }) {
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="label mb-2 text-fg-3">{g.title}</p>
          <ul className="space-y-0.5 border-l border-line">
            {g.pages.map((p) => {
              const active = path === p.href;
              return (
                <li key={p.href}>
                  <Link href={p.href} aria-current={active ? "page" : undefined}
                    className={cx("-ml-px flex min-h-9 items-center border-l-2 pl-3 text-xs transition-colors duration-150", active ? "border-signal text-fg" : "border-transparent text-fg-3 hover:border-line-strong hover:text-fg")}>
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Sidebar on desktop; a collapsible menu above the page on smaller screens. */
export function DocsNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const current = groups.flatMap((g) => g.pages).find((p) => p.href === path);
  return (
    <>
      <nav aria-label="Documentation" className="hidden self-start lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pb-8">
        <Links groups={groups} path={path} />
      </nav>
      {/* Keyed by path so the menu closes after navigating. */}
      <details key={path} className="frame lg:hidden">
        <summary className="label flex min-h-11 cursor-pointer items-center justify-between px-4 text-fg-2">
          <span>Docs menu</span><span className="normal-case tracking-normal text-fg-3">{current?.title}</span>
        </summary>
        <nav aria-label="Documentation" className="border-t border-line px-4 py-4"><Links groups={groups} path={path} /></nav>
      </details>
    </>
  );
}
