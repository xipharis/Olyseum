import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOC_PAGES, docHref } from "../_content";

type Params = { params: Promise<{ slug?: string[] }> };

const find = async ({ params }: Params) => {
  const slug = (await params).slug ?? [];
  const index = slug.length > 1 ? -1 : DOC_PAGES.findIndex((p) => p.slug === (slug[0] ?? ""));
  return index < 0 ? undefined : { page: DOC_PAGES[index], prev: DOC_PAGES[index - 1], next: DOC_PAGES[index + 1] };
};

export const dynamicParams = false;
export const generateStaticParams = () => DOC_PAGES.map((p) => ({ slug: p.slug ? [p.slug] : [] }));

export async function generateMetadata(props: Params): Promise<Metadata> {
  const found = await find(props);
  return found ? { title: found.page.slug ? `${found.page.title} · Docs` : "Docs", description: found.page.summary } : {};
}

export default async function DocPage(props: Params) {
  const found = await find(props);
  if (!found) notFound();
  const { page, prev, next } = found;
  return (
    <div className="grid min-w-0 gap-10 xl:grid-cols-[minmax(0,1fr)_200px]">
      <article className="min-w-0 max-w-3xl">
        <p className="label text-signal-text">// {page.group}</p>
        <h1 className="mt-3 text-[clamp(1.75rem,4vw,2.75rem)] leading-tight font-semibold tracking-[-0.03em] text-fg">{page.title}</h1>
        <p className="mt-3 text-base leading-relaxed text-fg-2">{page.summary}</p>
        <div className="mt-10 space-y-12">
          {page.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-28">
              <h2 className="group text-lg font-semibold text-fg">
                <a href={`#${s.id}`} className="hover:text-signal-text">{s.title}<span className="ml-2 text-fg-4 opacity-0 group-hover:opacity-100" aria-hidden>#</span></a>
              </h2>
              <div className="doc-prose mt-4 space-y-4 text-sm leading-7 text-fg-2">{s.body}</div>
            </section>
          ))}
        </div>
        <nav aria-label="Previous and next" className="mt-16 grid gap-3 border-t border-line pt-6 sm:grid-cols-2">
          {prev ? <Link href={docHref(prev.slug)} className="frame block p-4 hover:bg-hover"><span className="label text-fg-3">← Previous</span><span className="mt-1 block text-sm text-fg">{prev.title}</span></Link> : <span />}
          {next && <Link href={docHref(next.slug)} className="frame block p-4 text-right hover:bg-hover"><span className="label text-fg-3">Next →</span><span className="mt-1 block text-sm text-fg">{next.title}</span></Link>}
        </nav>
      </article>
      <nav aria-label="On this page" className="hidden self-start xl:sticky xl:top-24 xl:block">
        <p className="label mb-3 text-fg-3">On this page</p>
        <ul className="space-y-1">
          {page.sections.map((s) => <li key={s.id}><a href={`#${s.id}`} className="block py-1 text-xs leading-5 text-fg-3 hover:text-signal-text">{s.title}</a></li>)}
        </ul>
      </nav>
    </div>
  );
}
