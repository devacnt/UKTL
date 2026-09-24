import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  adminDeleteJobFn,
  adminListJobsFn,
  syncReedJobsFn,
  reedSyncStatesFn,
} from "@/lib/functions";
import type { Job } from "@/lib/schemas/job";
import { AdminHeader, AdminTable, AdminTr, AdminTd, AdminBtn } from "../../admin";

export const Route = createFileRoute("/admin/jobs/")({
  loader: async () => {
    const [jobs, syncs] = await Promise.all([adminListJobsFn(), reedSyncStatesFn()]);
    return { jobs, syncs };
  },
  component: AdminJobsList,
});

function AdminJobsList() {
  const { jobs, syncs } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    saved: number;
    skipped: number;
    failed: number;
    partial: boolean;
  } | null>(null);
  const [sector, setSector] = useState<"construction" | "technology">("construction");

  async function syncFromReed() {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncReedJobsFn({ data: { keywords: "", sector, resultsToTake: 200 } });
      setSyncResult(result);
      await router.invalidate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Reed sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function deleteJob(id: string, title: string) {
    if (!confirm(`Delete mandate "${title}"? Its pipeline and placement history are deleted too. This cannot be undone. To keep the record, close it or mark it filled instead.`)) return;
    setBusy(id);
    try {
      await adminDeleteJobFn({ data: { id } });
      await router.invalidate();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <AdminHeader
        title="Mandates"
        sub={`${jobs.filter((j: Job) => effectiveStatus(j) === "open").length} open · ${jobs.filter((j: Job) => j.status === "filled").length} filled · ${jobs.length} total`}
        actions={
          <div className="flex items-center gap-3">
            <select
              aria-label="Reed sector"
              value={sector}
              disabled={syncing}
              onChange={(e) => setSector(e.target.value as "construction" | "technology")}
              className="border border-rule rounded-md p-2 text-sm"
            >
              <option value="construction">Construction</option>
              <option value="technology">Technology</option>
            </select>
            <button
              onClick={syncFromReed}
              disabled={syncing}
              className="text-[12px] px-4 py-2 border border-rule text-ink-soft rounded-full hover:border-ink hover:text-ink transition-colors disabled:opacity-40"
            >
              {syncing ? "Syncing…" : "Continue Reed sync"}
            </button>
            <Link
              to="/admin/jobs/new"
              className="text-[12px] px-4 py-2 border border-ink bg-ink text-paper rounded-full hover:opacity-90 transition-opacity"
            >
              + Add mandate
            </Link>
          </div>
        }
      />

      {syncs.length > 0 && (
        <section aria-label="Vacancy sync progress" className="mb-5 grid gap-3 sm:grid-cols-2">
          {syncs.map((sync) => (
            <div key={sync.sector} className="rounded-md border border-rule p-4 text-sm">
              <p className="font-medium capitalize">
                {sync.sector}: {sync.status}
              </p>
              <p>
                {sync.saved_count} saves · {sync.skipped_count} excluded or duplicate results
              </p>
              {sync.status !== "complete" && (
                <p>
                  Search {sync.query_index + 1} · next result {sync.result_offset + 1} · attempt{" "}
                  {sync.attempts}/3
                </p>
              )}
              {sync.completed_at && (
                <p>Last cycle finished: {new Date(sync.completed_at).toISOString()}</p>
              )}
              {sync.last_error && (
                <p role="status" className="mt-2 text-ink-soft">
                  {sync.last_error}
                </p>
              )}
              {sync.status === "failed" && (
                <p>Select this sector and continue to retry the saved position.</p>
              )}
            </div>
          ))}
        </section>
      )}

      {syncResult && (
        <div className="mb-4 px-4 py-3 rounded-md border border-accent/30 bg-accent-soft text-sm text-accent">
          Reed sync {syncResult.partial ? "partial" : "finished"} — {syncResult.saved} vacancies
          saved or refreshed
          {syncResult.skipped > 0 ? `, ${syncResult.skipped} outside sector or duplicate` : ""}
          {syncResult.failed > 0 ? `, ${syncResult.failed} failed — retry the sync` : ""}.
          {syncResult.partial &&
            " Progress is saved; continue this sector to process the next batch."}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="border border-rule border-dashed rounded-md p-10 text-center text-ink-soft text-sm">
          No mandates yet.{" "}
          <Link to="/admin/jobs/new" className="underline">
            Add the first one
          </Link>
          .
        </div>
      ) : (
        <AdminTable head={["Title", "Company", "Location", "Seniority", "Status", "Closes / filled", ""]}>
          {jobs.map((j: Job) => (
            <AdminTr key={j.id}>
              <AdminTd>
                <Link
                  to="/admin/jobs/$id"
                  params={{ id: j.id }}
                  className="font-medium text-ink hover:underline"
                >
                  {j.title}
                </Link>
              </AdminTd>
              <AdminTd className="text-ink-soft">{j.company ?? "—"}</AdminTd>
              <AdminTd className="text-ink-soft">{j.location ?? "—"}</AdminTd>
              <AdminTd className="text-ink-soft capitalize">{j.seniority ?? "—"}</AdminTd>
              <AdminTd>
                <JobStatus job={j} />
              </AdminTd>
              <AdminTd className="text-xs text-ink-mute tabular-nums">
                {j.status === "filled"
                  ? `${j.filled_candidate_name ?? "Candidate"} · ${j.filled_at ? new Date(j.filled_at).toLocaleDateString("en-GB") : ""}`
                  : j.expiry_date
                    ? new Date(j.expiry_date.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB")
                    : "No closing date"}
              </AdminTd>
              <AdminTd className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Link to="/admin/jobs/$id" params={{ id: j.id }}>
                    <AdminBtn>{j.status === "filled" ? "View" : "Edit & rank"}</AdminBtn>
                  </Link>
                  <AdminBtn
                    variant="danger"
                    onClick={() => deleteJob(j.id, j.title)}
                    disabled={busy === j.id}
                  >
                    Delete
                  </AdminBtn>
                </div>
              </AdminTd>
            </AdminTr>
          ))}
        </AdminTable>
      )}
    </>
  );
}

const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(Date.now());

function effectiveStatus(j: Job): "open" | "closed" | "filled" | "expired" {
  if (j.status === "open" && j.expiry_date && j.expiry_date.slice(0, 10) < todayIso()) return "expired";
  return j.status;
}

function JobStatus({ job }: { job: Job }) {
  const status = effectiveStatus(job);
  const tone =
    status === "open"
      ? "border-accent/30 bg-accent-soft text-accent"
      : status === "filled"
        ? "border-ink text-ink"
        : "border-rule text-ink-mute";
  return <span className={`font-mono text-[11px] px-2.5 py-0.5 rounded-full border ${tone}`}>{status}</span>;
}
