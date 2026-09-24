import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/app/AppLayout";
import {
  inboxFn,
  markMessageReadFn,
  communicationPreferencesFn,
  updateCommunicationPreferencesFn,
} from "@/lib/communication-functions";
export const Route = createFileRoute("/app/messages")({
  loader: async () => ({
    inbox: await inboxFn({ data: {} }),
    preferences: await communicationPreferencesFn(),
  }),
  component: Messages,
});
function Messages() {
  const data = Route.useLoaderData(),
    router = useRouter();
  const [extra, setExtra] = useState<typeof data.inbox.messages>([]),
    [cursor, setCursor] = useState(data.inbox.next),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch {
      setError("The change could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="My account"
        title="Messages"
        lede="Messages from your consultant and job-update campaigns. To reply, use the email from your consultant."
      />
      <label className="flex gap-3 items-start border border-rule rounded p-4 mb-8">
        <input
          type="checkbox"
          disabled={busy}
          checked={data.preferences.campaignsEnabled}
          onChange={(e) =>
            void act(async () => {
              await updateCommunicationPreferencesFn({
                data: { campaignsEnabled: e.target.checked },
              });
              await router.invalidate();
            })
          }
        />
        <span>
          Send me occasional job updates and recruitment campaigns. You can turn these off here at
          any time. Appointment and individual recruitment messages are separate.
        </span>
      </label>
      {error && <p role="alert">{error}</p>}
      {data.inbox.messages.length === 0 && (
        <p>No messages yet. Messages appear here after they have been sent.</p>
      )}
      <div className="space-y-4">
        {[...data.inbox.messages, ...extra].map((m) => (
          <article key={m.id} className="border border-rule rounded p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="font-display text-2xl">{m.subject}</h2>
              {!m.read_at && (
                <button
                  disabled={busy}
                  className="underline text-sm"
                  onClick={() =>
                    void act(async () => {
                      await markMessageReadFn({ data: { id: m.id } });
                      setExtra((a) =>
                        a.map((x) => (x.id === m.id ? { ...x, read_at: Date.now() } : x)),
                      );
                      await router.invalidate();
                    })
                  }
                >
                  Mark as read
                </button>
              )}
            </div>
            <p className="text-sm text-ink-soft my-2">
              {new Date(m.created_at).toLocaleDateString("en-GB")}
              {m.job_title ? ` · ${m.job_title}` : ""}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
          </article>
        ))}
      </div>
      {cursor && (
        <button
          disabled={busy}
          className="mt-6 underline"
          onClick={() =>
            void act(async () => {
              const next = await inboxFn({ data: { before: cursor } });
              setExtra((a) => [...a, ...next.messages]);
              setCursor(next.next);
            })
          }
        >
          Load older messages
        </button>
      )}
    </>
  );
}
