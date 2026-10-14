import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteLayout, Wrap, PageHero } from "@/components/site/Layout";
import { Reveal } from "@/components/site/Reveal";

export const Route = createFileRoute("/approach")({
  head: () => ({
    meta: [
      { title: "How it works — UK Talent Link" },
      { name: "description", content: "How UK Talent Link works: a free CV score and honest tips, matching to real roles, and consultants who get in touch when you're a strong fit." },
      { property: "og:title", content: "How it works — UK Talent Link" },
      { property: "og:description", content: "A free CV score, honest tips, matching to real roles, and consultants who get in touch when you're a strong fit." },
    ],
  }),
  component: ApproachPage,
});

const principles = [
  {
    idx: "i.",
    tag: "Free for candidates",
    title: "You never pay to find work through us.",
    body: "Employers pay for recruitment, so everything we offer candidates is free: your account, your CV score and tips, your job matches, and general guidance on your rights at work. There's no premium tier and nothing to unlock.",
    detail: "UK rules stop recruitment agencies charging people for finding them work — and we wouldn't want to anyway.",
  },
  {
    idx: "ii.",
    tag: "Honest",
    title: "We tell you where you stand.",
    body: "Most job searches go quiet and you never find out why. Your CV score breaks down how your CV reads across contact details, experience, skills and education, and each section comes with specific suggestions you can act on straight away.",
    detail: "Upload an improved version whenever you like; your score and matches update with it.",
  },
  {
    idx: "iii.",
    tag: "Private",
    title: "Your CV is yours.",
    body: "Your CV is stored privately and accessed only through your account or by authorised UK Talent Link staff. It is never published or sold on, and you can see and edit the profile we build from it.",
    detail: "Staff access is restricted to named team members who sign in with two-step verification.",
  },
  {
    idx: "iv.",
    tag: "Human",
    title: "Software ranks the matches. People make the call.",
    body: "Matching tells us which roles fit your experience and skills, and shows you the reasons. But consultants review the strongest matches and decide who to speak to — you're a person, not a keyword count.",
    detail: "Register interest in the roles you like and it shows up for the consultant working on that role.",
  },
  {
    idx: "v.",
    tag: "Your rights at work",
    title: "Guidance when you need it.",
    body: "Questions about a contract, pay, holiday or dismissal don't wait for a job change. Your account includes clear, practical answers grounded in ACAS guidance and UK employment law, and you can book a consultation if you need more.",
    detail: "Guidance for candidates is general information based on ACAS advice and UK law — not legal representation.",
  },
];

const process = [
  {
    n: "01",
    title: "Create your account",
    body: "Sign up with your email in a minute. Your account keeps your CV, score, matches and questions in one private place.",
  },
  {
    n: "02",
    title: "Upload your CV",
    body: "PDF, Word or plain text, up to 10 MB. We read it and build a structured profile you can check and correct.",
  },
  {
    n: "03",
    title: "Improve your score",
    body: "See your score out of 100 and specific tips for each section. Update your CV and upload again whenever you like.",
  },
  {
    n: "04",
    title: "Choose your roles",
    body: "Browse the roles you match, see why, and register interest in the ones you want with a single swipe.",
  },
  {
    n: "05",
    title: "Speak to a consultant",
    body: "When you're a strong fit for a role, a consultant gets in touch to talk it through with you.",
  },
];

function ApproachPage() {
  return (
    <SiteLayout>
      <PageHero
        eyebrow="How it works"
        title={
          <>
            Recruitment that{" "}
            <em className="italic text-accent" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}>
              works for you.
            </em>
          </>
        }
        lede="Our job is to put good people in good roles. That means understanding what you want, being honest about where you fit, and staying with you until you're in the right job."
      />

      {/* Principles */}
      <section className="py-20 md:py-28">
        <Wrap>
          <Reveal>
            <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute mb-10">
              — What you can expect from us
            </div>
          </Reveal>
          <Reveal stagger>
            <ul className="list-none p-0 m-0">
              {principles.map((it, i) => (
                <li
                  key={i}
                  className={`grid md:grid-cols-[64px_1fr_2fr] gap-x-10 gap-y-4 items-start py-10 border-t border-rule ${i === principles.length - 1 ? "border-b" : ""}`}
                >
                  <div className="font-mono text-[12px] text-ink-mute pt-1.5">{it.idx}</div>
                  <div>
                    <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-mute mb-3">
                      {it.tag}
                    </div>
                    <h3
                      className="font-display font-light leading-[1.05] tracking-[-0.02em] m-0"
                      style={{ fontSize: "clamp(22px, 3vw, 38px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
                    >
                      {it.title}
                    </h3>
                  </div>
                  <div>
                    <p className="m-0 text-[15px] text-ink-soft leading-[1.65] mb-4">{it.body}</p>
                    <p className="m-0 text-[14px] text-ink-mute leading-[1.6] pl-4 border-l-2 border-rule">{it.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </Wrap>
      </section>

      {/* Process */}
      <section className="bg-paper-deep py-20 md:py-28 border-t border-rule">
        <Wrap>
          <Reveal>
            <div className="grid md:grid-cols-[1fr_2fr] gap-16 items-end mb-16">
              <div>
                <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute mb-4">
                  — Your journey
                </div>
                <h2
                  className="font-display font-light leading-[1] tracking-[-0.03em]"
                  style={{ fontSize: "clamp(28px, 4vw, 52px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
                >
                  From upload to first conversation.
                </h2>
              </div>
              <p className="text-[15px] text-ink-soft leading-[1.65] max-w-[52ch]">
                Five steps, all free. You stay in control throughout: you choose which roles you're interested in, and you can update your CV whenever you like.
              </p>
            </div>
          </Reveal>

          <Reveal stagger>
            <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-px bg-rule">
              {process.map((p) => (
                <div key={p.n} className="bg-paper-deep p-7">
                  <div className="font-mono text-[10px] tracking-[0.18em] text-ink-mute mb-5">{p.n}</div>
                  <h4
                    className="font-display font-light leading-tight mb-3"
                    style={{ fontSize: "clamp(18px, 1.8vw, 22px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
                  >
                    {p.title}
                  </h4>
                  <p className="text-[13px] text-ink-soft leading-[1.6] m-0">{p.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </Wrap>
      </section>

      {/* Who we work with */}
      <section className="py-20 md:py-28 border-t border-rule">
        <Wrap>
          <div className="grid md:grid-cols-[1fr_2fr] gap-16 items-start">
            <Reveal>
              <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute mb-4">
                — Who we work with
              </div>
              <h2
                className="font-display font-light leading-[1] tracking-[-0.03em]"
                style={{ fontSize: "clamp(28px, 4vw, 52px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
              >
                People looking for their next move.
              </h2>
            </Reveal>

            <Reveal>
              <div className="space-y-8">
                <p className="text-[16px] text-ink-soft leading-[1.65]">
                  We recruit for roles across the UK and the Gulf. Whether you're early in your career or stepping up to leadership, the aim is the same: a role you're still glad you took a year later.
                </p>
                <div className="grid sm:grid-cols-3 gap-6">
                  {[
                    { title: "Construction & engineering", body: "Site, project, commercial and engineering professionals — where many of our live roles sit." },
                    { title: "Technology & digital", body: "Engineers, data specialists, product people and technology leaders." },
                    { title: "UK ↔ Gulf moves", body: "UK-trained professionals moving to the Gulf, and people coming back to the UK." },
                  ].map((c) => (
                    <div key={c.title} className="border border-rule rounded-sm p-5">
                      <h4 className="font-display font-light text-lg tracking-[-0.01em] mb-2">{c.title}</h4>
                      <p className="text-[13px] text-ink-soft leading-[1.6] m-0">{c.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
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
                  Ready to see where you stand?
                </h3>
                <p className="text-[15px] text-ink-soft m-0">Upload your CV free and get your score today.</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Link
                  to="/auth/register"
                  className="text-[13px] px-5 py-2.5 border border-ink bg-ink text-paper rounded-full hover:opacity-80 transition-opacity whitespace-nowrap"
                >
                  Register free →
                </Link>
              </div>
            </div>
          </Reveal>
        </Wrap>
      </section>
    </SiteLayout>
  );
}
