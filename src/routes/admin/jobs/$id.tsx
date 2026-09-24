import { useState } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { JobCandidateRanking } from "@/components/app/JobCandidateRanking";
import { adminCreateJobFn, adminUpdateJobFn } from "@/lib/functions";
import { adminListJobsFn } from "@/lib/functions";
import type { Job } from "@/lib/schemas/job";
import {
  AdminHeader, AdminField, AdminBtn,
  inputCls, textareaCls, selectCls,
} from "../../admin";

export const Route = createFileRoute("/admin/jobs/$id")({
  loader: async ({ params }) => {
    const jobs = await adminListJobsFn();
    const job = jobs.find((j) => j.id === params.id);
    if (!job) throw notFound();
    return job;
  },
  component: EditJobPage,
});

function EditJobPage() {
  const job = Route.useLoaderData();
  return (
    <>
      <JobForm key={job.id} mode="edit" initial={job} />
      <JobCandidateRanking job={job} />
    </>
  );
}

const DURATIONS = [
  { days: 14, label: "2 weeks" },
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
  { days: 90, label: "90 days" },
];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(Date.now());
const addDays = (from: string, days: number) => {
  const [y, m, d] = from.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function JobForm({ mode, initial }: { mode: "create" | "edit"; initial?: Job }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [sector, setSector] = useState(initial?.sector ?? "");
  const [seniority, setSeniority] = useState<string>(initial?.seniority ?? "mid");
  const [minYears, setMinYears] = useState(initial?.min_years_experience?.toString() ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [mustHave, setMustHave] = useState((initial?.must_have_skills ?? []).join(", "));
  const [niceToHave, setNiceToHave] = useState((initial?.nice_to_have_skills ?? []).join(", "));
  const filled = initial?.status === "filled";
  const [status, setStatus] = useState<"open" | "closed">(initial?.status === "closed" ? "closed" : "open");
  const [postedDate, setPostedDate] = useState(initial?.posted_date?.slice(0, 10) ?? today());
  const [expiryDate, setExpiryDate] = useState(initial?.expiry_date?.slice(0, 10) ?? (initial ? "" : addDays(today(), 30)));
  const duration = expiryDate ? daysBetween(postedDate, expiryDate) : null;
  const expired = !!expiryDate && expiryDate < today();

  function parseSkills(raw: string): string[] {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      title,
      company: company || null,
      location: location || null,
      sector: sector || null,
      seniority: seniority || null,
      min_years_experience: minYears ? parseInt(minYears, 10) : null,
      description: description || null,
      must_have_skills: parseSkills(mustHave),
      nice_to_have_skills: parseSkills(niceToHave),
      status,
      posted_date: postedDate || null,
      expiry_date: expiryDate || null,
    };
    try {
      if (mode === "create") {
        const { id } = await adminCreateJobFn({ data: payload });
        // Straight to the mandate so the ranked candidates are visible immediately.
        await navigate({ to: "/admin/jobs/$id", params: { id } });
      } else {
        await adminUpdateJobFn({ data: { id: initial!.id, ...payload } });
        await navigate({ to: "/admin/jobs" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <>
      <AdminHeader
        title={mode === "create" ? "Add mandate" : "Edit mandate"}
        sub={mode === "edit" ? initial?.title : undefined}
      />
      <form onSubmit={onSubmit} className="max-w-xl space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <AdminField label="Title">
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Senior Solicitor" />
          </AdminField>
          <AdminField label="Company">
            <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Client company (optional)" />
          </AdminField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <AdminField label="Location">
            <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="London, UK" />
          </AdminField>
          <AdminField label="Sector">
            <input className={inputCls} value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Legal, Finance, Tech…" />
          </AdminField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <AdminField label="Seniority">
            <select className={selectCls} value={seniority} onChange={(e) => setSeniority(e.target.value)}>
              <option value="junior">Junior</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead</option>
              <option value="director">Director</option>
            </select>
          </AdminField>
          <AdminField label="Min. years experience">
            <input className={inputCls} type="number" min={0} value={minYears} onChange={(e) => setMinYears(e.target.value)} placeholder="3" />
          </AdminField>
        </div>

        <AdminField label="Description">
          <textarea className={textareaCls} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Role overview, responsibilities, requirements…" />
        </AdminField>

        <AdminField label="Must-have skills" hint="Comma-separated — used for CV matching and scoring.">
          <input className={inputCls} value={mustHave} onChange={(e) => setMustHave(e.target.value)} placeholder="Contract review, GDPR, Employment law…" />
        </AdminField>

        <AdminField label="Nice-to-have skills" hint="Comma-separated — optional bonus skills.">
          <input className={inputCls} value={niceToHave} onChange={(e) => setNiceToHave(e.target.value)} placeholder="Arbitration, International law…" />
        </AdminField>

        <div className="grid grid-cols-2 gap-4">
          <AdminField label="Posted on">
            <input className={inputCls} type="date" value={postedDate} onChange={(e) => setPostedDate(e.target.value)} required />
          </AdminField>
          <AdminField label="Closes on" hint={expiryDate ? (expired ? "Closing date has passed — hidden from candidates." : `Open for ${duration} day${duration === 1 ? "" : "s"}.`) : "No closing date — stays open until you close it."}>
            <input className={inputCls} type="date" min={postedDate} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </AdminField>
        </div>
        <div className="flex flex-wrap items-center gap-2 -mt-2">
          <span className="text-xs text-ink-mute">Duration:</span>
          {DURATIONS.map((d) => (
            <button
              key={d.days}
              type="button"
              onClick={() => setExpiryDate(addDays(postedDate || today(), d.days))}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${duration === d.days ? "border-ink text-ink" : "border-rule text-ink-soft hover:border-ink"}`}
            >
              {d.label}
            </button>
          ))}
          <button type="button" onClick={() => setExpiryDate("")} className={`text-[11px] px-2.5 py-1 rounded-full border ${!expiryDate ? "border-ink text-ink" : "border-rule text-ink-soft hover:border-ink"}`}>
            No closing date
          </button>
        </div>

        <AdminField label="Status">
          {filled ? (
            <p className="text-sm text-ink-soft">Filled — reopen it from Mandate status below to change this.</p>
          ) : (
            <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as "open" | "closed")}>
              <option value="open">Open — active in matching and discovery until the closing date</option>
              <option value="closed">Closed — hidden from candidates</option>
            </select>
          )}
        </AdminField>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <AdminBtn variant="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : mode === "create" ? "Post mandate and rank candidates" : "Save changes"}
          </AdminBtn>
          <AdminBtn onClick={() => navigate({ to: "/admin/jobs" })}>Cancel</AdminBtn>
          {mode === "edit" && (
            <Link to="/app/jobs/$id" params={{ id: initial!.id }} className="text-[12px] px-3.5 py-1.5 underline text-ink-soft">
              Open pipeline
            </Link>
          )}
        </div>
      </form>
    </>
  );
}
