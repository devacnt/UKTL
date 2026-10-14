import { reedApplicationUrl } from "@/lib/reed-link";
export function ReedApply({job}: {job: Parameters<typeof reedApplicationUrl>[0]}) {
  const href = reedApplicationUrl(job);
  if (!href) return null;
  return <div className="my-4 text-sm"><a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 py-3 text-paper">Apply on Reed ↗</a><p className="mt-2 text-ink-soft">Continue on Reed to submit your application. Saving a job here does not apply for it.</p></div>;
}
