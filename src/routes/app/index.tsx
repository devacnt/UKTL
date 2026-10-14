import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { EmptyState, PageHeader, Pill, ScoreBar, Section, StatCard, StatusPill } from "@/components/app/AppLayout";
import { getCandidateDetailFn, getCandidateProfileFn, getSwipeHistoryFn, listCandidatesFn } from "@/lib/functions";
import { myBookingsFn } from "@/lib/booking-functions";
import { inboxFn } from "@/lib/communication-functions";

/** A value, or null when that part of the account could not be loaded (shown as unavailable, never as zero). */
async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/app/")({
  beforeLoad: ({ context }) => {
    // Staff work from the staff dashboard, not the candidate one.
    if (context.session.isStaff) throw redirect({ to: "/admin" });
  },
  loader: async () => {
    // Every source is the signed-in candidate's own data; each loads independently.
    const [mine, profileData, history, bookings, inbox] = await Promise.all([
      listCandidatesFn(),
      settle(getCandidateProfileFn()),
      settle(getSwipeHistoryFn({ data: {} })),
      settle(myBookingsFn()),
      settle(inboxFn({ data: {} })),
    ]);
    const latest = mine[0] ?? null;
    const detail = latest ? await settle(getCandidateDetailFn({ data: { id: latest.id } })) : null;
    const now = Date.now();
    return {
      latest,
      matches: detail?.matches ?? [],
      profile: profileData?.profile ?? null,
      interested: history ? history.items.filter((i) => i.action === "interested").length : null,
      nextBooking: bookings ? (bookings.filter((b) => b.status === "confirmed" && b.starts_at > now).sort((a, b) => a.starts_at - b.starts_at)[0] ?? null) : undefined,
      unread: inbox ? inbox.messages.filter((m) => m.read_at === null).length : null,
    };
  },
  component: DashboardPage,
});

type Step = { title: string; body: string; done: boolean; busy?: boolean; locked?: boolean; to: string; params?: Record<string, string>; search?: Record<string, unknown>; cta: string; optional?: boolean };

const fmtWhen = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(ms);

function DashboardPage() {
  const { latest, matches, profile, interested, nextBooking, unread } = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  const firstName = (profile?.name ?? "").trim().split(/\s+/)[0] || null;
  const profileComplete = !!(profile?.name && profile?.phone && profile?.location && profile?.sector_preference);
  const parsed = latest?.status === "parsed";
  const processing = !!latest && !parsed && latest.status !== "failed";
  const top = matches.slice(0, 4);
  const strong = matches.filter((m) => m.score >= 70).length;

  const steps: Step[] = [
    {
      title: "Complete your profile",
      body: "Add your phone, location and preferred sector so consultants can reach you about the right roles.",
      done: profileComplete,
      to: "/app/profile",
      search: { edit: true },
      cta: profileComplete ? "Review profile" : "Complete profile",
    },
    {
      title: "Upload your CV",
      body: "PDF, Word or text. We read it and build a profile you can check.",
      done: !!latest,
      to: "/app/upload",
      cta: latest ? "Upload a new version" : "Upload CV",
    },
    {
      title: "Read your CV score and tips",
      body: processing ? "Your CV is being assessed. This page updates when it's ready." : "See what's strong, what's missing and exactly how to improve it.",
      done: parsed && latest?.quality_score != null,
      busy: processing,
      locked: !latest,
      to: latest ? "/app/candidates/$id" : "/app/upload",
      params: latest ? { id: latest.id } : undefined,
      cta: "View score",
    },
    {
      title: "Explore your job matches",
      body: "Swipe through roles ranked for you. Say you're interested and a consultant reviews your profile for it.",
      done: (interested ?? 0) > 0,
      to: "/app/discover",
      cta: "See matches",
    },
    {
      title: "Talk to a consultant",
      body: "Optional: book a free call about your CV, your matches or a workplace question.",
      done: !!nextBooking,
      to: "/app/consultations",
      cta: nextBooking ? "Manage booking" : "Book a call",
      optional: true,
    },
  ];
  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done && !s.busy && !s.locked) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={
          <>
            {firstName ? `Welcome, ${firstName}` : "Welcome"}
            <em className="not-italic italic font-normal text-ink-soft">.</em>
          </>
        }
        lede={
          doneCount === required.length
            ? "You're all set up. New matches appear here as roles come in."
            : `You've completed ${doneCount} of ${required.length} setup steps.${session.email ? ` Signed in as ${session.email}.` : ""}`
        }
        actions={
          next ? (
            <Link
              to={next.to}
              params={next.params as never}
              search={next.search as never}
              className="text-[13px] px-4 py-2 border border-ink bg-ink text-paper rounded-full hover:opacity-90 transition-opacity"
            >
              Next: {next.title.toLowerCase()} →
            </Link>
          ) : undefined
        }
      />

      {doneCount < required.length && (
        <section aria-labelledby="setup-heading" className="border border-rule rounded-lg bg-paper mb-10">
          <div className="px-5 pt-5 pb-4 border-b border-rule flex flex-wrap items-center justify-between gap-3">
            <h2 id="setup-heading" className="font-display text-xl text-ink" style={{ fontVariationSettings: '"opsz" 72' }}>
              Get set up
            </h2>
            <div className="flex items-center gap-3 min-w-[180px]" aria-label={`${doneCount} of ${required.length} steps complete`}>
              <div className="flex-1 h-1.5 rounded-full bg-paper-deep overflow-hidden">
                <div className="h-full bg-accent rounded-full" style={{ width: `${(doneCount / required.length) * 100}%` }} />
              </div>
              <span className="font-mono text-[11px] text-ink-mute tabular-nums">
                {doneCount}/{required.length}
              </span>
            </div>
          </div>
          <ol className="divide-y divide-rule">
            {steps.map((s, i) => (
              <li key={s.title} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4">
                <span
                  aria-hidden
                  className={`w-7 h-7 shrink-0 rounded-full border grid place-items-center font-mono text-[11px] ${
                    s.done ? "bg-accent border-accent text-paper" : s.busy ? "border-accent text-accent" : "border-rule text-ink-mute"
                  }`}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <div className="flex-1 min-w-[220px]">
                  <p className={`text-[15px] ${s.done ? "text-ink-mute line-through decoration-ink-mute/40" : "text-ink"}`}>
                    {s.title}
                    {s.optional && <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute">optional</span>}
                    {s.busy && <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-accent">in progress</span>}
                  </p>
                  {!s.done && <p className="text-[13px] text-ink-soft mt-0.5">{s.body}</p>}
                </div>
                {s.locked && !s.done && <span className="text-[12px] text-ink-mute">After upload</span>}
                {!s.busy && !s.locked && (
                  <Link
                    to={s.to}
                    params={s.params as never}
                    search={s.search as never}
                    className={`text-[12px] px-3.5 py-1.5 rounded-full border transition-colors ${
                      !s.done && s === next ? "border-ink bg-ink text-paper hover:opacity-90" : "border-rule text-ink-soft hover:border-ink hover:text-ink"
                    }`}
                  >
                    {s.cta} →
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="CV score" value={latest?.quality_score ?? "—"} sub={latest?.quality_score != null ? "out of 100" : latest ? "being assessed" : "upload a CV"} />
        <StatCard label="Matched roles" value={latest ? matches.length : "—"} sub={latest ? `${strong} strong matches` : "after your CV is read"} accent={strong > 0} />
        <StatCard label="Roles you're interested in" value={interested ?? "—"} sub={interested === null ? "unavailable right now" : "shared with consultants"} />
        <StatCard
          label="Next consultation"
          value={nextBooking ? fmtWhen(nextBooking.starts_at) : "—"}
          sub={nextBooking === undefined ? "unavailable right now" : nextBooking ? "UK time" : "none booked"}
        />
      </div>

      {latest && (
        <>
          <Section
            title="Your CV"
            actions={
              <Link to="/app/candidates/$id" params={{ id: latest.id }} className="text-[12px] text-ink-mute hover:text-ink transition-colors">
                Score breakdown and tips →
              </Link>
            }
          >
            <div className="border border-rule rounded-lg p-5 flex flex-wrap items-center justify-between gap-6">
              <div className="min-w-0">
                <div className="font-medium text-[15px] text-ink">{latest.name ?? "Your profile"}</div>
                <div className="text-[13px] text-ink-mute mt-0.5">{[latest.headline, latest.location].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <div className="flex items-center gap-4">
                <StatusPill status={latest.status} />
                {latest.quality_score != null && (
                  <div className="w-48">
                    <ScoreBar value={latest.quality_score} />
                  </div>
                )}
              </div>
            </div>
          </Section>

          <Section
            title="Best-matched roles"
            actions={
              <Link to="/app/discover" className="text-[12px] text-ink-mute hover:text-ink transition-colors">
                See all matches →
              </Link>
            }
          >
            {top.length === 0 ? (
              <EmptyState
                title={parsed ? "No matches yet" : "Matches appear once your CV is read"}
                body="We match you against every open role as soon as your CV is processed, and again whenever new roles are posted."
                action={
                  <Link to="/app/jobs" className="text-[13px] px-4 py-2 border border-rule rounded-full hover:border-ink transition-colors">
                    Browse all open roles
                  </Link>
                }
              />
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {top.map((m) => (
                  <Link
                    key={m.job_id}
                    to="/app/jobs/$id"
                    params={{ id: m.job_id }}
                    className="group border border-rule rounded-lg p-5 hover:border-ink/30 hover:bg-paper-deep/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <div className="font-medium text-[14px] text-ink truncate">{m.job.title}</div>
                        <div className="text-[13px] text-ink-mute mt-0.5 truncate">
                          {m.job.company ?? "Confidential"}
                          {m.job.location ? ` · ${m.job.location}` : ""}
                        </div>
                      </div>
                      {m.job.seniority && <Pill>{m.job.seniority}</Pill>}
                    </div>
                    <ScoreBar value={m.score} />
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      <Section title="More for you">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { to: "/app/jobs", title: "All open roles", body: "Search every role we're recruiting for, by skill or location." },
            { to: "/app/hr", title: "HR & employment law", body: "Ask a workplace question and get reviewed guidance." },
            {
              to: "/app/messages",
              title: unread ? `Messages · ${unread} new` : "Messages",
              body: "Updates from your consultant, and your email preferences.",
            },
            { to: "/app/profile", title: "Profile & privacy", body: "Your details, data download and account requests." },
          ].map((c) => (
            <Link key={c.to} to={c.to} className="border border-rule rounded-lg p-5 hover:border-ink/30 hover:bg-paper-deep/40 transition-colors">
              <p className="text-[14px] text-ink font-medium">{c.title}</p>
              <p className="text-[13px] text-ink-soft mt-1">{c.body}</p>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
