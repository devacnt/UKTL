import type { ReactNode } from "react";
import { SiteLayout, Wrap } from "./Layout";

export type LegalSection = { id: string; title: string; body: ReactNode };

/** Shared layout for the privacy and terms pages: header, contents list and readable sections. */
export function LegalPage({ eyebrow, title, lede, sections }: { eyebrow: string; title: string; lede: ReactNode; sections: LegalSection[] }) {
  return (
    <SiteLayout>
      <Wrap className="pt-[120px] md:pt-[150px] pb-20">
        <header className="max-w-[760px] mb-12 md:mb-16">
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-ink-mute mb-5 flex items-center gap-3">
            <span aria-hidden className="w-6 h-px bg-ink-mute" />
            {eyebrow}
          </p>
          <h1
            className="font-display font-light tracking-[-0.03em] text-ink text-balance"
            style={{ fontSize: "clamp(38px, 5.5vw, 68px)", lineHeight: 1.02, fontVariationSettings: '"opsz" 144, "SOFT" 50' }}
          >
            {title}
          </h1>
          <div className="text-[17px] leading-[1.65] text-ink-soft mt-6 max-w-[62ch]">{lede}</div>
        </header>

        <div className="grid lg:grid-cols-[220px_minmax(0,1fr)] gap-10 lg:gap-16 border-t border-rule pt-10">
          <nav aria-label="On this page" className="lg:sticky lg:top-28 self-start">
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-mute mb-3">On this page</p>
            <ol className="space-y-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-[14px] text-ink-soft hover:text-ink transition-colors">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="max-w-[68ch] space-y-12">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-28">
                <h2 className="font-display text-[26px] tracking-[-0.02em] text-ink mb-3" style={{ fontVariationSettings: '"opsz" 72' }}>
                  {s.title}
                </h2>
                <div className="text-[16px] leading-[1.7] text-ink-soft space-y-3 [&_a]:underline [&_a]:text-ink [&_a:hover]:opacity-80">{s.body}</div>
              </section>
            ))}
          </div>
        </div>
      </Wrap>
    </SiteLayout>
  );
}
