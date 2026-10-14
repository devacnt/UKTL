import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteLayout, Wrap, PageHero } from "@/components/site/Layout";
import { Reveal } from "@/components/site/Reveal";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "What we offer — UK Talent Link" },
      {
        name: "description",
        content:
          "Everything UK Talent Link offers candidates is free: a CV score, specific tips to improve it, matching to the roles we're recruiting for, workplace guidance and a consultant when you're a strong fit.",
      },
      { property: "og:title", content: "What we offer — UK Talent Link" },
      {
        property: "og:description",
        content: "A free CV score, improvement tips, matched roles, workplace guidance and a real consultant — all free.",
      },
    ],
  }),
  component: ServicesPage,
});

const offers = [
  {
    num: "/ 01",
    eyebrow: "Know where you stand",
    title: "A CV score out of 100.",
    body: "Your CV is read and scored across the four things recruiters look at first: your contact details, your experience, your skills and your education. You see the overall score and the score for each section, so you know exactly what's working and what isn't.",
    points: [
      "Overall score out of 100",
      "Separate scores for contact details, experience, skills and education",
      "A structured profile built from your CV that you can check and correct",
      "Upload a new version any time — your score updates with it",
    ],
    anchor: "cv-score",
  },
  {
    num: "/ 02",
    eyebrow: "Make it stronger",
    title: "Specific ways to improve your CV.",
    body: "Generic advice like \"quantify your achievements\" doesn't help much. For each section of your CV you get specific, practical suggestions, plus an overall summary of the change that would make the biggest difference.",
    points: [
      "Section-by-section suggestions written for your CV",
      "The top priority to fix first",
      "Re-upload as often as you like",
      "Your tips stay private to your account",
    ],
    anchor: "cv-tips",
  },
  {
    num: "/ 03",
    eyebrow: "Find where you fit",
    title: "Matched to the roles we're recruiting for.",
    body: "Your CV is matched against every open role we're recruiting for, across the UK and the Gulf. Each match comes with a fit score and the reasons behind it — the skills you have, the ones you're missing, and how your experience lines up. Tell us which roles interest you with a single swipe.",
    points: [
      "A fit score for every open role",
      "The reasons behind each match",
      "Register interest in the roles you want",
      "Matches refresh as new roles come in",
    ],
    anchor: "matching",
  },
  {
    num: "/ 04",
    eyebrow: "Know your rights",
    title: "Guidance on your rights at work.",
    body: "Questions about your contract, pay, holiday, a disciplinary or dismissal? Search our library of topics or ask a question and get a clear answer grounded in ACAS guidance and UK employment law. If you need more, you can book a consultation.",
    points: [
      "A library of common workplace topics",
      "Answers grounded in ACAS guidance and UK law",
      "Your questions stay private to your account",
      "Book a consultation when you need more",
    ],
    note: "This is general information, not legal advice or representation.",
    anchor: "workplace-guidance",
  },
  {
    num: "/ 05",
    eyebrow: "Talk to a person",
    title: "A consultant when you're a strong fit.",
    body: "Software does the matching; people make the decisions. Our consultants review the strongest matches for each role, and when you're a strong fit they'll get in touch to talk it through — the role, the employer and what the move would involve, including relocating to or from the Gulf.",
    points: [
      "Consultants review the strongest matches",
      "A real conversation, not an automated email",
      "Support with UK ↔ Gulf moves",
      "Straight answers if a role isn't right for you",
    ],
    anchor: "consultants",
  },
];

function ServicesPage() {
  return (
    <SiteLayout>
      <PageHero
        eyebrow="What we offer"
        title={
          <>
            Everything we offer you is{" "}
            <em className="italic text-accent" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}>
              free.
            </em>
          </>
        }
        lede="Create an account, upload your CV once, and you get all of this — your score, ways to improve it, the roles you match, guidance on your rights at work, and a consultant when you're a strong fit."
      />

      <section className="py-16 md:py-24">
        <Wrap>
          {offers.map((o) => (
            <Reveal key={o.anchor}>
              <article
                id={o.anchor}
                className="grid md:grid-cols-[5fr_7fr] gap-10 lg:gap-20 py-16 md:py-20 border-t border-rule"
              >
                <div className="md:sticky md:top-28 md:self-start">
                  <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-ink-mute">
                    {o.num} · {o.eyebrow}
                  </div>
                  <h2
                    className="font-display font-light leading-[1] tracking-[-0.025em] mt-5"
                    style={{ fontSize: "clamp(28px, 3.5vw, 50px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
                  >
                    {o.title}
                  </h2>
                </div>

                <div>
                  <p className="text-[16px] text-ink-soft leading-[1.65] m-0 mb-8">{o.body}</p>
                  <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-mute mb-4">
                    What you get
                  </div>
                  <ul className="list-none p-0 m-0 grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
                    {o.points.map((p) => (
                      <li
                        key={p}
                        className="text-[14px] text-ink-soft pl-5 relative before:absolute before:left-0 before:top-[10px] before:w-2.5 before:h-px before:bg-accent"
                      >
                        {p}
                      </li>
                    ))}
                  </ul>
                  {o.note && (
                    <p className="text-[13px] text-ink-mute leading-[1.6] m-0 mt-6 pl-4 border-l-2 border-rule">{o.note}</p>
                  )}
                </div>
              </article>
            </Reveal>
          ))}
        </Wrap>
      </section>

      <section className="bg-paper-deep py-16 border-t border-rule">
        <Wrap>
          <Reveal>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <h3
                  className="font-display font-light leading-[1.1] tracking-[-0.02em] mb-2"
                  style={{ fontSize: "clamp(22px, 2.5vw, 32px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
                >
                  See where you stand today.
                </h3>
                <p className="text-[15px] text-ink-soft m-0">Create a free account and upload your CV — it takes a couple of minutes.</p>
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
