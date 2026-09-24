import { useEffect, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { rankCandidatesFn, addToPipelineFn, fillJobFn, reopenJobFn } from "@/lib/job-functions";
import { STAGE_LABELS } from "@/lib/stages";
import type { Job, MatchStage } from "@/lib/schemas/job";

type Ranking = Awaited<ReturnType<typeof rankCandidatesFn>>;
type Ranked = Ranking["candidates"][number];

const label = "font-mono text-[10px] tracking-[0.14em] uppercase text-ink-mute";

function Fit({ name, value }: { name: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-mute">
      <span className="w-16 shrink-0">{name}</span>
      <span className="flex-1 h-1.5 rounded-full bg-paper-deep overflow-hidden">
        <span className="block h-full bg-accent" style={{ width: `${value}%`, opacity: 0.35 + value / 160 }} />
      </span>
      <span className="w-7 text-right tabular-nums">{value}</span>
    </div>
  );
}

/** Admin: fill/reopen status and the ranked list of candidates from the whole database. */
export function JobCandidateRanking({ job }: { job: Job }) {
  const router = useRouter();
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [minScore, setMinScore] = useState(0);
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filling, setFilling] = useState<Ranked | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setError("");
    try {
      setRanking(await rankCandidatesFn({ data: { jobId: job.id, minScore, qualifiedOnly, limit: 100 } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Candidates could not be ranked.");
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, minScore, qualifiedOnly]);

  async function act(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(ok);
      setSelected(new Set());
      setFilling(null);
      setNote("");
      await Promise.all([load(), router.invalidate()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mt-12 space-y-10">
      {/* Lifecycle */}
      <section className="border border-rule rounded-md p-5 bg-paper space-y-3" aria-labelledby="job-status">
        <h2 id="job-status" className={label}>Mandate status</h2>
        {job.status === "filled" ? (
          <>
            <p className="text-sm text-ink">
              Filled{job.filled_at ? ` on ${new Date(job.filled_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""} by{" "}
              {job.filled_candidate_id ? (
                <Link to="/app/candidates/$id" params={{ id: job.filled_candidate_id }} className="underline">
                  {job.filled_candidate_name ?? job.filled_candidate_id}
                </Link>
              ) : (
                <span className="text-ink-mute">a candidate whose record has since been erased</span>
              )}
              .
            </p>
            {job.filled_note && <p className="text-sm text-ink-soft whitespace-pre-wrap">{job.filled_note}</p>}
            <ReopenControl busy={busy} onReopen={(date) => act(() => reopenJobFn({ data: { jobId: job.id, expiryDate: date } }), "Mandate reopened.")} />
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft">
              {job.status === "open" ? "Open" : "Closed"}
              {job.expiry_date ? ` · closes ${new Date(job.expiry_date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : " · no closing date"}
              . Choose <span className="text-ink">Mark filled</span> on a candidate below to record the placement.
            </p>
            {job.status === "closed" && (
              <ReopenControl busy={busy} onReopen={(date) => act(() => reopenJobFn({ data: { jobId: job.id, expiryDate: date } }), "Mandate reopened.")} />
            )}
          </>
        )}
      </section>

      {filling && (
        <section role="dialog" aria-labelledby="fill-heading" className="border border-ink rounded-md p-5 bg-paper space-y-3">
          <h2 id="fill-heading" className="text-sm text-ink font-medium">
            Mark “{job.title}” filled by {filling.name ?? filling.id}?
          </h2>
          <p className="text-xs text-ink-mute">
            The mandate closes to candidates, and {filling.name ?? "this candidate"}&apos;s pipeline stage becomes Placed. Other pipeline candidates keep their stages for you to update.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Optional note: start date, terms agreed, who confirmed…"
            className="w-full border border-rule rounded px-3 py-2 text-sm bg-paper text-ink focus:outline-none focus:border-ink"
          />
          <div className="flex gap-3">
            <button
              disabled={busy}
              onClick={() => act(() => fillJobFn({ data: { jobId: job.id, candidateId: filling.id, note: note || undefined } }), `Mandate marked filled by ${filling.name ?? filling.id}.`)}
              className="text-[12px] px-3.5 py-1.5 rounded-full bg-ink text-paper disabled:opacity-40"
            >
              Confirm placement
            </button>
            <button className="text-[12px] underline text-ink-soft" onClick={() => setFilling(null)}>Cancel</button>
          </div>
        </section>
      )}

      {/* Ranking */}
      <section aria-labelledby="ranked-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="ranked-heading" className="font-display text-2xl text-ink" style={{ fontVariationSettings: '"opsz" 72' }}>
              Qualified candidates
            </h2>
            <p className="text-sm text-ink-soft mt-1 max-w-[65ch]">
              Every parsed CV in the database, scored against this mandate: skills 50%, experience 20%, seniority 20%, location 10%.
              “Qualified” means a score of 60+ with every must-have skill. Scores are rules-based evidence for a consultant to review, not a decision.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 text-ink-soft">
              Minimum score
              <input type="range" min={0} max={90} step={10} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="accent-[var(--color-accent)]" />
              <span className="tabular-nums w-6 text-ink">{minScore}</span>
            </label>
            <label className="flex items-center gap-2 text-ink-soft">
              <input type="checkbox" checked={qualifiedOnly} onChange={(e) => setQualifiedOnly(e.target.checked)} className="accent-[var(--color-accent)]" />
              Qualified only
            </label>
          </div>
        </div>

        {ranking && (
          <p className="text-xs text-ink-mute">
            {ranking.scanned} CVs scored · {ranking.qualifiedCount} qualified · showing {ranking.candidates.length} of {ranking.matching}
            {ranking.scanCapped ? " · only the 5,000 most recently updated CVs are scanned" : ""}
            {ranking.unreadable ? ` · ${ranking.unreadable} profiles could not be read` : ""}
          </p>
        )}
        {ranking && !ranking.hasSkillRequirements && (
          <p className="text-sm border border-rule rounded px-3 py-2 text-ink-soft">
            This mandate has no must-have or nice-to-have skills, so skills cannot be scored. Add them above for a meaningful ranking.
          </p>
        )}
        {(error || notice) && (
          <p role={error ? "alert" : "status"} className={`text-sm ${error ? "text-red-700" : "text-accent"}`}>{error || notice}</p>
        )}

        {selected.size > 0 && (
          <div className="sticky top-2 z-10 flex items-center gap-3 border border-rule rounded-md bg-paper px-4 py-2 text-sm shadow-sm">
            <span className="text-ink">{selected.size} selected</span>
            <button
              disabled={busy}
              onClick={() => act(() => addToPipelineFn({ data: { jobId: job.id, candidateIds: [...selected] } }), `Added ${selected.size} to the pipeline.`)}
              className="text-[12px] px-3.5 py-1.5 rounded-full bg-ink text-paper disabled:opacity-40"
            >
              Add to pipeline
            </button>
            <button className="text-[12px] underline text-ink-mute" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        {!ranking ? (
          <p className="text-sm text-ink-mute">{error ? "" : "Scoring candidates…"}</p>
        ) : ranking.candidates.length === 0 ? (
          <div className="border border-dashed border-rule rounded-md p-8 text-center text-sm text-ink-mute">
            {ranking.scanned === 0 ? "No parsed CVs in the database yet." : "No candidates meet these filters. Lower the minimum score or include candidates who are not fully qualified."}
          </div>
        ) : (
          <ol className="border border-rule rounded-md divide-y divide-rule">
            {ranking.candidates.map((c, i) => (
              <li key={c.id} className="grid gap-4 p-4 md:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_auto] items-start">
                <div className="flex items-center gap-3">
                  {!c.stage && (
                    <input type="checkbox" aria-label={`Select ${c.name ?? c.id}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-[var(--color-accent)]" />
                  )}
                  <span className="font-mono text-xs text-ink-mute tabular-nums w-6">{i + 1}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <Link to="/app/candidates/$id" params={{ id: c.id }} className="text-ink font-medium hover:underline">
                      {c.name ?? "Unnamed candidate"}
                    </Link>
                    {c.qualified && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full border border-accent/40 text-accent bg-accent-soft">Qualified</span>
                    )}
                    {c.stage && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-mute">In pipeline · {STAGE_LABELS[c.stage as MatchStage] ?? c.stage}</span>
                    )}
                  </div>
                  <p className="text-sm text-ink-soft truncate">{[c.headline, c.location].filter(Boolean).join(" · ") || "—"}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.matched_skills.slice(0, 8).map((s) => (
                      <span key={s} className="text-[11px] px-2 py-0.5 rounded-full border border-rule text-ink-soft">{s}</span>
                    ))}
                    {c.missing_skills.slice(0, 6).map((s) => (
                      <span key={s} className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-rule text-ink-mute line-through decoration-ink-mute/50" title="Missing must-have">{s}</span>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Fit name="Skills" value={c.skills_overlap} />
                  <Fit name="Experience" value={c.experience_fit} />
                  <Fit name="Seniority" value={c.seniority_fit} />
                  <Fit name="Location" value={c.location_fit} />
                </div>
                <div className="flex md:flex-col items-end gap-2 md:text-right">
                  <div>
                    <span className="font-display text-3xl text-ink tabular-nums leading-none" style={{ fontVariationSettings: '"opsz" 72' }}>{c.score}</span>
                    <span className="text-xs text-ink-mute">/100</span>
                  </div>
                  <span className="text-[11px] text-ink-mute">CV quality {c.quality_score ?? "—"}</span>
                  {job.status !== "filled" && (
                    <button disabled={busy} onClick={() => setFilling(c)} className="text-[12px] underline text-ink-soft hover:text-ink">
                      Mark filled
                    </button>
                  )}
                </div>
                <details className="md:col-span-4 text-xs text-ink-mute">
                  <summary className="cursor-pointer">Why this score</summary>
                  <p className="mt-1 max-w-[80ch]">{c.reasoning}</p>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function ReopenControl({ busy, onReopen }: { busy: boolean; onReopen: (date: string | null) => void }) {
  const [date, setDate] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-3 pt-1">
      <label className="text-xs text-ink-mute">
        New closing date (optional)
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="block mt-1 border border-rule rounded px-2 py-1.5 text-sm bg-paper text-ink" />
      </label>
      <button disabled={busy} onClick={() => onReopen(date || null)} className="text-[12px] px-3.5 py-1.5 border border-rule rounded-full text-ink-soft hover:border-ink hover:text-ink disabled:opacity-40">
        Reopen mandate
      </button>
    </div>
  );
}
