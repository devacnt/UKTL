import type { AppEnv } from "./env";

export type ReedSector = "construction" | "technology";
export type ReedSyncResult = {
  saved: number;
  skipped: number;
  failed: number;
  total: number;
  partial: boolean;
  nextOffset?: number;
  exhausted?: boolean;
};
const sectorTitles = {
  construction:
    /\b(construction|quantity surveyor|building surveyor|civil engineer|site manager|site engineer|bricklayer|carpenter|plumber|electrician|structural engineer|groundworker|roofer)\b/i,
  technology:
    /\b(software|developer|programmer|devops|cyber\s?security|data engineer|data scientist|IT support|IT engineer|IT technician|network engineer|cloud engineer|machine learning|systems administrator|information technology)\b/i,
};
// Conservative title evidence: a company description mentioning technology or
// construction is not enough to classify an unrelated vacancy into that sector.
export function matchesReedSector(title: string, sector: ReedSector) {
  const technology =
    sectorTitles.technology.test(title) &&
    !/\b(property|land|real estate|business|sales)\s+developer\b/i.test(title);
  return sector === "technology"
    ? technology
    : sectorTitles.construction.test(title) && !technology;
}
export function reedDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const uk = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const iso = uk ? `${uk[3]}-${uk[2]}-${uk[1]}` : value;
  if (!/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))?$/.test(iso)) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso.slice(0, 10))
    return null;
  return date.toISOString().slice(0, 10);
}
const text = (v: unknown, max = 1000) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
function reedSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["reed.co.uk", "www.reed.co.uk"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith("/jobs/")
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
export function normaliseReedJob(raw: Record<string, unknown>, id: number, sector: ReedSector, now = new Date()) {
  const title = text(raw.jobTitle);
  if (!title) throw new Error("Invalid Reed vacancy");
  if (!matchesReedSector(title, sector)) return null;
  const suppliedExpiry = reedDate(raw.expirationDate);
  // An invalid supplied expiry cannot silently turn into an evergreen vacancy.
  if (raw.expirationDate && !suppliedExpiry) throw new Error("Invalid Reed expiry");
  const posted = reedDate(raw.datePosted ?? raw.date);
  const today = now.toISOString().slice(0, 10);
  const anchor = posted && posted < today ? posted : today;
  const cap = new Date(Date.parse(anchor) + 30 * 86400000).toISOString().slice(0, 10);
  const expiry = suppliedExpiry && suppliedExpiry < cap ? suppliedExpiry : cap;
  const min = money(raw.minimumSalary),
    max = money(raw.maximumSalary);
  if (min !== null && max !== null && min > max) throw new Error("Invalid Reed salary range");
  return {
    title,
    company: text(raw.employerName),
    location: text(raw.locationName),
    sector,
    description: text(raw.jobDescription, 100000),
    sourceId: String(id),
    sourceUrl: reedSourceUrl(raw.jobUrl),
    posted,
    expiry,
    salaryMin: min,
    salaryMax: max,
    salaryCurrency: text(raw.currency, 10),
    salaryPeriod: text(raw.salaryType, 50),
  };
}
export type ReedVacancy = NonNullable<ReturnType<typeof normaliseReedJob>>;
export async function saveReedJob(
  env: AppEnv,
  job: ReedVacancy,
  guard?: () => D1PreparedStatement,
) {
  // Conflict target matches the existing partial unique index. Never overwrite
  // staff status, curated skill requirements or consultant pipeline records.
  const statement = env.DB.prepare(
    `INSERT INTO jobs
    (id,created_at,title,company,location,sector,description,must_have_skills,nice_to_have_skills,status,source,source_id,source_url,posted_date,expiry_date,salary_min,salary_max,salary_currency,salary_period)
    VALUES (?,?,?,?,?,?,?,'[]','[]','open','reed',?,?,?,?,?,?,?,?)
    ON CONFLICT(source,source_id) WHERE source_id IS NOT NULL DO UPDATE SET
      title=excluded.title,company=excluded.company,location=excluded.location,sector=excluded.sector,
      description=excluded.description,source_url=excluded.source_url,
      posted_date=COALESCE(jobs.posted_date,excluded.posted_date),
      expiry_date=CASE WHEN jobs.expiry_date IS NOT NULL AND jobs.expiry_date < excluded.expiry_date THEN jobs.expiry_date ELSE excluded.expiry_date END,
      salary_min=excluded.salary_min,salary_max=excluded.salary_max,
      salary_currency=excluded.salary_currency,salary_period=excluded.salary_period`,
  ).bind(
    `job_${crypto.randomUUID().replace(/-/g, "")}`,
    Date.now(),
    job.title,
    job.company,
    job.location,
    job.sector,
    job.description,
    job.sourceId,
    job.sourceUrl,
    job.posted,
    job.expiry,
    job.salaryMin,
    job.salaryMax,
    job.salaryCurrency,
    job.salaryPeriod,
  );
  const result = guard ? (await env.DB.batch([guard(), statement]))[1] : await statement.run();
  if (!result.success) throw new Error("Vacancy save failed");
}

export async function syncReedJobs(
  env: AppEnv,
  data: { keywords: string; sector: ReedSector; resultsToTake: number },
  progress?: { offset: number; save: (job: ReedVacancy) => Promise<void> },
): Promise<ReedSyncResult> {
  if (!env.REED_API_KEY) throw new Error("REED_API_KEY not configured");
  if (
    !Number.isInteger(data.resultsToTake) ||
    data.resultsToTake < 1 ||
    data.resultsToTake > 500 ||
    !(data.sector in sectorTitles)
  )
    throw new Error("Invalid sync request");
  if (progress && (!Number.isSafeInteger(progress.offset) || progress.offset < 0))
    throw new Error("Invalid cursor");
  const started = Date.now();
  const headers = {
    Authorization: `Basic ${btoa(`${env.REED_API_KEY}:`)}`,
    Accept: "application/json",
  };
  const read = async (url: string) => {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Reed request failed (${response.status})`);
    return response.json();
  };
  const result: ReedSyncResult = { saved: 0, skipped: 0, failed: 0, total: 0, partial: false };
  const seen = new Set<number>();
  const end = (progress?.offset ?? 0) + data.resultsToTake;
  if (progress) {
    result.nextOffset = progress.offset;
    result.exhausted = false;
  }
  for (let offset = progress?.offset ?? 0; offset < end; ) {
    const take = Math.min(100, end - offset);
    const params = new URLSearchParams({
      keywords:
        data.keywords.trim() || (data.sector === "construction" ? "construction" : "software"),
      resultsToTake: String(take),
      resultsToSkip: String(offset),
    });
    let body;
    try {
      body = await read(`https://www.reed.co.uk/api/1.0/search?${params}`);
    } catch {
      result.failed++;
      result.partial = true;
      break;
    }
    if (!body || !Array.isArray(body.results) || body.results.length > take) {
      result.failed++;
      result.partial = true;
      break;
    }
    for (const raw of body.results) {
      if (Date.now() - started > 90000) {
        result.partial = true;
        return result;
      }
      result.total++;
      const id = raw?.jobId;
      if (!Number.isSafeInteger(id) || id <= 0) {
        result.failed++;
        if (progress) {
          result.partial = true;
          return result;
        }
        continue;
      }
      if (seen.has(id)) {
        result.skipped++;
        if (progress) result.nextOffset!++;
        continue;
      }
      seen.add(id);
      try {
        const detail = await read(`https://www.reed.co.uk/api/1.0/jobs/${id}`);
        if (
          !detail ||
          typeof detail !== "object" ||
          Array.isArray(detail) ||
          (detail.jobId != null && detail.jobId !== id)
        )
          throw new Error("Invalid vacancy detail");
        const job = normaliseReedJob(
          { ...detail, date: detail.date ?? raw.date, jobUrl: detail.jobUrl ?? raw.jobUrl },
          id,
          data.sector,
        );
        if (!job) {
          result.skipped++;
          if (progress) result.nextOffset!++;
          continue;
        }
        await (progress ? progress.save(job) : saveReedJob(env, job));
        result.saved++;
        if (progress) result.nextOffset!++;
      } catch {
        result.failed++;
        if (progress) {
          result.partial = true;
          return result;
        }
      }
    }
    offset += body.results.length;
    if (
      body.results.length < take ||
      (Number.isSafeInteger(body.totalResults) && offset >= body.totalResults)
    ) {
      if (progress) result.exhausted = true;
      break;
    }
    if (offset >= end) result.partial = true;
  }
  result.partial ||= result.failed > 0;
  return result;
}
