import { createFileRoute, Link, notFound, useRouter, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { ReedApply } from "@/components/app/ReedApply";
import { toast } from "sonner";
import { EmptyState, PageHeader, Pill, ScoreBar, Section } from "@/components/app/AppLayout";
import { getJobDetailFn, setMatchStageFn } from "@/lib/functions";
import { MATCH_STAGES, type MatchStage } from "@/lib/schemas/job";
import { STAGE_LABELS, stageTone } from "@/lib/stages";

export const Route = createFileRoute("/app/jobs/$id")({
  loader: async ({ params }) => {
    const detail = await getJobDetailFn({ data: { id: params.id } });
    if (!detail) throw notFound();
    return detail;
  },
  component: JobDetailPage,
});

type Filter = MatchStage | "all";

function JobDetailPage() {
  const { job, matches, interests, canManage } = Route.useLoaderData();
  const { session } = useRouteContext({ from: "__root__" });
  const isAdmin = session.isAdmin;
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const counts = Object.fromEntries(
    MATCH_STAGES.map((s) => [s, matches.filter((m) => m.stage === s).length]),
  ) as Record<MatchStage, number>;

  const visible = (filter === "all" ? matches : matches.filter((m) => m.stage === filter))
    .slice()
    .sort(
      (a, b) =>
        MATCH_STAGES.indexOf(a.stage) - MATCH_STAGES.indexOf(b.stage) || b.score - a.score,
    );

  async function move(candidateId: string, name: string | null, stage: MatchStage) {
    setBusy(candidateId);
    try {
      await setMatchStageFn({ data: { candidateId, jobId: job.id, stage } });
      toast.success(`${name ?? "Candidate"} moved to ${STAGE_LABELS[stage]}`);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the stage");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={`Mandate — ${job.sector ?? "—"}`}
        title={
          <>
            {job.title}
            {job.location && (
              <span className="ml-4 text-ink-soft italic font-normal text-3xl">
                {job.location}
              </span>
            )}
          </>
        }
        lede={
          job.company
            ? `${job.company} · ${job.seniority ?? ""}`
            : `Confidential · ${job.seniority ?? ""}`
        }
        actions={
          isAdmin && matches.length > 0 ? (
            <a
              href={`/api/admin/export/pipeline?job=${encodeURIComponent(job.id)}`}
              className="text-[13px] px-[18px] py-2.5 border border-rule rounded-full text-ink-soft hover:border-ink hover:text-ink transition-colors"
            >
              Export pipeline CSV
            </a>
          ) : undefined
        }
      />

      <ReedApply job={job} />
      <div className="grid md:grid-cols-[2fr_1fr] gap-10">
        <div>
          {job.description && (
            <Section title="Brief">
              <p className="text-sm leading-[1.65] text-ink-soft max-w-[68ch]">
                {job.description}
              </p>
            </Section>
          )}

          <Section title="Must-haves">
            <div className="flex flex-wrap gap-1.5">
              {job.must_have_skills.map((s) => (
                <Pill key={s}>{s}</Pill>
              ))}
            </div>
          </Section>

          {job.nice_to_have_skills.length > 0 && (
            <Section title="Nice-to-haves">
              <div className="flex flex-wrap gap-1.5">
                {job.nice_to_have_skills.map((s) => (
                  <Pill key={s}>{s}</Pill>
                ))}
              </div>
            </Section>
          )}

          {canManage && <Section title={`Expressed interest (${interests.length})`}>
            <p className="text-sm text-ink-soft mb-4">Candidate decisions recorded in UKTL; these are not external job applications.</p>
            {interests.length === 0 ? <p className="text-sm text-ink-mute">No expressed interests yet.</p> :
              <ul className="space-y-3">{interests.map(i=><li key={i.candidate_id} className="border border-rule rounded p-3">
                <Link to="/app/candidates/$id" params={{id:i.candidate_id}} className="underline">{i.name ?? "Candidate"}</Link>
                <p className="text-sm text-ink-soft">{i.headline}</p>
                <p className="text-xs text-ink-mute">Interested since {new Date(i.swiped_at).toISOString().slice(0,10)}</p>
              </li>)}</ul>}
          </Section>}

          {canManage && (
            <Section title={`Pipeline (${matches.length})`}>
              {matches.length === 0 ? (
                <EmptyState
                  title="No scored candidates yet"
                  body="Upload a CV and this mandate will be ranked automatically."
                />
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <StageChip
                      active={filter === "all"}
                      onClick={() => setFilter("all")}
                      label="All"
                      count={matches.length}
                    />
                    {MATCH_STAGES.map((s) => (
                      <StageChip
                        key={s}
                        active={filter === s}
                        onClick={() => setFilter(s)}
                        label={STAGE_LABELS[s]}
                        count={counts[s]}
                      />
                    ))}
                  </div>

                  <div className="border border-rule rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-paper-deep text-ink-mute">
                          <Th>Candidate</Th>
                          <Th className="w-44">Stage</Th>
                          <Th className="w-40">Score</Th>
                          <Th>Matched</Th>
                          <Th>Gaps</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-ink-mute text-[13px]">
                              Nobody at this stage.
                            </td>
                          </tr>
                        ) : (
                          visible.map((m) => (
                            <tr
                              key={m.candidate_id}
                              className={`border-t border-rule hover:bg-paper-deep/40 transition-opacity ${
                                m.stage === "rejected" ? "opacity-55" : ""
                              }`}
                            >
                              <Td>
                                <Link
                                  to="/app/candidates/$id"
                                  params={{ id: m.candidate_id }}
                                  className="text-ink hover:underline font-medium"
                                >
                                  {m.candidate.name ?? "(unnamed)"}
                                </Link>
                                {m.candidate.headline && (
                                  <div className="text-xs text-ink-mute mt-0.5">
                                    {m.candidate.headline}
                                  </div>
                                )}
                              </Td>
                              <Td>
                                <select
                                  aria-label={`Stage for ${m.candidate.name ?? "candidate"}`}
                                  value={m.stage}
                                  disabled={busy === m.candidate_id}
                                  onChange={(e) =>
                                    move(m.candidate_id, m.candidate.name, e.target.value as MatchStage)
                                  }
                                  className="w-full border border-rule rounded-md px-2 py-1.5 text-[12px] bg-paper text-ink focus:outline-none focus:border-ink disabled:opacity-50 transition-colors"
                                >
                                  {MATCH_STAGES.map((s) => (
                                    <option key={s} value={s}>
                                      {STAGE_LABELS[s]}
                                    </option>
                                  ))}
                                </select>
                              </Td>
                              <Td>
                                <ScoreBar value={m.score} />
                              </Td>
                              <Td className="text-xs text-ink-soft">
                                {m.matched_skills.slice(0, 4).join(", ") || "—"}
                              </Td>
                              <Td className="text-xs text-ink-mute">
                                {m.missing_skills.slice(0, 3).join(", ") || "—"}
                              </Td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Section>
          )}
        </div>

        <aside className="space-y-6">
          <div className="border border-rule rounded-md p-6 bg-paper text-sm space-y-3">
            <Detail label="Seniority" value={job.seniority} />
            <Detail
              label="Min. experience"
              value={
                job.min_years_experience != null
                  ? `${job.min_years_experience} yrs`
                  : null
              }
            />
            <Detail label="Location" value={job.location} />
            <Detail label="Salary" value={job.salary_min != null || job.salary_max != null ? `${job.salary_currency ?? ""} ${job.salary_min ?? "—"} – ${job.salary_max ?? "—"} ${job.salary_period ?? "(period not supplied)"}`.trim() : "Not disclosed"} />
            <Detail label="Closing date" value={job.expiry_date} />
            <Detail label="Sector" value={job.sector} />
            <Detail label="Status" value={<Pill tone="good">{job.status}</Pill>} />
          </div>

          {canManage && matches.length > 0 && (
            <div className="border border-rule rounded-md p-6 bg-paper">
              <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute mb-4">
                Funnel
              </div>
              <ul className="space-y-2">
                {MATCH_STAGES.filter((s) => s !== "rejected").map((s) => (
                  <li key={s} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-ink-soft">{STAGE_LABELS[s]}</span>
                    <span className="flex items-center gap-2">
                      <span className="w-24 h-1 rounded-full bg-paper-deep overflow-hidden">
                        <span
                          className="block h-full bg-accent rounded-full"
                          style={{ width: `${(counts[s] / matches.length) * 100}%` }}
                        />
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-ink-mute w-5 text-right">
                        {counts[s]}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {counts.rejected > 0 && (
                <div className="mt-3 pt-3 border-t border-rule text-[12px] text-ink-mute">
                  {counts.rejected} rejected
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function StageChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-[12px] px-3 py-1 rounded-full border transition-colors ${
        active
          ? "bg-ink text-paper border-ink"
          : "border-rule text-ink-soft hover:border-ink hover:text-ink"
      }`}
    >
      {label}
      <span className={`font-mono text-[10px] tabular-nums ${active ? "text-paper/60" : "text-ink-mute"}`}>
        {count}
      </span>
    </button>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-left font-mono text-[11px] tracking-[0.12em] uppercase px-4 py-3 text-ink-mute font-normal ${className}`}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}
function Detail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode | null | undefined;
}) {
  return (
    <div className="flex justify-between gap-6">
      <span className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute">
        {label}
      </span>
      <span className="text-right">
        {value == null || value === "" ? (
          <span className="text-ink-mute">—</span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}
