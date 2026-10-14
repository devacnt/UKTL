import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteLayout, Wrap, PageHero } from "@/components/site/Layout";
import { Reveal } from "@/components/site/Reveal";

export const Route = createFileRoute("/sectors")({
  head: () => ({
    meta: [
      { title: "Roles we recruit for — UK Talent Link" },
      { name: "description", content: "The sectors and roles UK Talent Link recruits for across the UK and the Gulf — led by construction, engineering and technology. Upload your CV free to be matched." },
      { property: "og:title", content: "Roles we recruit for — UK Talent Link" },
      { property: "og:description", content: "Construction, engineering, technology and more, across the UK and the Gulf. Upload your CV free to be matched." },
    ],
  }),
  component: SectorsPage,
});

const sectors = [
  {
    num: "01",
    name: "Construction & Engineering",
    sub: "Major projects · Civil engineering · Built environment",
    focus: true,
    body: "From site teams to commercial leadership, construction and engineering is where many of our live roles sit — across UK projects and the large infrastructure programmes in the Gulf. If you've delivered projects, managed contracts or run sites, upload your CV and we'll show you where you fit.",
    roles: ["Quantity Surveyor", "Site Manager", "Project Manager", "Civil / Structural Engineer", "Contracts Director", "Commercial Director"],
    note: "Strong demand for UK- and Ireland-trained professionals on Saudi Vision 2030 and UAE infrastructure projects.",
  },
  {
    num: "02",
    name: "Technology & Digital",
    sub: "Software · Data · Infrastructure · Product",
    focus: true,
    body: "Engineers, data specialists, product people and technology leaders. We recruit for businesses building and scaling software in the UK, and for UK-headquartered companies expanding into the Gulf. Matching is based on your actual skills and experience, not just your job title.",
    roles: ["Software Engineer", "Data Engineer", "DevOps / Platform Engineer", "Product Manager", "Engineering Manager", "CTO / VP Engineering"],
    note: "Roles range from individual contributors to technology leadership.",
  },
  {
    num: "03",
    name: "Energy & Infrastructure",
    sub: "Oil & gas · Renewables · Large-scale project delivery",
    body: "Senior technical and commercial roles on energy and infrastructure projects, particularly across the Gulf, for people who understand large-scale delivery and working across jurisdictions.",
    roles: ["Project Director", "Commercial Manager", "HSE Director", "Contracts Director", "Country Director", "Head of Business Development"],
    note: "Particular experience in UAE, KSA and Oman-based energy roles.",
  },
  {
    num: "04",
    name: "Financial Services",
    sub: "Asset management · Private banking · Insurance · FinTech",
    body: "Finance, compliance and operations roles with regulated wealth managers, insurers and FinTech businesses, for people comfortable working in FCA-supervised environments.",
    roles: ["Finance Director", "Head of Compliance", "Chief Risk Officer", "Investment Manager", "Head of Operations", "Chief Financial Officer"],
    note: "We are not affiliated with any FCA-regulated entity and do not provide financial advice.",
  },
  {
    num: "05",
    name: "Legal & Professional Services",
    sub: "Law firms · Consulting · Accountancy · Advisory",
    body: "Business-services and leadership roles in law firms, consultancies and advisory practices — operations, business development, knowledge management and in-house legal leadership.",
    roles: ["General Counsel", "Head of Legal", "Chief Operating Officer", "Business Development Director", "Head of Knowledge Management", "Managing Partner"],
    note: "We do not place fee-earners into regulated legal roles requiring SRA authorisation.",
  },
  {
    num: "06",
    name: "Healthcare & Life Sciences",
    sub: "Private healthcare · MedTech · Pharmaceutical leadership",
    body: "Non-clinical leadership roles with hospital groups, diagnostics firms and pharmaceutical businesses in the UK and the Gulf, for people who know regulated, reputation-sensitive environments.",
    roles: ["Chief Operating Officer", "Head of Clinical Operations", "Head of Regulatory Affairs", "Commercial Director", "Chief Financial Officer", "Medical Director"],
    note: "We do not place clinical practitioners or any roles requiring GMC, NMC or GPhC registration.",
  },
];

function SectorsPage() {
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Sectors"
        title={
          <>
            Roles we{" "}
            <em className="italic text-accent" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}>
              recruit for.
            </em>
          </>
        }
        lede="Most of our live roles are in construction, engineering and technology, across the UK and the Gulf. We also recruit for leadership and specialist roles in four more sectors. Upload your CV once and you're matched against all of them."
      />

      {/* Sector deep-dives */}
      <section className="py-16 md:py-24">
        <Wrap>
          <div className="space-y-0">
            {sectors.map((s, i) => (
              <Reveal key={s.num}>
                <article className="grid md:grid-cols-[3fr_5fr] gap-10 lg:gap-20 py-14 md:py-20 border-t border-rule">
                  <div>
                    <div className="font-mono text-[10px] tracking-[0.18em] text-ink-mute mb-5 flex items-center gap-3">
                      {s.num}
                      {s.focus && (
                        <span className="tracking-[0.12em] uppercase text-accent border border-accent/30 rounded-full px-2 py-0.5">
                          Most live roles
                        </span>
                      )}
                    </div>
                    <h2
                      className="font-display font-light leading-[1] tracking-[-0.025em] mb-3"
                      style={{ fontSize: "clamp(24px, 3vw, 42px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
                    >
                      {s.name}
                    </h2>
                    <div className="font-mono text-[11px] text-ink-mute tracking-[0.06em] leading-[1.7]">
                      {s.sub}
                    </div>

                    <div className="mt-8">
                      <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-mute mb-3">
                        Typical roles
                      </div>
                      <ul className="list-none p-0 m-0 space-y-1.5">
                        {s.roles.map((r) => (
                          <li key={r} className="text-[14px] text-ink-soft flex items-center gap-2.5">
                            <span className="w-2 h-px bg-accent flex-shrink-0" />
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-8">
                    <div>
                      <p className="text-[16px] text-ink-soft leading-[1.65] m-0 mb-6">{s.body}</p>
                      <p className="text-[13px] text-ink-mute leading-[1.6] m-0 pl-4 border-l-2 border-rule">{s.note}</p>
                    </div>
                    <div>
                      <Link
                        to="/auth/register"
                        className="inline-flex items-center gap-2 text-[13px] text-ink-soft hover:text-ink transition-colors border-b border-transparent hover:border-ink pb-0.5"
                      >
                        Register to be matched →
                      </Link>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </Wrap>
      </section>

      {/* Cross-sector note */}
      <section className="bg-paper-deep py-16 md:py-20 border-t border-rule">
        <Wrap>
          <Reveal>
            <div className="grid md:grid-cols-[1fr_2fr] gap-16 items-start">
              <div>
                <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute mb-4">
                  — Not listed?
                </div>
                <h3
                  className="font-display font-light leading-[1] tracking-[-0.025em]"
                  style={{ fontSize: "clamp(24px, 3vw, 40px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
                >
                  Don't see your sector?
                </h3>
              </div>
              <div className="space-y-5">
                <p className="text-[15px] text-ink-soft leading-[1.65]">
                  Upload your CV anyway. You'll still get your CV score and improvement tips, and you'll be matched automatically whenever a role that fits you comes in.
                </p>
                <p className="text-[15px] text-ink-soft leading-[1.65]">
                  Not sure whether your experience fits? Send us a question and a consultant will point you in the right direction.
                </p>
                <Link
                  to="/contact"
                  className="text-[13px] text-ink-soft hover:text-ink transition-colors border-b border-transparent hover:border-ink pb-0.5 inline-block"
                >
                  Ask us a question →
                </Link>
              </div>
            </div>
          </Reveal>
        </Wrap>
      </section>

      {/* CTA */}
      <section className="py-16 border-t border-rule">
        <Wrap>
          <Reveal>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <h3
                  className="font-display font-light leading-[1.1] tracking-[-0.02em] mb-2"
                  style={{ fontSize: "clamp(22px, 2.5vw, 32px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
                >
                  Work in one of these sectors?
                </h3>
                <p className="text-[15px] text-ink-soft m-0">Upload your CV free and see the roles you match today.</p>
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
