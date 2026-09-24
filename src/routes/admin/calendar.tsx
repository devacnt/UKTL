import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/app/AppLayout";
import {
  calendarsFn,
  connectCalendarFn,
  syncCalendarFn,
  disconnectCalendarFn,
} from "@/lib/calendar-sync-functions";
export const Route = createFileRoute("/admin/calendar")({
  validateSearch: (s) => ({
    result: ["connected", "declined", "failed"].includes(String(s.result))
      ? String(s.result)
      : undefined,
  }),
  loader: () => calendarsFn(),
  component: Calendars,
});
function Calendars() {
  const data = Route.useLoaderData(),
    { result } = Route.useSearch(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      await router.invalidate();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Calendar action failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Consultations"
        title="Connected calendars"
        lede="Sync UKTL consultations to the firm's Google or Outlook primary calendar, and use external busy times to block new bookings."
      />
      <p className="text-sm text-ink-soft mb-6">
        Manage consultation times and cancellations in UKTL. External event edits do not change a
        candidate’s appointment. Only the time and a generic appointment title are exported;
        candidate details and HR notes remain in UKTL. Synchronization runs periodically, so
        external changes are not instant.
      </p>
      {result && (
        <p role="status" className="mb-4">
          {result === "connected"
            ? "Calendar connected. Sync it now before accepting bookings."
            : result === "declined"
              ? "Calendar permission was declined."
              : "Connection failed or expired. Sign in with staff MFA and try again."}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4">
          {notice}
        </p>
      )}
      <div className="grid md:grid-cols-2 gap-5">
        {data.providers.map((p) => {
          const c = data.connections.find((c) => c.provider === p.provider);
          return (
            <section className="border border-rule rounded p-5" key={p.provider}>
              <h2 className="font-display text-2xl">
                {p.provider === "google" ? "Google Calendar" : "Microsoft Outlook"}
              </h2>
              {!p.configured && (
                <p className="my-4">
                  Server OAuth credentials, canonical site URL and calendar encryption key are
                  required before connecting.
                </p>
              )}
              {c ? (
                <>
                  <p className="my-4">
                    Last successful sync:{" "}
                    {c.last_sync_at
                      ? new Date(Number(c.last_sync_at)).toLocaleString("en-GB")
                      : "Not yet synchronized"}
                  </p>
                  {c.last_error && <p role="alert">{c.last_error}</p>}
                  <div className="flex gap-5 my-4">
                    <button
                      disabled={busy || !p.configured}
                      className="underline disabled:opacity-50"
                      onClick={() =>
                        void act(async () => {
                          const r = await syncCalendarFn({ data: { provider: p.provider } });
                          setNotice(
                            r.status === "synced"
                              ? "Calendar synchronized."
                              : r.status === "busy"
                                ? "Synchronization already running or staff access inactive."
                                : r.error,
                          );
                        })
                      }
                    >
                      Sync now
                    </button>
                    <button
                      disabled={busy}
                      className="underline"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Disconnect this calendar? Existing external events stay on that calendar; UKTL appointments are not cancelled.",
                          )
                        )
                          void act(async () => {
                            await disconnectCalendarFn({ data: { provider: p.provider } });
                          });
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                </>
              ) : (
                <button
                  disabled={busy || !p.configured}
                  className="border border-ink rounded px-5 py-3 mt-4 disabled:opacity-50"
                  onClick={() =>
                    void act(async () => {
                      const r = await connectCalendarFn({ data: { provider: p.provider } });
                      window.location.assign(r.url);
                    })
                  }
                >
                  Connect {p.provider === "google" ? "Google" : "Outlook"}
                </button>
              )}
              {p.redirect && (
                <p className="text-xs break-all text-ink-soft mt-5">OAuth callback: {p.redirect}</p>
              )}
            </section>
          );
        })}
      </div>
      <p className="text-sm mt-6">
        A connected calendar with a failed sync, availability older than 10 minutes, or insufficient
        coverage prevents new native bookings until refreshed. Configure the scheduled worker before
        enabling this integration.
      </p>
    </>
  );
}
