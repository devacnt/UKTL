import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteLayout, Wrap } from "@/components/site/Layout";
import { unsubscribeCampaignsFn } from "@/lib/campaign-functions";
export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s) => ({
    token: typeof s.token === "string" && /^[0-9a-f]{64}$/.test(s.token) ? s.token : "",
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: Unsubscribe,
});
function Unsubscribe() {
  const { token } = Route.useSearch(),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <SiteLayout>
      <Wrap className="py-40">
        <h1 className="font-display text-4xl">Job update preferences</h1>
        <p className="my-5">
          Stop bulk job updates and campaigns. Appointment emails and individual recruitment
          messages are separate.
        </p>
        {token ? (
          <button
            disabled={busy || status === "You have been unsubscribed."}
            className="border border-ink rounded px-5 py-3"
            onClick={async () => {
              setBusy(true);
              try {
                await unsubscribeCampaignsFn({ data: { token } });
                setStatus("You have been unsubscribed.");
              } catch {
                setStatus("Could not save your preference. Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Unsubscribe from campaigns
          </button>
        ) : (
          <p>
            This link is incomplete. You can also manage campaign preferences in your account’s
            Messages page.
          </p>
        )}
        <p role="status" className="mt-4">
          {status}
        </p>
      </Wrap>
    </SiteLayout>
  );
}
