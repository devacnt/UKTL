import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestEnv as getEnv } from "./server/request-env";
import { requireViewer } from "./server/viewer";
import { candidateInbox, markMessageRead } from "./server/inbox";

export const inboxFn = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        before: z
          .object({ time: z.number().int().nonnegative(), id: z.string().uuid() })
          .optional(),
      })
      .strict()
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const viewer = await requireViewer();
    return candidateInbox(await getEnv(), viewer.userId!, data.before);
  });
export const markMessageReadFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).strict().parse(raw))
  .handler(async ({ data }) => {
    const viewer = await requireViewer();
    await markMessageRead(await getEnv(), viewer.userId!, data.id);
    return { ok: true };
  });
export const communicationPreferencesFn = createServerFn({ method: "GET" }).handler(async () => {
  const viewer = await requireViewer(),
    env = await getEnv();
  const row = await env.DB.prepare(
    "SELECT campaigns_enabled FROM communication_preferences WHERE user_id=?::uuid",
  )
    .bind(viewer.userId!)
    .first<{ campaigns_enabled: boolean }>();
  return { campaignsEnabled: row?.campaigns_enabled ?? false };
});
export const updateCommunicationPreferencesFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ campaignsEnabled: z.boolean() }).strict().parse(raw))
  .handler(async ({ data }) => {
    const viewer = await requireViewer(),
      env = await getEnv();
    await env.DB.prepare(
      `INSERT INTO communication_preferences(user_id,campaigns_enabled,updated_at) VALUES(?::uuid,?,?)
    ON CONFLICT(user_id) DO UPDATE SET campaigns_enabled=excluded.campaigns_enabled,updated_at=excluded.updated_at`,
    )
      .bind(viewer.userId!, data.campaignsEnabled, Date.now())
      .run();
    return { ok: true };
  });
