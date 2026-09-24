import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin, requireViewer } from "./server/viewer";
import { getRequestEnv as getEnv } from "./server/request-env";
import { calendarConfig, startCalendarConnection, providers } from "./server/calendar-provider";
import { syncCalendar } from "./server/calendar-sync";
const input = (raw: unknown) =>
  z
    .object({ provider: z.enum(providers) })
    .strict()
    .parse(raw);
export const calendarsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const env = await getEnv();
  const connections = await env.DB.prepare(
    "SELECT provider,connected_at,last_sync_at,last_error,busy_until FROM calendar_connections ORDER BY provider",
  ).all<{
    provider: string;
    connected_at: number;
    last_sync_at: number | null;
    last_error: string | null;
    busy_until: number | null;
  }>();
  return {
    connections: connections.results ?? [],
    providers: providers.map((provider) => {
      try {
        return { provider, configured: true, redirect: calendarConfig(env, provider).redirect };
      } catch {
        return { provider, configured: false, redirect: null };
      }
    }),
  };
});
export const connectCalendarFn = createServerFn({ method: "POST" })
  .inputValidator(input)
  .handler(async ({ data }) => {
    await requireAdmin();
    const viewer = await requireViewer();
    return { url: await startCalendarConnection(await getEnv(), data.provider, viewer.userId!) };
  });
export const syncCalendarFn = createServerFn({ method: "POST" })
  .inputValidator(input)
  .handler(async ({ data }) => {
    await requireAdmin();
    return syncCalendar(await getEnv(), data.provider);
  });
export const disconnectCalendarFn = createServerFn({ method: "POST" })
  .inputValidator(input)
  .handler(async ({ data }) => {
    await requireAdmin();
    const env = await getEnv();
    // Do not delete refresh credentials while an authorized worker is using them.
    const result = await env.DB.prepare(
      "DELETE FROM calendar_connections WHERE provider=? AND (lease_until IS NULL OR lease_until<?) RETURNING provider",
    )
      .bind(data.provider, Date.now())
      .first();
    if (!result)
      throw new Error("Calendar is syncing or already disconnected. Wait before trying again");
    return { ok: true };
  });
