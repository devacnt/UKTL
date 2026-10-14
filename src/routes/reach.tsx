import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteLayout, Wrap, PageHero } from "@/components/site/Layout";
import { Reveal } from "@/components/site/Reveal";

export const Route = createFileRoute("/reach")({
  head: () => ({
    meta: [
      { title: "Reach — UK Talent Link" },
      {
        name: "description",
        content:
          "UK roles and Gulf roles from one recruitment firm. One free account opens up opportunities in London and across the GCC.",
      },
      { property: "og:title", content: "Reach — UK Talent Link" },
      {
        property: "og:description",
        content:
          "UK roles and Gulf roles from one recruitment firm. One free account opens up opportunities in both.",
      },
    ],
  }),
  component: ReachPage,
});

const markets = [
  { city: "London", coords: "51.5°N · 0.1°W", note: "Headquarters · Chancery Lane" },
  { city: "Dubai", coords: "25.2°N · 55.2°E", note: "GCC operations" },
  { city: "Abu Dhabi", coords: "24.5°N · 54.4°E", note: "Public & energy sector" },
  { city: "Riyadh", coords: "24.7°N · 46.7°E", note: "Saudi mandates" },
  { city: "Doha", coords: "25.3°N · 51.5°E", note: "Selected engagements" },
  { city: "Manama", coords: "26.2°N · 50.6°E", note: "Financial services" },
];

function ReachPage() {
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Reach"
        title={
          <>
            UK roles.{" "}
            <em className="italic text-accent" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}>
              Gulf roles.
            </em>{" "}
            One account.
          </>
        }
        lede="We recruit for employers in the UK and across the Gulf, so one free account opens up opportunities in both. Thinking about a move between them? Our consultants know what it really involves — from relocation to contracts under local law."
      />

      <section className="py-16 md:py-24">
        <Wrap>
          <Reveal>
            <p className="text-[17px] text-ink-soft leading-[1.65] max-w-[62ch] pb-16 border-b border-rule mb-16 m-0">
              London is our home. The Gulf is where many of the biggest construction, engineering and technology programmes are being delivered — and where UK-trained professionals are in demand. Whichever side you're on, you deal with one team.
            </p>
          </Reveal>

          <Reveal>
            <h3
              className="font-display font-light leading-[1.05] tracking-[-0.02em] max-w-[20ch] mb-12"
              style={{ fontSize: "clamp(26px, 3.4vw, 40px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
            >
              Where our{" "}
              <em className="italic text-accent" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}>
                roles are.
              </em>
            </h3>
          </Reveal>

          <Reveal stagger>
            <ul className="list-none p-0 m-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-rule border border-rule">
              {markets.map((m) => (
                <li key={m.city} className="bg-paper p-8 hover:bg-paper-deep transition-colors">
                  <div className="font-mono text-[11px] text-ink-mute tracking-[0.1em] uppercase">
                    {m.coords}
                  </div>
                  <h4
                    className="font-display font-light text-[34px] tracking-[-0.02em] leading-[1] m-0 mt-3"
                    style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50' }}
                  >
                    {m.city}
                  </h4>
                  <p className="text-ink-soft text-sm mt-3 m-0">{m.note}</p>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal>
            <div className="mt-16 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <h3
                  className="font-display font-light leading-[1.1] tracking-[-0.02em] mb-2"
                  style={{ fontSize: "clamp(22px, 2.5vw, 32px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
                >
                  Open to a move?
                </h3>
                <p className="text-[15px] text-ink-soft m-0">Upload your CV free and see UK and Gulf roles you match.</p>
              </div>
              <Link
                to="/auth/register"
                className="text-[13px] px-5 py-2.5 border border-ink bg-ink text-paper rounded-full hover:opacity-80 transition-opacity whitespace-nowrap shrink-0"
              >
                Register free →
              </Link>
            </div>
          </Reveal>
        </Wrap>
      </section>
    </SiteLayout>
  );
}
