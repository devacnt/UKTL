import type { Job } from "./schemas/job.ts";

/** Shared by the list and swipe views so changing view preserves the results. */
export function filterJobs(jobs: Job[], query: string, location: string): Job[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const place = location.trim().toLocaleLowerCase();
  return jobs.filter(job => {
    const searchable = [job.title, job.company, job.sector, job.description, ...job.must_have_skills, ...job.nice_to_have_skills].filter(Boolean).join(" ").toLocaleLowerCase();
    return terms.every(term => searchable.includes(term)) && (!place || (job.location ?? "").toLocaleLowerCase().includes(place));
  });
}
