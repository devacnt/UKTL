import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "@/lib/server/env";
import { validMaintenanceSecret } from "@/lib/server/processing";
import { runCommunications } from "@/lib/server/communications";
import { syncCalendar } from "@/lib/server/calendar-sync";
import { enforceRateLimit } from "@/lib/server/ratelimit";
export const Route = createFileRoute("/api/communications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = { "Cache-Control": "no-store" };
        try {
          const env = await getEnv();
          if (
            !(await validMaintenanceSecret(request.headers.get("authorization"), env.CRON_SECRET))
          )
            return new Response("Unauthorized", { status: 401, headers });
          await enforceRateLimit(env, "cvWorker", "communications");
          const scope = new URL(request.url).searchParams.get("scope") ?? "email";
          if (!["email", "google", "outlook"].includes(scope))
            return new Response("Invalid scope", { status: 400, headers });
          if (scope === "email") return Response.json(await runCommunications(env), { headers });
          const connections = await env.DB.prepare(
            "SELECT provider FROM calendar_connections WHERE provider=?",
          )
            .bind(scope)
            .all<{ provider: "google" | "outlook" }>();
          const calendars = [];
          for (const c of connections.results ?? [])
            calendars.push({ provider: c.provider, ...(await syncCalendar(env, c.provider)) });
          return Response.json({ calendars }, { headers });
        } catch {
          return Response.json(
            { error: "Communications worker unavailable" },
            { status: 503, headers },
          );
        }
      },
    },
  },
});
