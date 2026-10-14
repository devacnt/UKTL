/** Only link to the verified Reed jobs host; never trust an imported URL. */
export function reedApplicationUrl(job: {source?: string | null; source_url?: string | null; status: string; expiry_date?: string | null}, today = new Date().toISOString().slice(0,10)): string | null {
  if (job.source !== "reed" || job.status !== "open" || (job.expiry_date && job.expiry_date < today)) return null;
  try {
    const url = new URL(job.source_url ?? "");
    return url.protocol === "https:" && ["reed.co.uk", "www.reed.co.uk"].includes(url.hostname) && !url.username && !url.password && !url.port && url.pathname.startsWith("/jobs/") ? url.href : null;
  } catch { return null; }
}
