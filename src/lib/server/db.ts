import { normaliseSkill } from "./skills.ts";
import type { AppEnv } from "./env";
import type { ParsedProfile, QualityAssessment } from "../schemas/profile";
import { ParsedProfileSchema } from "../schemas/profile.ts";
import { scoreMatch } from "./match.ts";
import { JobSchema, type Job, type Match, type MatchScore, type MatchStage } from "../schemas/job.ts";

export type CandidateRow = {
  id: string;
  created_at: number;
  updated_at: number;
  status: string;
  source_filename: string | null;
  source_r2_key: string | null;
  name: string | null;
  email: string | null;
  location: string | null;
  headline: string | null;
  seniority: string | null;
  total_years_experience: number | null;
  quality_score: number | null;
  auth_user_id: string | null;
};

export type CandidateDetail = CandidateRow & {
  phone: string | null;
  summary: string | null;
  work_authorization: string | null;
  quality_notes: string[];
  score_breakdown: { contact_information: number; experience: number; skills: number; education: number } | null;
  improvement_report: { contact_information: string; experience: string; skills: string; education: string; overall: string } | null;
  links: Record<string, string | null>;
  skills: Array<{ skill: string; skill_raw: string; years_experience: number | null }>;
  experience: Array<{
    company: string | null;
    title: string | null;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
    location: string | null;
    description: string | null;
  }>;
  education: Array<{
    institution: string | null;
    degree: string | null;
    field: string | null;
    start_year: string | null;
    end_year: string | null;
  }>;
  parse_error: string | null;
};

export async function insertCandidateShell(
  env: AppEnv,
  args: { id: string; filename: string; r2Key: string; sizeBytes: number; authUserId?: string | null },
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO candidates
      (id, created_at, updated_at, status, source_filename, source_r2_key, source_bytes, auth_user_id)
     VALUES (?, ?, ?, 'uploaded', ?, ?, ?, ?)`,
  )
    .bind(args.id, now, now, args.filename, args.r2Key, args.sizeBytes, args.authUserId ?? null)
    .run();
}

export async function markCandidateParsing(env: AppEnv, id: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE candidates SET status='parsing', updated_at=? WHERE id=?`,
  )
    .bind(Date.now(), id)
    .run();
}

export async function markCandidateFailed(
  env: AppEnv,
  id: string,
  error: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE candidates SET status='failed', parse_error=?, updated_at=? WHERE id=?`,
  )
    .bind(error.slice(0, 2000), Date.now(), id)
    .run();
}

export function parsedProfileStatements(
  env: AppEnv,
  id: string,
  profile: ParsedProfile,
  _normalisedSkills: string[],
  quality: QualityAssessment,
): D1PreparedStatement[] {
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  statements.push(
    env.DB.prepare(
      `UPDATE candidates SET
        status='parsed',
        updated_at=?,
        name=?, email=?, phone=?, location=?, headline=?, summary=?,
        total_years_experience=?, seniority=?, work_authorization=?,
        quality_score=?, quality_notes=?, score_breakdown=?, improvement_report=?,
        links=?, raw_profile=?, parse_error=NULL
       WHERE id=?`,
    ).bind(
      now,
      profile.name ?? null,
      profile.email ?? null,
      profile.phone ?? null,
      profile.location ?? null,
      profile.headline ?? null,
      profile.summary ?? null,
      profile.total_years_experience ?? null,
      profile.seniority ?? null,
      profile.work_authorization ?? null,
      quality.score,
      JSON.stringify(quality.notes),
      quality.breakdown ? JSON.stringify(quality.breakdown) : null,
      quality.improvement_report ? JSON.stringify(quality.improvement_report) : null,
      JSON.stringify(profile.links ?? {}),
      JSON.stringify(profile),
      id,
    ),
  );

  statements.push(
    env.DB.prepare(`DELETE FROM candidate_skills WHERE candidate_id=?`).bind(id),
  );
  statements.push(
    env.DB.prepare(`DELETE FROM candidate_experience WHERE candidate_id=?`).bind(id),
  );
  statements.push(
    env.DB.prepare(`DELETE FROM candidate_education WHERE candidate_id=?`).bind(id),
  );

  const skillsPaired = (profile.skills ?? []).map((s) => ({
    raw: s.skill,
    normal: normaliseSkill(s.skill),
    yoe: s.years_experience ?? null,
  }));
  const seen = new Set<string>();
  for (const s of skillsPaired) {
    if (!s.normal || seen.has(s.normal)) continue;
    seen.add(s.normal);
    statements.push(
      env.DB.prepare(
        `INSERT INTO candidate_skills (candidate_id, skill, skill_raw, years_experience)
         VALUES (?, ?, ?, ?)`,
      ).bind(id, s.normal, s.raw, s.yoe),
    );
  }

  (profile.experience ?? []).forEach((exp, i) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO candidate_experience
          (id, candidate_id, company, title, start_date, end_date, is_current,
           location, description, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `${id}_exp_${i}`,
        id,
        exp.company ?? null,
        exp.title ?? null,
        exp.start_date ?? null,
        exp.end_date ?? null,
        exp.is_current ? 1 : 0,
        exp.location ?? null,
        exp.description ?? null,
        i,
      ),
    );
  });

  (profile.education ?? []).forEach((ed, i) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO candidate_education
          (id, candidate_id, institution, degree, field, start_year, end_year)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `${id}_edu_${i}`,
        id,
        ed.institution ?? null,
        ed.degree ?? null,
        ed.field ?? null,
        ed.start_year ?? null,
        ed.end_year ?? null,
      ),
    );
  });

  return statements;
}

export async function writeParsedProfile(env: AppEnv, id: string, profile: ParsedProfile, skills: string[], quality: QualityAssessment): Promise<void> {
  await env.DB.batch(parsedProfileStatements(env,id,profile,skills,quality));
}

export async function listCandidates(
  env: AppEnv,
  opts: { authUserId?: string; limit?: number } = {},
): Promise<CandidateRow[]> {
  const binds: unknown[] = opts.authUserId ? [opts.authUserId] : [];
  binds.push(opts.limit ?? 50);
  const res = await env.DB.prepare(
    `SELECT id, created_at, updated_at, status, source_filename, source_r2_key,
            name, email, location, headline, seniority, total_years_experience,
            quality_score, auth_user_id
       FROM candidates
      ${opts.authUserId ? "WHERE auth_user_id=?" : ""}
      ORDER BY created_at DESC
      LIMIT ?`,
  )
    .bind(...binds)
    .all<CandidateRow>();
  return res.results ?? [];
}

// undefined = no such candidate; null = candidate exists but is unlinked
export async function getCandidateAuthUserId(
  env: AppEnv,
  id: string,
): Promise<string | null | undefined> {
  const row = await env.DB.prepare(`SELECT auth_user_id FROM candidates WHERE id=?`)
    .bind(id)
    .first<{ auth_user_id: string | null }>();
  return row ? row.auth_user_id : undefined;
}

export async function getLatestCandidateIdForUser(
  env: AppEnv,
  authUserId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT id FROM candidates WHERE auth_user_id=? ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(authUserId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function getCandidate(
  env: AppEnv,
  id: string,
): Promise<CandidateDetail | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM candidates WHERE id=?`,
  )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return null;

  const skills = await env.DB.prepare(
    `SELECT skill, skill_raw, years_experience FROM candidate_skills WHERE candidate_id=?`,
  )
    .bind(id)
    .all<{ skill: string; skill_raw: string; years_experience: number | null }>();

  const experience = await env.DB.prepare(
    `SELECT company, title, start_date, end_date, is_current, location, description
       FROM candidate_experience WHERE candidate_id=? ORDER BY sort_order ASC`,
  )
    .bind(id)
    .all<{
      company: string | null;
      title: string | null;
      start_date: string | null;
      end_date: string | null;
      is_current: number;
      location: string | null;
      description: string | null;
    }>();

  const education = await env.DB.prepare(
    `SELECT institution, degree, field, start_year, end_year
       FROM candidate_education WHERE candidate_id=?`,
  )
    .bind(id)
    .all<{
      institution: string | null;
      degree: string | null;
      field: string | null;
      start_year: string | null;
      end_year: string | null;
    }>();

  return {
    id: String(row.id),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    status: String(row.status),
    source_filename: (row.source_filename as string | null) ?? null,
    source_r2_key: (row.source_r2_key as string | null) ?? null,
    name: (row.name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    headline: (row.headline as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    seniority: (row.seniority as string | null) ?? null,
    total_years_experience: (row.total_years_experience as number | null) ?? null,
    work_authorization: (row.work_authorization as string | null) ?? null,
    quality_score: (row.quality_score as number | null) ?? null,
    auth_user_id: (row.auth_user_id as string | null) ?? null,
    quality_notes: parseJsonArray<string>(row.quality_notes),
    score_breakdown: parseJsonNullable(row.score_breakdown),
    improvement_report: parseJsonNullable(row.improvement_report),
    links: parseJsonObject(row.links),
    skills: skills.results ?? [],
    experience: (experience.results ?? []).map((e) => ({
      ...e,
      is_current: !!e.is_current,
    })),
    education: education.results ?? [],
    parse_error: (row.parse_error as string | null) ?? null,
  };
}

export async function listJobs(env: AppEnv): Promise<Job[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM jobs WHERE status='open' AND (expiry_date IS NULL OR expiry_date >= CAST(CURRENT_DATE AS TEXT)) ORDER BY created_at DESC`,
  ).all<Record<string, unknown>>();
  return (res.results ?? []).map(rowToJob);
}

export async function getJob(env: AppEnv, id: string): Promise<Job | null> {
  const row = await env.DB.prepare(`SELECT * FROM jobs WHERE id=?`)
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? rowToJob(row) : null;
}

export function rowToJob(row: Record<string, unknown>): Job {
  return JobSchema.parse({
    id: row.id,
    created_at: Number(row.created_at),
    title: row.title,
    company: row.company,
    location: row.location,
    sector: row.sector,
    seniority: row.seniority,
    min_years_experience:
      row.min_years_experience != null ? Number(row.min_years_experience) : null,
    description: row.description,
    salary_min: row.salary_min == null ? null : Number(row.salary_min),
    salary_max: row.salary_max == null ? null : Number(row.salary_max),
    salary_currency: row.salary_currency, salary_period: row.salary_period,
    source_url: row.source_url, posted_date: row.posted_date, expiry_date: row.expiry_date,
    must_have_skills: parseJsonArray<string>(row.must_have_skills),
    nice_to_have_skills: parseJsonArray<string>(row.nice_to_have_skills),
    status: row.status,
    source: (row.source as string | null) ?? null,
    filled_candidate_id: (row.filled_candidate_id as string | null) ?? null,
    filled_candidate_name: (row.filled_candidate_name as string | null) ?? null,
    filled_at: row.filled_at == null ? null : Number(row.filled_at),
    filled_note: (row.filled_note as string | null) ?? null,
  });
}

export function matchStatements(
  env: AppEnv,
  candidateId: string,
  matches: MatchScore[],
): D1PreparedStatement[] {
  if (matches.length === 0) return [];
  const now = Date.now();
  const statements = matches.map((m) =>
    env.DB.prepare(
      `INSERT INTO matches
        (candidate_id, job_id, score, skills_overlap, experience_fit, seniority_fit,
         location_fit, matched_skills, missing_skills, reasoning, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(candidate_id, job_id) DO UPDATE SET
        score=excluded.score,
        skills_overlap=excluded.skills_overlap,
        experience_fit=excluded.experience_fit,
        seniority_fit=excluded.seniority_fit,
        location_fit=excluded.location_fit,
        matched_skills=excluded.matched_skills,
        missing_skills=excluded.missing_skills,
        reasoning=excluded.reasoning,
        computed_at=excluded.computed_at`,
    ).bind(
      candidateId,
      m.job_id,
      m.score,
      m.skills_overlap,
      m.experience_fit,
      m.seniority_fit,
      m.location_fit,
      JSON.stringify(m.matched_skills),
      JSON.stringify(m.missing_skills),
      m.reasoning,
      now,
    ),
  );
  return statements;
}

export async function upsertMatches(env: AppEnv,candidateId: string,matches: MatchScore[]): Promise<void> {
  const statements=matchStatements(env,candidateId,matches);
  if (statements.length) await env.DB.batch(statements);
}

export async function setMatchStage(
  env: AppEnv,
  candidateId: string,
  jobId: string,
  stage: MatchStage,
): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE matches SET stage=?, stage_updated_at=? WHERE candidate_id=? AND job_id=?`,
  )
    .bind(stage, Date.now(), candidateId, jobId)
    .run();
  return Number(res.meta?.changes ?? 0) > 0;
}

function rowStage(row: Record<string, unknown>): Pick<Match, "stage" | "stage_updated_at"> {
  return {
    stage: (row.stage as MatchStage | null) ?? "matched",
    stage_updated_at: row.stage_updated_at != null ? Number(row.stage_updated_at) : null,
  };
}

export async function getMatchesForCandidate(
  env: AppEnv,
  candidateId: string,
): Promise<Array<Match & { job: Job }>> {
  const res = await env.DB.prepare(
    `SELECT j.*, c.raw_profile AS current_profile, m.stage, m.stage_updated_at
       FROM candidates c JOIN jobs j ON j.status='open'
       LEFT JOIN matches m ON m.candidate_id=c.id AND m.job_id=j.id
      WHERE c.id=? AND c.status='parsed' AND c.raw_profile IS NOT NULL
        AND (j.expiry_date IS NULL OR j.expiry_date >= CAST(CURRENT_DATE AS TEXT))`,
  )
    .bind(candidateId)
    .all<Record<string, unknown>>();
  const rows = res.results ?? [];
  if (!rows.length) return [];
  // One statement snapshots the current profile, vacancies and pipeline stages.
  // Never fall back to cached scores for invalid or unfinished profiles.
  const profile = ParsedProfileSchema.parse(JSON.parse(String(rows[0].current_profile)));
  const skills = profile.skills.map(skill => skill.skill);
  const computedAt = Date.now();
  return rows.map(row => {
    const job = rowToJob(row);
    return {
      ...scoreMatch(profile, skills, job),
      candidate_id: candidateId,
      computed_at: computedAt,
      ...rowStage(row),
      job,
    };
  }).sort((a,b) => b.score-a.score || b.job.created_at-a.job.created_at || a.job_id.localeCompare(b.job_id));
}

// ── FAQ Topics ───────────────────────────────────────────────────────────────

export type FaqTopic = {
  transcript?: string|null;
  reviewed_at?: number|null;
  answer?: string | null;
  video_key?: string | null;
  captions_key?: string | null;
  thumbnail_key?: string | null;
  id: string;
  title: string;
  category: string;
  keywords: string[];
  sector_tag: string | null;
  video_url: string | null;
  thumbnail: string | null;
  duration_s: number | null;
  published: number;
  view_count: number;
  created_at: number;
};

export async function listFaqTopics(
  env: AppEnv,
  opts: { category?: string; sector?: string } = {},
): Promise<FaqTopic[]> {
  let query = `SELECT * FROM faq_topics WHERE published=1`;
  const binds: unknown[] = [];
  if (opts.category) { query += ` AND category=?`; binds.push(opts.category); }
  if (opts.sector)   { query += ` AND (sector_tag IS NULL OR sector_tag=?)`; binds.push(opts.sector); }
  query += ` ORDER BY view_count DESC, created_at DESC`;
  const res = await env.DB.prepare(query).bind(...binds).all<Record<string, unknown>>();
  return (res.results ?? []).map(rowToFaqTopic);
}

export async function incrementFaqView(env: AppEnv, id: string): Promise<void> {
  await env.DB.prepare(`UPDATE faq_topics SET view_count=view_count+1 WHERE id=?`).bind(id).run();
}

function rowToFaqTopic(row: Record<string, unknown>): FaqTopic {
  return {
    transcript: (row.transcript as string|null)??null,
    reviewed_at: row.reviewed_at==null?null:Number(row.reviewed_at),
    answer: (row.answer as string | null) ?? null,
    video_key: (row.video_key as string | null) ?? null,
    captions_key: (row.captions_key as string | null) ?? null,
    thumbnail_key: (row.thumbnail_key as string | null) ?? null,
    id: String(row.id),
    title: String(row.title),
    category: String(row.category),
    keywords: parseJsonArray<string>(row.keywords),
    sector_tag: (row.sector_tag as string | null) ?? null,
    video_url: (row.video_url as string | null) ?? null,
    thumbnail: (row.thumbnail as string | null) ?? null,
    duration_s: row.duration_s != null ? Number(row.duration_s) : null,
    published: Number(row.published),
    view_count: Number(row.view_count ?? 0),
    created_at: Number(row.created_at),
  };
}

export async function getSwipedJobIds(
  env: AppEnv,
  candidateId: string,
): Promise<string[]> {
  const res = await env.DB.prepare(
    `SELECT job_id FROM candidate_swipes WHERE candidate_id=?`,
  )
    .bind(candidateId)
    .all<{ job_id: string }>();
  return (res.results ?? []).map((r) => r.job_id);
}

export async function getMatchesForJob(
  env: AppEnv,
  jobId: string,
): Promise<
  Array<Match & { candidate: { id: string; name: string | null; headline: string | null } }>
> {
  const res = await env.DB.prepare(
    `SELECT j.*, m.candidate_id, m.stage, m.stage_updated_at,
            c.name AS c_name, c.headline AS c_headline, c.raw_profile AS current_profile
       FROM matches m JOIN candidates c ON c.id=m.candidate_id
       JOIN jobs j ON j.id=m.job_id
      WHERE m.job_id=? AND c.status='parsed' AND c.raw_profile IS NOT NULL`,
  )
    .bind(jobId)
    .all<Record<string, unknown>>();
  const computedAt = Date.now();
  // Rank only after refreshing every existing pipeline row. A SQL LIMIT on
  // cached scores could exclude today's strongest matches. Closed vacancies
  // retain their staff pipeline for review; candidate discovery excludes them.
  return (res.results ?? []).map(row => {
    const profile = ParsedProfileSchema.parse(JSON.parse(String(row.current_profile)));
    return {
      ...scoreMatch(profile, profile.skills.map(skill => skill.skill), rowToJob(row)),
      candidate_id: String(row.candidate_id),
      computed_at: computedAt,
      ...rowStage(row),
      candidate: {
        id: String(row.candidate_id),
        name: (row.c_name as string | null) ?? null,
        headline: (row.c_headline as string | null) ?? null,
      },
    };
  }).sort((a,b) => b.score-a.score || a.candidate_id.localeCompare(b.candidate_id)).slice(0,50);
}

// ── Admin: FAQ topics ────────────────────────────────────────────────────────

export async function listAllFaqTopics(env: AppEnv): Promise<FaqTopic[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM faq_topics ORDER BY created_at DESC`,
  ).all<Record<string, unknown>>();
  return (res.results ?? []).map(rowToFaqTopic);
}

export async function getFaqTopic(env: AppEnv, id: string): Promise<FaqTopic | null> {
  const row = await env.DB.prepare(`SELECT * FROM faq_topics WHERE id=?`).bind(id).first<Record<string, unknown>>();
  return row ? rowToFaqTopic(row) : null;
}

export type FaqTopicInput = {
  title: string;
  answer?: string | null;
  category: string;
  keywords: string[];
  sector_tag?: string | null;
  video_url?: string | null;
  thumbnail?: string | null;
  duration_s?: number | null;
  published?: boolean;
};

export async function createFaqTopic(env: AppEnv, id: string, input: FaqTopicInput): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    env.DATA_BACKEND === "supabase"
      ? `INSERT INTO faq_topics (id, title, category, keywords, sector_tag, video_url, thumbnail, duration_s, published, view_count, created_at, answer, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      : `INSERT INTO faq_topics (id, title, category, keywords, sector_tag, video_url, thumbnail, duration_s, published, view_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).bind(
    id, input.title, input.category, JSON.stringify(input.keywords),
    input.sector_tag ?? null, input.video_url ?? null, input.thumbnail ?? null,
    input.duration_s ?? null, input.published ? 1 : 0, now,
    ...(env.DATA_BACKEND === "supabase" ? [input.answer || null, now] : []),
  ).run();
}

export async function updateFaqTopic(env: AppEnv, id: string, input: FaqTopicInput): Promise<void> {
  await env.DB.prepare(
    env.DATA_BACKEND === "supabase"
      ? `UPDATE faq_topics SET title=?, category=?, keywords=?, sector_tag=?, video_url=?, thumbnail=?, duration_s=?, published=?, answer=?, updated_at=?
         WHERE id=?`
      : `UPDATE faq_topics SET title=?, category=?, keywords=?, sector_tag=?, video_url=?, thumbnail=?, duration_s=?, published=?
         WHERE id=?`,
  ).bind(
    input.title, input.category, JSON.stringify(input.keywords),
    input.sector_tag ?? null, input.video_url ?? null, input.thumbnail ?? null,
    input.duration_s ?? null, input.published ? 1 : 0,
    ...(env.DATA_BACKEND === "supabase" ? [input.answer || null, Date.now()] : []), id,
  ).run();
}

export async function deleteFaqTopic(env: AppEnv, id: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM faq_topics WHERE id=?`).bind(id).run();
}

// ── Admin: Jobs ──────────────────────────────────────────────────────────────

export async function listAllJobs(env: AppEnv): Promise<Job[]> {
  const res = await env.DB.prepare(
    env.DATA_BACKEND === "supabase"
      ? `SELECT j.*, c.name AS filled_candidate_name FROM jobs j LEFT JOIN candidates c ON c.id=j.filled_candidate_id ORDER BY j.created_at DESC`
      : `SELECT * FROM jobs ORDER BY created_at DESC`,
  ).all<Record<string, unknown>>();
  return (res.results ?? []).map(rowToJob);
}

export type JobInput = {
  title: string;
  company?: string | null;
  location?: string | null;
  sector?: string | null;
  seniority?: string | null;
  min_years_experience?: number | null;
  description?: string | null;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  status: "open" | "closed";
  posted_date?: string | null;
  expiry_date?: string | null;
};

export async function createJob(env: AppEnv, id: string, input: JobInput): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO jobs (id, created_at, title, company, location, sector, seniority, min_years_experience, description, must_have_skills, nice_to_have_skills, status, posted_date, expiry_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, now, input.title, input.company ?? null, input.location ?? null,
    input.sector ?? null, input.seniority ?? null, input.min_years_experience ?? null,
    input.description ?? null,
    JSON.stringify(input.must_have_skills), JSON.stringify(input.nice_to_have_skills),
    input.status, input.posted_date ?? null, input.expiry_date ?? null,
  ).run();
}

export async function updateJob(env: AppEnv, id: string, input: JobInput): Promise<void> {
  await env.DB.prepare(
    // A filled mandate keeps its status and placement; reopen it explicitly to change that.
    `UPDATE jobs SET title=?, company=?, location=?, sector=?, seniority=?, min_years_experience=?,
     description=?, must_have_skills=?, nice_to_have_skills=?,
     status=CASE WHEN status='filled' THEN status ELSE ? END, posted_date=COALESCE(?, posted_date), expiry_date=? WHERE id=?`,
  ).bind(
    input.title, input.company ?? null, input.location ?? null,
    input.sector ?? null, input.seniority ?? null, input.min_years_experience ?? null,
    input.description ?? null,
    JSON.stringify(input.must_have_skills), JSON.stringify(input.nice_to_have_skills),
    input.status, input.posted_date ?? null, input.expiry_date ?? null, id,
  ).run();
}

export async function deleteJob(env: AppEnv, id: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM jobs WHERE id=?`).bind(id).run();
}

// ── Bookings ─────────────────────────────────────────────────────────────────

export type BookingRow = {
  source?: string;
  provider_invitee_uri?: string | null;
  starts_at?: number | null;
  old_invitee_uri?: string | null;
  intent_id?: string | null;
  notification_status: string;
  id: string;
  created_at: number;
  user_email: string | null;
  auth_user_id: string | null;
  topic_area: string | null;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  calendly_uri: string | null;
  status: string;
  notes: string | null;
};

export type BookingInput = {
  contact_name: string;
  contact_email: string;
  contact_phone?: string | null;
  topic_area?: string | null;
  auth_user_id?: string | null;
  user_email?: string | null;
  notes?: string | null;
};

export async function createBooking(env: AppEnv, id: string, input: BookingInput): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO bookings
      (id, created_at, user_email, auth_user_id, topic_area, contact_name, contact_email, contact_phone, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).bind(
    id, now,
    input.user_email ?? null, input.auth_user_id ?? null,
    input.topic_area ?? null, input.contact_name,
    input.contact_email, input.contact_phone ?? null,
    input.notes ?? null,
  ).run();
}

export async function listBookings(env: AppEnv, limit = 100): Promise<BookingRow[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM bookings ORDER BY created_at DESC LIMIT ?`,
  ).bind(limit).all<BookingRow>();
  return res.results ?? [];
}

// ── Enquiries (public contact form) ──────────────────────────────────────────

export type EnquiryInput = {
  name: string;
  email: string;
  company?: string | null;
  enquiry_type?: string | null;
  message: string;
};

export async function createEnquiry(env: AppEnv, id: string, input: EnquiryInput): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO enquiries (id, created_at, name, email, company, enquiry_type, message, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'new')`,
  ).bind(
    id, Date.now(), input.name, input.email,
    input.company ?? null, input.enquiry_type ?? null, input.message,
  ).run();
}

export type EnquiryRow = {
  notification_status: string;
  id: string;
  created_at: number;
  name: string;
  email: string;
  company: string | null;
  enquiry_type: string | null;
  message: string;
  status: string;
};

export async function listEnquiries(env: AppEnv, limit = 200): Promise<EnquiryRow[]> {
  const res = await env.DB.prepare(`SELECT * FROM enquiries ORDER BY created_at DESC LIMIT ?`)
    .bind(limit)
    .all<EnquiryRow>();
  return res.results ?? [];
}

export async function setEnquiryStatus(env: AppEnv, id: string, status: string): Promise<boolean> {
  const res = await env.DB.prepare(`UPDATE enquiries SET status=? WHERE id=?`).bind(status, id).run();
  return Number(res.meta?.changes ?? 0) > 0;
}

// ── HR Queries ───────────────────────────────────────────────────────────────

export async function recordHrQuery(
  env: AppEnv,
  id: string,
  data: {
    auth_user_id?: string;
    question: string;
    category?: string;
    faq_topic_id?: string;
  },
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO hr_queries (id, created_at, auth_user_id, question, category, faq_topic_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, now,
    data.auth_user_id ?? null, data.question,
    data.category ?? null, data.faq_topic_id ?? null,
  ).run();
}

export async function resolveHrQuery(
  env: AppEnv,
  id: string,
  resolution_type: string,
  ai_response?: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE hr_queries SET resolved=1, resolution_type=?, ai_response=? WHERE id=?`,
  ).bind(resolution_type, ai_response ?? null, id).run();
}

export async function getAdminAnalytics(env: AppEnv): Promise<{
  total_candidates: number;
  parsed_candidates: number;
  avg_quality_score: number | null;
  total_jobs: number;
  open_jobs: number;
  total_faq_views: number;
  total_queries: number;
  resolved_queries: number;
  total_bookings: number;
  ai_queries: number;
  converted_queries: number;
}> {
  const [candidates, jobs, faqViews, queries, bookings] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) as n, SUM(CASE WHEN status='parsed' THEN 1 ELSE 0 END) as parsed, AVG(CASE WHEN quality_score IS NOT NULL THEN quality_score END) as avg_score FROM candidates`),
    env.DB.prepare(`SELECT COUNT(*) as n, SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open FROM jobs`),
    env.DB.prepare(`SELECT COALESCE(SUM(view_count),0) as total FROM faq_topics`),
    env.DB.prepare(`SELECT COUNT(*) as n, SUM(resolved) as resolved, SUM(CASE WHEN ai_response IS NOT NULL THEN 1 ELSE 0 END) as ai FROM hr_queries`),
    env.DB.prepare(env.DATA_BACKEND==='supabase'?`SELECT COUNT(*) as n, COUNT(DISTINCT COALESCE(b.query_id,i.query_id)) AS converted FROM bookings b LEFT JOIN booking_intents i ON i.id=b.intent_id WHERE b.source IN ('native','calendly') AND b.status='confirmed'`:`SELECT COUNT(*) as n, 0 AS converted FROM bookings WHERE status='confirmed'`),
  ]);
  const c = (candidates.results?.[0] ?? {}) as Record<string, number | null>;
  const j = (jobs.results?.[0] ?? {}) as Record<string, number>;
  const f = (faqViews.results?.[0] ?? {}) as Record<string, number>;
  const q = (queries.results?.[0] ?? {}) as Record<string, number>;
  const b = (bookings.results?.[0] ?? {}) as Record<string, number>;
  return {
    total_candidates: Number(c.n ?? 0),
    parsed_candidates: Number(c.parsed ?? 0),
    avg_quality_score: c.avg_score != null ? Math.round(Number(c.avg_score)) : null,
    total_jobs: Number(j.n ?? 0),
    open_jobs: Number(j.open ?? 0),
    total_faq_views: Number(f.total ?? 0),
    total_queries: Number(q.n ?? 0),
    resolved_queries: Number(q.resolved ?? 0),
    total_bookings: Number(b.n ?? 0),
    ai_queries: Number(q.ai ?? 0),
    converted_queries: Number(b.converted ?? 0),
  };
}

// ── Admin: Candidates ────────────────────────────────────────────────────────

export async function deleteCandidate(env: AppEnv, id: string): Promise<void> {
  if (env.DATA_BACKEND === "supabase") throw new Error("Use the durable private-file erasure workflow for Supabase candidates");
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM candidate_skills WHERE candidate_id=?`).bind(id),
    env.DB.prepare(`DELETE FROM candidate_experience WHERE candidate_id=?`).bind(id),
    env.DB.prepare(`DELETE FROM candidate_education WHERE candidate_id=?`).bind(id),
    env.DB.prepare(`DELETE FROM candidate_swipes WHERE candidate_id=?`).bind(id),
    env.DB.prepare(`DELETE FROM matches WHERE candidate_id=?`).bind(id),
    env.DB.prepare(`DELETE FROM candidates WHERE id=?`).bind(id),
  ]);
}

function parseJsonArray<T>(raw: unknown): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as T[];
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}
function parseJsonObject(raw: unknown): Record<string, string | null> {
  if (!raw) return {};
  try {
    const v = JSON.parse(String(raw));
    return v && typeof v === "object" ? (v as Record<string, string | null>) : {};
  } catch {
    return {};
  }
}
function parseJsonNullable<T>(raw: unknown): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return null;
  }
}
