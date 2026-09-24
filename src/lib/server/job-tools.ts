import type { AppEnv } from "./env";
import { getJob, matchStatements } from "./db.ts";
import { scoreMatch } from "./match.ts";
import { normaliseSkill } from "./skills.ts";
import { ParsedProfileSchema } from "../schemas/profile.ts";
import type { Job } from "../schemas/job";

/** Candidates scanned per ranking request; newest profiles first. */
export const RANK_SCAN_LIMIT = 5000;
/** A candidate is "qualified" at this score with every must-have skill present. */
export const QUALIFIED_SCORE = 60;

export type RankedCandidate = {
  id: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  quality_score: number | null;
  score: number;
  skills_overlap: number;
  experience_fit: number;
  seniority_fit: number;
  location_fit: number;
  matched_skills: string[];
  missing_skills: string[];
  must_have_coverage: number | null;
  qualified: boolean;
  reasoning: string;
  stage: string | null;
};

/** Pure ranking so it can be unit-tested without a database. */
export function rankProfiles(
  job: Job,
  rows: { id: string; name: string | null; headline: string | null; location: string | null; quality_score: number | null; raw_profile: string; stage: string | null }[],
) {
  const mustTotal = new Set(job.must_have_skills.map(normaliseSkill).filter(Boolean)).size;
  const ranked: RankedCandidate[] = [];
  let unreadable = 0;
  for (const row of rows) {
    let profile;
    try {
      profile = ParsedProfileSchema.parse(JSON.parse(row.raw_profile));
    } catch {
      unreadable++;
      continue;
    }
    const s = scoreMatch(profile, profile.skills.map((k) => k.skill), job);
    const coverage = mustTotal ? (mustTotal - s.missing_skills.length) / mustTotal : null;
    ranked.push({
      id: row.id,
      name: row.name,
      headline: row.headline,
      location: row.location,
      quality_score: row.quality_score == null ? null : Number(row.quality_score),
      score: s.score,
      skills_overlap: s.skills_overlap,
      experience_fit: s.experience_fit,
      seniority_fit: s.seniority_fit,
      location_fit: s.location_fit,
      matched_skills: s.matched_skills,
      missing_skills: s.missing_skills,
      must_have_coverage: coverage,
      qualified: s.score >= QUALIFIED_SCORE && (coverage === null || coverage === 1),
      reasoning: s.reasoning,
      stage: row.stage,
    });
  }
  // Job fit first; must-have coverage, then CV quality break ties; id keeps order stable.
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      (b.must_have_coverage ?? 0) - (a.must_have_coverage ?? 0) ||
      (b.quality_score ?? -1) - (a.quality_score ?? -1) ||
      a.id.localeCompare(b.id),
  );
  return { ranked, unreadable };
}

export async function rankCandidatesForJob(
  env: AppEnv,
  jobId: string,
  opts: { minScore?: number; qualifiedOnly?: boolean; limit?: number } = {},
) {
  const job = await getJob(env, jobId);
  if (!job) throw new Error("Mandate not found");
  const res = await env.DB.prepare(
    `SELECT c.id,c.name,c.headline,c.location,c.quality_score,c.raw_profile,m.stage
       FROM candidates c LEFT JOIN matches m ON m.candidate_id=c.id AND m.job_id=?
      WHERE c.status='parsed' AND c.raw_profile IS NOT NULL
      ORDER BY c.updated_at DESC LIMIT ${RANK_SCAN_LIMIT}`,
  )
    .bind(jobId)
    .all<{ id: string; name: string | null; headline: string | null; location: string | null; quality_score: number | null; raw_profile: string; stage: string | null }>();
  const rows = res.results ?? [];
  const { ranked, unreadable } = rankProfiles(job, rows);
  const filtered = ranked.filter(
    (r) => r.score >= (opts.minScore ?? 0) && (!opts.qualifiedOnly || r.qualified),
  );
  return {
    job,
    scanned: rows.length,
    scanCapped: rows.length >= RANK_SCAN_LIMIT,
    unreadable,
    qualifiedCount: ranked.filter((r) => r.qualified).length,
    matching: filtered.length,
    candidates: filtered.slice(0, Math.min(opts.limit ?? 100, 500)),
    hasSkillRequirements: job.must_have_skills.length + job.nice_to_have_skills.length > 0,
  };
}

async function scoreOne(env: AppEnv, job: Job, candidateId: string) {
  const row = await env.DB.prepare(
    "SELECT raw_profile FROM candidates WHERE id=? AND status='parsed' AND raw_profile IS NOT NULL",
  )
    .bind(candidateId)
    .first<{ raw_profile: string }>();
  if (!row) return null;
  const parsed = ParsedProfileSchema.safeParse(JSON.parse(row.raw_profile));
  if (!parsed.success) return null;
  return scoreMatch(parsed.data, parsed.data.skills.map((k) => k.skill), job);
}

/** Adds scored candidates to a mandate pipeline. Existing stages are never reset. */
export async function addToPipeline(env: AppEnv, jobId: string, candidateIds: string[]) {
  const job = await getJob(env, jobId);
  if (!job) throw new Error("Mandate not found");
  const statements: D1PreparedStatement[] = [];
  for (const id of [...new Set(candidateIds)]) {
    const score = await scoreOne(env, job, id);
    if (score) statements.push(...matchStatements(env, id, [score]));
  }
  if (statements.length) await env.DB.batch(statements);
  return { added: statements.length, skipped: candidateIds.length - statements.length };
}

const FILL_ERRORS: Record<string, string> = {
  job_not_found: "Mandate not found",
  candidate_not_found: "Candidate not found",
  already_filled: "This mandate is already marked as filled. Reopen it first to change the placed candidate.",
};

/** Marks a mandate filled by a candidate; their pipeline row moves to "placed" in the same transaction. */
export async function fillJob(env: AppEnv, jobId: string, candidateId: string, actorId: string, note?: string) {
  if (env.DATA_BACKEND !== "supabase") throw new Error("Marking mandates filled requires the Supabase backend");
  const job = await getJob(env, jobId);
  if (!job) throw new Error(FILL_ERRORS.job_not_found);
  const s = await scoreOne(env, job, candidateId);
  const result = await env.DB.prepare(
    `SELECT fill_job(?,?,?::uuid,?,?::bigint,?::bigint,?::bigint,?::bigint,?::bigint,?,?,?) AS outcome`,
  )
    .bind(
      jobId,
      candidateId,
      actorId,
      note ?? "",
      s?.score ?? 0,
      s?.skills_overlap ?? 0,
      s?.experience_fit ?? 0,
      s?.seniority_fit ?? 0,
      s?.location_fit ?? 0,
      JSON.stringify(s?.matched_skills ?? []),
      JSON.stringify(s?.missing_skills ?? []),
      s?.reasoning ?? "Placed by staff; no parsed profile was available to score.",
    )
    .first<{ outcome: string }>();
  if (result?.outcome !== "filled") throw new Error(FILL_ERRORS[result?.outcome ?? ""] ?? "The mandate could not be updated");
  return { ok: true };
}

/** Reopens a filled mandate. The placed candidate's stage is left for staff to change. */
export async function reopenJob(env: AppEnv, jobId: string, expiryDate: string | null) {
  if (expiryDate && expiryDate < todayInLondon()) throw new Error("The new closing date is in the past");
  const row = await env.DB.prepare(
    `UPDATE jobs SET status='open',filled_candidate_id=NULL,filled_at=NULL,filled_by=NULL,filled_note=NULL,expiry_date=?,updated_at=?
      WHERE id=? AND status IN ('filled','closed') RETURNING id`,
  )
    .bind(expiryDate, Date.now(), jobId)
    .first();
  if (!row) throw new Error("Only closed or filled mandates can be reopened");
  return { ok: true };
}

/** "YYYY-MM-DD" n days after a London calendar date (inclusive closing date). */
export function closingDate(from: string, days: number) {
  const [y, m, d] = from.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function todayInLondon(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}
