import "katex/dist/katex.min.css";
import { DOC_GROUPS, docHref } from "./_content";
import { DocsNav } from "./docs-nav";

const groups = DOC_GROUPS.map((g) => ({ title: g.title, pages: g.pages.map((p) => ({ href: docHref(p.slug), title: p.title })) }));

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-8 md:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 lg:py-12">
      <DocsNav groups={groups} />
      {children}
    </div>
  );
}
