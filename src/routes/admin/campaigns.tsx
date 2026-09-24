import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  campaignsFn,
  createCampaignFn,
  previewCampaignFn,
  scheduleCampaignFn,
  cancelCampaignFn,
} from "@/lib/campaign-functions";
import { PageHeader } from "@/components/app/AppLayout";
export const Route = createFileRoute("/admin/campaigns")({
  loader: () => campaignsFn(),
  component: Campaigns,
});
function Campaigns() {
  const { campaigns, configured, queue } = Route.useLoaderData(),
    router = useRouter();
  const [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [sector, setSector] = useState(""),
    [when, setWhen] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<
      (Awaited<ReturnType<typeof previewCampaignFn>> & { id: string }) | null
    >(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }
  const input = "block w-full border border-rule rounded bg-paper p-3 mt-1";
  return (
    <>
      <PageHeader
        eyebrow="Communications"
        title="Email campaigns"
        lede="Draft and review job updates for candidates who opted in. Each recipient receives an individual email and an inbox copy."
      />
      {!configured && (
        <p role="status" className="mb-6">
          Sending is disabled until the email provider and site URL are configured.
        </p>
      )}
      <aside className="border border-rule rounded p-4 mb-6">
        <h2 className="font-display text-xl">Delivery queue</h2>
        <p>
          {queue.length
            ? queue.map((q) => `${q.count} ${q.status}`).join(" · ")
            : "No queued deliveries"}
        </p>
        <p className="text-sm text-ink-soft mt-2">
          Failed sends retry up to three times within 23 hours. Interrupted sends remain in
          “sending” for provider-log reconciliation. Cancelling stops remaining sends; a delivery
          already in progress may complete.
        </p>
      </aside>
      {error && (
        <p role="alert" className="mb-4">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            await createCampaignFn({ data: { subject, body, sector } });
            setSubject("");
            setBody("");
          });
        }}
        className="space-y-4 border border-rule rounded p-5 mb-8"
      >
        <h2 className="font-display text-2xl">New draft</h2>
        <label className="block">
          Subject
          <input
            required
            minLength={3}
            maxLength={200}
            className={input}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <label className="block">
          Message
          <textarea
            required
            minLength={20}
            maxLength={8000}
            rows={6}
            className={input}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <label className="block">
          Mandate sector (optional)
          <input
            maxLength={100}
            className={input}
            value={sector}
            onChange={(e) => setSector(e.target.value)}
          />
          <span className="text-sm text-ink-soft">
            An exact sector restricts this to candidates matched to that sector. Blank includes all
            opted-in candidates. Maximum 500.
          </span>
        </label>
        <button disabled={busy} className="border border-ink rounded px-4 py-2">
          Save draft
        </button>
      </form>
      {preview && (
        <section className="border border-accent rounded p-5 mb-8">
          <h2 className="font-display text-2xl">Review: {preview.subject}</h2>
          <p className="whitespace-pre-wrap break-words my-4">{preview.body}</p>
          <p>{preview.recipients.length} opted-in recipients</p>
          <details className="my-4">
            <summary>Review recipients</summary>
            <ul className="max-h-56 overflow-auto">
              {preview.recipients.map((r) => (
                <li key={r.auth_user_id}>
                  {r.name || "Candidate"} · {r.email}
                </li>
              ))}
            </ul>
          </details>
          <label className="block">
            Schedule (your local time; blank sends on the next worker run)
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className={input}
            />
          </label>
          <label className="block mt-4">
            Type SEND to confirm this audience
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className={input}
            />
          </label>
          <button
            disabled={
              busy ||
              !configured ||
              confirmation !== "SEND" ||
              !preview.recipients.length ||
              preview.recipients.length > 500
            }
            className="border border-ink rounded px-4 py-2 mt-4 disabled:opacity-50"
            onClick={() =>
              void act(async () => {
                await scheduleCampaignFn({
                  data: {
                    id: preview.id,
                    fingerprint: preview.fingerprint,
                    scheduledAt: when ? new Date(when).getTime() : Date.now(),
                    confirmation: "SEND",
                  },
                });
                setPreview(null);
                setConfirmation("");
              })
            }
          >
            Confirm and schedule
          </button>
        </section>
      )}
      <div className="space-y-4">
        {campaigns.map((c) => (
          <article key={c.id} className="border border-rule rounded p-5">
            <h2 className="font-display text-xl">{c.subject}</h2>
            <p className="text-sm my-2">
              {c.status} · {c.sent}/{c.recipient_count} sent · {c.failed} failed · {c.skipped}{" "}
              skipped
            </p>
            {c.scheduled_at && (
              <p className="text-sm">
                Scheduled: {new Date(Number(c.scheduled_at)).toLocaleString("en-GB")}
              </p>
            )}
            <div className="flex gap-4 mt-3">
              {c.status === "draft" && (
                <button
                  disabled={busy}
                  className="underline"
                  onClick={() =>
                    void act(async () => {
                      setPreview({
                        ...(await previewCampaignFn({ data: { id: c.id } })),
                        id: c.id,
                      });
                      setConfirmation("");
                    })
                  }
                >
                  Preview audience
                </button>
              )}
              {["draft", "scheduled"].includes(c.status) && (
                <button
                  disabled={busy}
                  className="underline"
                  onClick={() =>
                    void act(async () => {
                      await cancelCampaignFn({ data: { id: c.id } });
                      if (preview?.id === c.id) setPreview(null);
                    })
                  }
                >
                  Cancel remaining sends
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
