import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin, requireViewer } from "@/lib/server/viewer";
import { getRequestEnv } from "@/lib/server/request-env";
import { finishCalendarConnection } from "@/lib/server/calendar-provider";
export const Route = createFileRoute("/api/calendar/callback/$provider")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
        try {
          await requireAdmin();
          const viewer = await requireViewer();
          if (params.provider !== "google" && params.provider !== "outlook")
            return new Response("Unknown calendar provider", { status: 404, headers });
          const query = new URL(request.url).searchParams;
          if (query.has("error"))
            return new Response(null, {
              status: 303,
              headers: { ...headers, Location: "/admin/calendar?result=declined" },
            });
          const state = query.get("state"),
            code = query.get("code");
          if (!state || !code) throw new Error("Incomplete callback");
          await finishCalendarConnection(
            await getRequestEnv(),
            params.provider,
            viewer.userId!,
            state,
            code,
          );
          return new Response(null, {
            status: 303,
            headers: { ...headers, Location: "/admin/calendar?result=connected" },
          });
        } catch {
          return new Response(null, {
            status: 303,
            headers: { ...headers, Location: "/admin/calendar?result=failed" },
          });
        }
      },
    },
  },
});
