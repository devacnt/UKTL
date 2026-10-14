import {ProfileEditor} from "@/components/app/ProfileEditor";
import {MatchEvidence} from "@/components/app/MatchEvidence";
import { createFileRoute, Link, notFound, useRouteContext, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  PageHeader,
  Pill,
  ScoreBar,
  Section,
  StatusPill,
} from "@/components/app/AppLayout";
import {
  getAnonymisedCandidateFn,
  getCandidateDetailFn,
  rematchCandidateFn,
} from "@/lib/functions";
import { STAGE_LABELS, stageTone } from "@/lib/stages";
import { CandidateOutreach } from "@/components/app/CandidateOutreach";

export const Route = createFileRoute("/app/candidates/$id")({
  loader: async ({ params }) => {
    const detail = await getCandidateDetailFn({ data: { id: params.id } });
    if (!detail) throw notFound();
    return detail;
  },
  component: CandidateDetailPage,
});

function CandidateDetailPage() {
  const { candidate: c, matches, processing, canEdit } = Route.useLoaderData();
  const { session } = useRouteContext({ from: "__root__" });
  const isStaff = session.isStaff;
  const router = useRouter();
  const [editing,setEditing]=useState(false);
  const [emailing, setEmailing] = useState(false);
  const processingState=processing?.status;
  useEffect(()=>{
    if(!processingState || !['pending','running'].includes(processingState) || editing) return;
    const timer=setInterval(()=>{if(document.visibilityState==='visible') void router.invalidate();},10000);
    return ()=>clearInterval(timer);
  },[processingState,editing,router]);
  const [rematching, setRematching] = useState(false);
  const [anonView, setAnonView] = useState(false);
  const [anonProfile, setAnonProfile] = useState<null | {
    name: string | null;
    location: string | null;
    headline: string | null;
    summary: string | null;
    skills: Array<{ skill: string }>;
  }>(null);

  async function onRematch() {
    setRematching(true);
    try {
      const { count,queued } = await rematchCandidateFn({ data: { id: c.id } });
      toast.success(queued ? "Assessment and match refresh queued" : `Re-matched against ${count} open mandate${count === 1 ? "" : "s"}`);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-match failed");
    } finally {
      setRematching(false);
    }
  }

  async function onAnonymise() {
    if (anonView) {
      setAnonView(false);
      return;
    }
    const result = await getAnonymisedCandidateFn({ data: { id: c.id } });
    if (result) {
      setAnonProfile({
        name: result.name ?? null,
        location: result.location ?? null,
        headline: result.headline ?? null,
        summary: result.summary ?? null,
        skills: result.skills ?? [],
      });
      setAnonView(true);
    }
  }

  const displayName = anonView && anonProfile ? anonProfile.name : c.name;
  const displayLocation =
    anonView && anonProfile ? anonProfile.location : c.location;

  return (
    <>
      <PageHeader
        eyebrow={isStaff ? `Candidate — ${c.id}` : "Your CV"}
        title={
          <>
            {displayName ?? "(unnamed)"}
            {c.seniority && (
              <span className="ml-4 text-ink-soft italic font-normal text-3xl">
                {c.seniority}
              </span>
            )}
          </>
        }
        lede={c.headline ?? undefined}
        actions={
          <>
            {canEdit && <button onClick={()=>setEditing(true)} className="text-[13px] px-4 py-2 border border-rule rounded-full">Correct profile</button>}
            {c.source_r2_key && (
              <a
                href={`/api/cv/${c.id}`}
                download
                className="text-[13px] px-[16px] py-2 border border-rule rounded-full hover:border-ink"
              >
                Download CV
              </a>
            )}
            {isStaff ? (
              <>
                <button
                  onClick={() => setEmailing((v) => !v)}
                  className="text-[13px] px-[16px] py-2 border border-rule rounded-full hover:border-ink"
                >
                  Email candidate
                </button>
                <button
                  onClick={onAnonymise}
                  className="text-[13px] px-[16px] py-2 border border-rule rounded-full hover:border-ink"
                >
                  {anonView ? "Show full profile" : "Anonymise for client"}
                </button>
                <button
                  onClick={onRematch}
                  disabled={rematching || c.status !== "parsed"}
                  className="text-[13px] px-[16px] py-2 border border-ink bg-ink text-paper rounded-full disabled:opacity-40"
                >
                  {rematching ? "Re-matching…" : "Re-match mandates"}
                </button>
              </>
            ) : (
              <Link
                to="/app/upload"
                className="text-[13px] px-[16px] py-2 border border-ink bg-ink text-paper rounded-full"
              >
                Upload a new version
              </Link>
            )}
          </>
        }
      />

      {processing && ['pending','running','failed'].includes(processing.status) && <div role="status" className="border border-rule rounded p-4 mb-6 text-sm">
        {processing.status==='running'?'Your CV assessment is processing.':processing.status==='pending'?'Your CV assessment is queued. You can leave this page and return later.':'Processing could not complete. Please contact the team or upload your CV again.'}
        <p className="text-ink-soft mt-1">Attempt {processing.attempts} of 3. Previous match scores are hidden until the current assessment is ready.</p>
      </div>}
      {isStaff && emailing && <CandidateOutreach candidateId={c.id} name={c.name} onClose={() => setEmailing(false)} />}
      {editing && <ProfileEditor id={c.id} onClose={()=>setEditing(false)} onSaved={()=>{setEditing(false);toast.success('Corrections saved; assessment refresh queued');void router.invalidate();}}/>}
      <div className="grid md:grid-cols-[2fr_1fr] gap-10">
        <div>
          <div className="border border-rule rounded-md p-6 bg-paper">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <Detail label="Email" value={anonView ? "[redacted]" : c.email} />
              <Detail label="Phone" value={anonView ? "[redacted]" : c.phone} />
              <Detail label="Location" value={displayLocation} />
              <Detail label="Work authorisation" value={c.work_authorization} />
              <Detail
                label="Total YoE"
                value={
                  c.total_years_experience != null
                    ? `${c.total_years_experience}`
                    : null
                }
              />
              <Detail
                label="Status"
                value={<StatusPill status={c.status} />}
              />
            </div>
          </div>

          {c.summary && (
            <Section title="Summary">
              <p className="text-sm leading-[1.65] text-ink-soft max-w-[68ch]">
                {anonView && anonProfile?.summary ? anonProfile.summary : c.summary}
              </p>
            </Section>
          )}

          {c.skills.length > 0 && (
            <Section title={`Skills (${c.skills.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {c.skills.map((s) => (
                  <Pill key={s.skill}>
                    {s.skill}
                    {s.years_experience != null && (
                      <span className="text-ink-mute ml-1">· {s.years_experience}y</span>
                    )}
                  </Pill>
                ))}
              </div>
            </Section>
          )}

          {c.experience.length > 0 && (
            <Section title="Experience">
              <ol className="border-l border-rule pl-6 space-y-6">
                {c.experience.map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[29px] top-2 h-1.5 w-1.5 rounded-full bg-ink" />
                    <div className="flex items-baseline justify-between gap-4">
                      <div>
                        <div className="font-display text-lg">
                          {e.title ?? "—"}
                        </div>
                        <div className="text-sm text-ink-soft">
                          {e.company ?? ""}
                          {e.location ? ` · ${e.location}` : ""}
                        </div>
                      </div>
                      <div className="font-mono text-xs text-ink-mute tabular-nums whitespace-nowrap">
                        {e.start_date ?? "?"} — {e.is_current ? "present" : e.end_date ?? "?"}
                      </div>
                    </div>
                    {e.description && (
                      <p className="text-sm text-ink-soft mt-2 leading-[1.6]">
                        {e.description}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {c.education.length > 0 && (
            <Section title="Education">
              <ul className="space-y-2 text-sm">
                {c.education.map((e, i) => (
                  <li key={i} className="flex justify-between gap-6">
                    <div>
                      <span className="font-medium">
                        {anonView ? "[redacted]" : e.institution}
                      </span>
                      {e.degree && (
                        <span className="text-ink-soft">
                          {" "}
                          — {e.degree}
                          {e.field ? `, ${e.field}` : ""}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-ink-mute tabular-nums">
                      {e.start_year ?? ""} — {e.end_year ?? ""}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {c.parse_error && (
            <Section title="Parse error">
              <pre className="text-xs bg-red-50 border border-red-200 text-red-800 rounded-md p-4 whitespace-pre-wrap">
                {c.parse_error}
              </pre>
            </Section>
          )}
        </div>

        <aside className="space-y-6">
          <div className="border border-rule rounded-md p-6 bg-paper">
            <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute">
              CV Quality
            </div>
            {c.quality_score != null ? (
              <>
                <div
                  className="font-display font-light mt-3"
                  style={{
                    fontSize: "44px",
                    fontVariationSettings: '"opsz" 144, "SOFT" 50',
                    color: c.quality_score >= 75 ? "oklch(0.45 0.12 155)" : c.quality_score >= 50 ? "oklch(0.55 0.12 80)" : "oklch(0.55 0.18 25)",
                  }}
                >
                  {c.quality_score}
                  <span className="text-ink-mute font-body text-base font-normal ml-1">/100</span>
                </div>

                {/* Score breakdown by category */}
                {c.score_breakdown && (
                  <div className="mt-5 space-y-3">
                    {(
                      [
                        ["contact_information", "Contact info"],
                        ["experience", "Experience"],
                        ["skills", "Skills"],
                        ["education", "Education"],
                        ["clarity", "Clarity and structure"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <div className="flex justify-between mb-1">
                          <span className="text-[11px] text-ink-mute">{label}</span>
                          <span className="font-mono text-[11px] tabular-nums text-ink-soft">
                            {(c.score_breakdown as Record<string, number>)[key] ?? "Not assessed"}
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-paper-deep overflow-hidden">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${(c.score_breakdown as Record<string, number>)[key] ?? 0}%`, opacity: 0.7 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {c.quality_notes.length > 0 && (
                  <ul className="mt-4 text-xs text-ink-soft space-y-1.5 list-disc list-inside">
                    {c.quality_notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="text-sm text-ink-soft mt-3">Not yet scored.</div>
            )}
          </div>

          {/* CV Improvement Report */}
          {c.improvement_report && (
            <div className="border border-rule rounded-md p-6 bg-paper">
              <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute mb-4">
                Improvement report
              </div>
              {c.improvement_report.overall && (
                <p className="text-sm text-ink leading-relaxed mb-5">
                  {(c.improvement_report as Record<string, string>).overall}
                </p>
              )}
              <div className="space-y-4">
                {(
                  [
                    ["contact_information", "Contact info"],
                    ["experience", "Experience"],
                    ["skills", "Skills"],
                    ["education", "Education"],
                    ["clarity", "Clarity and structure"],
                  ] as const
                ).map(([key, label]) => {
                  const text = (c.improvement_report as Record<string, string>)[key];
                  if (!text) return null;
                  return (
                    <div key={key}>
                      <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-mute mb-1">
                        {label}
                      </div>
                      <p className="text-xs text-ink-soft leading-relaxed">{text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border border-rule rounded-md p-6 bg-paper">
            <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute mb-4">
              {isStaff ? "Matched mandates" : "Your best-matched jobs"}
            </div>
            {matches.length === 0 ? (
              <div className="text-sm text-ink-soft">
                {isStaff ? 'No matches yet — run "Re-match" to compute.' : "No matching roles yet. We'll match you as new jobs are posted."}
              </div>
            ) : (
              <ul className="space-y-4">
                {matches.slice(0, 6).map((m) => (
                  <li key={m.job_id}>
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <Link
                        to="/app/jobs/$id"
                        params={{ id: m.job_id }}
                        className="text-sm font-medium hover:underline"
                      >
                        {m.job.title}
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        {isStaff && m.stage !== "matched" && (
                          <Pill tone={stageTone(m.stage)}>{STAGE_LABELS[m.stage]}</Pill>
                        )}
                        <div className="font-mono text-sm tabular-nums">{m.score}</div>
                      </div>
                    </div>
                    <div className="text-xs text-ink-soft mb-1.5">
                      {m.job.company ?? "Confidential"} · {m.job.location ?? ""}
                    </div>
                    <ScoreBar value={m.score} />
                    <MatchEvidence candidateId={c.id} jobId={m.job_id} />
                    {m.missing_skills.length > 0 && (
                      <div className="mt-2 text-xs text-ink-mute">
                        Gaps: {m.missing_skills.slice(0, 3).join(", ")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode | null | undefined;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink-mute">
        {label}
      </div>
      <div className="mt-1">
        {value == null || value === "" ? (
          <span className="text-ink-mute">—</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}
