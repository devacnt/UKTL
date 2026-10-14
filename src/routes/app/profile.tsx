import { PrivacyControls } from "@/components/app/PrivacyControls";
import { AccountType } from "@/components/app/AccountType";
import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  signOutFn,
  getCandidateProfileFn,
  getCandidateSessionFn,
  updateCandidateProfileFn,
} from "@/lib/functions";
import { PageHeader, Pill, ScoreBar, Section, StatCard } from "@/components/app/AppLayout";

export const Route = createFileRoute("/app/profile")({
  // ?edit opens the editor directly (e.g. from the dashboard's "Complete profile").
  validateSearch: (s: Record<string, unknown>): { edit?: boolean } =>
    s.edit === true || s.edit === "true" || s.edit === 1 || s.edit === "1" ? { edit: true } : {},
  loader: async () => {
    const [session, profileData] = await Promise.all([
      getCandidateSessionFn(),
      getCandidateProfileFn(),
    ]);
    return { session, profileData };
  },
  component: ProfilePage,
});

type ScoreBreakdown = {
  contact_information: number;
  experience: number;
  skills: number;
  education: number;
};
type ImprovementReport = {
  contact_information: string;
  experience: string;
  skills: string;
  education: string;
  overall: string;
};

function ProfilePage() {
  const { session, profileData } = Route.useLoaderData();
  const router = useRouter();

  const search = Route.useSearch();
  const [editing, setEditing] = useState(!!search.edit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: profileData.profile?.name ?? "",
    phone: profileData.profile?.phone ?? "",
    location: profileData.profile?.location ?? "",
    sector_preference: (profileData.profile?.sector_preference ?? "") as "" | "construction" | "technology" | "both",
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!session.userId) {
    return (
      <div className="max-w-[480px] mx-auto text-center py-16">
        <h2 className="font-display font-light text-2xl tracking-[-0.02em] mb-3">Sign in to view your profile</h2>
        <p className="text-sm text-ink-soft mb-6">Your CV, match scores, and job discoveries are saved to your account.</p>
        <div className="flex justify-center gap-3">
          <Link to="/auth/login" className="text-sm px-5 py-2.5 bg-ink text-paper rounded-full hover:opacity-90 transition-opacity">
            Sign in
          </Link>
          <Link to="/auth/register" className="text-sm px-5 py-2.5 border border-rule rounded-full hover:border-ink transition-colors">
            Create account
          </Link>
        </div>
      </div>
    );
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      await updateCandidateProfileFn({
        data: {
          name: form.name,
          phone: form.phone || null,
          location: form.location || null,
          sector_preference: form.sector_preference || null,
        },
      });
      setEditing(false);
      toast.success("Profile saved");
      await router.navigate({ to: "/app/profile", search: {}, replace: true });
      router.invalidate();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await signOutFn();
    toast("Signed out");
    await router.navigate({ to: "/" });
    await router.invalidate();
  }

  const profile = profileData.profile;

  return (
    <>
      <AccountType role="candidate" />
      <PageHeader
        eyebrow="My profile"
        title={
          <>
            {profile?.name ? (
              <>
                {profile.name.split(" ")[0]}{" "}
                <em className="not-italic italic font-normal text-ink-soft">
                  {profile.name.split(" ").slice(1).join(" ")}
                </em>
              </>
            ) : (
              <>Your <em className="not-italic italic font-normal text-ink-soft">profile</em></>
            )}
          </>
        }
        lede={session.email ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="text-[13px] px-4 py-2 border border-rule rounded-full hover:border-ink transition-colors"
              >
                Edit profile
              </button>
            )}
            <button
              onClick={handleLogout}
              className="text-[13px] px-4 py-2 border border-rule text-ink-mute rounded-full hover:border-ink hover:text-ink transition-colors"
            >
              Sign out
            </button>
          </div>
        }
      />

      {/* Edit form */}
      {editing && (
        <div className="mb-10 border border-rule rounded-md p-6 bg-paper">
          <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute mb-5">
            — Edit profile
          </div>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <Field label="Full name">
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className={inputCls}
                placeholder="Jane Smith"
              />
            </Field>
            <Field label="Phone">
              <input
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className={inputCls}
                placeholder="+44 7700 000000"
              />
            </Field>
            <Field label="Location">
              <input
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                className={inputCls}
                placeholder="London, UK"
              />
            </Field>
            <Field label="Sector preference">
              <select
                value={form.sector_preference}
                onChange={(e) => setForm((p) => ({ ...p, sector_preference: e.target.value as typeof form.sector_preference }))}
                className={inputCls}
              >
                <option value="">Not specified</option>
                <option value="construction">Construction</option>
                <option value="technology">Technology</option>
                <option value="both">Both</option>
              </select>
            </Field>
          </div>
          {saveError && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
              {saveError}
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-[13px] px-5 py-2 bg-ink text-paper rounded-full hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                if (search.edit) void router.navigate({ to: "/app/profile", search: {}, replace: true });
              }}
              className="text-[13px] px-5 py-2 border border-rule rounded-full hover:border-ink transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* No CV uploaded yet */}
      {!profile?.d1_candidate_id && (
        <div className="mb-10 border border-dashed border-rule rounded-md p-10 text-center">
          <p className="text-ink-soft text-sm mb-4">
            Upload your CV to get a quality score, improvement report, and matched jobs.
          </p>
          <Link
            to="/app/upload"
            className="text-[13px] px-5 py-2.5 bg-ink text-paper rounded-full hover:opacity-90 transition-opacity"
          >
            Upload CV →
          </Link>
        </div>
      )}

      {/* CV data loaded from the D1 candidate linked to this profile */}
      {profile?.d1_candidate_id && (
        <CandidateCvPanel candidateId={profile.d1_candidate_id} />
      )}

      <PrivacyControls />
      {/* Quick links */}
      <Section title="Next steps">
        <div className="grid md:grid-cols-3 gap-4">
          <QuickLink
            to="/app/discover"
            title="Discover jobs"
            description="Swipe through matched vacancies ranked by suitability."
            cta="Start swiping →"
          />
          <QuickLink
            to="/app/hr"
            title="HR & Employment Law"
            description="Get guidance on workplace queries grounded in ACAS."
            cta="Ask a question →"
          />
          <QuickLink
            to="/app/upload"
            title="Re-upload CV"
            description="Update your CV to refresh your quality score and matches."
            cta="Upload new CV →"
          />
        </div>
      </Section>
    </>
  );
}

function CandidateCvPanel({ candidateId }: { candidateId: string }) {
  return (
    <Section title="Your CV">
      <p className="text-sm text-ink-soft mb-4">
        View your latest CV, its processing status and any available assessment.{" "}
        <Link to="/app/candidates/$id" params={{ id: candidateId }} className="underline hover:text-ink">
          View full profile →
        </Link>
      </p>
    </Section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[11px] tracking-[0.12em] uppercase text-ink-mute mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function QuickLink({ to, title, description, cta }: { to: string; title: string; description: string; cta: string }) {
  return (
    <Link
      to={to}
      className="group border border-rule rounded-md p-5 hover:border-ink transition-colors"
    >
      <h3 className="font-medium text-sm text-ink mb-1">{title}</h3>
      <p className="text-xs text-ink-mute leading-relaxed mb-3">{description}</p>
      <span className="text-xs text-ink-soft group-hover:text-ink transition-colors">{cta}</span>
    </Link>
  );
}

const inputCls =
  "w-full border border-rule rounded-md px-4 py-2.5 text-sm bg-paper text-ink placeholder:text-ink-mute focus:outline-none focus:border-ink transition-colors";

export { ScoreBreakdown, ImprovementReport };
