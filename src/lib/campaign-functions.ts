import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestEnv as getEnv } from "./server/request-env";
import { requireAdmin, requireViewer } from "./server/viewer";
import { campaignRecipients, audienceFingerprint, scheduleCampaign } from "./server/communications";
const id = z.string().uuid();
export const campaignsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const env = await getEnv();
  const rows = await env.DB.prepare(
    `SELECT c.*,count(m.id) FILTER(WHERE m.status='sent')::int AS sent,
 count(m.id) FILTER(WHERE m.status='failed')::int AS failed,count(m.id) FILTER(WHERE m.status='skipped')::int AS skipped
 FROM email_campaigns c LEFT JOIN candidate_messages m ON m.campaign_id=c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 50`,
  ).all<{
    id: string;
    subject: string;
    body: string;
    sector: string;
    status: string;
    created_at: number;
    scheduled_at: number | null;
    recipient_count: number;
    sent: number;
    failed: number;
    skipped: number;
  }>();
  const queue = await env.DB.prepare(
    "SELECT status,count(*)::int AS count FROM communication_jobs GROUP BY status ORDER BY status",
  ).all<{ status: string; count: number }>();
  return {
    queue: queue.results ?? [],
    campaigns: rows.results ?? [],
    configured: !!env.RESEND_API_KEY && !!env.SITE_URL?.startsWith("https://"),
  };
});
export const createCampaignFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        subject: z
          .string()
          .trim()
          .min(3)
          .max(200)
          .refine((s) => !/[\r\n]/.test(s)),
        body: z.string().trim().min(20).max(8000),
        sector: z.string().trim().max(100),
      })
      .strict()
      .parse(raw),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const viewer = await requireViewer(),
      env = await getEnv(),
      campaignId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO email_campaigns(id,subject,body,sector,created_by,created_at) VALUES(?::uuid,?,?,?,?::uuid,?)",
    )
      .bind(campaignId, data.subject, data.body, data.sector, viewer.userId!, Date.now())
      .run();
    return { id: campaignId };
  });
export const previewCampaignFn = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ id }).strict().parse(raw))
  .handler(async ({ data }) => {
    await requireAdmin();
    const env = await getEnv(),
      campaign = await env.DB.prepare(
        "SELECT subject,body,sector FROM email_campaigns WHERE id=?::uuid AND status='draft'",
      )
        .bind(data.id)
        .first<{ subject: string; body: string; sector: string }>();
    if (!campaign) throw new Error("Draft not found");
    const recipients = await campaignRecipients(env, campaign.sector);
    return { ...campaign, recipients, fingerprint: await audienceFingerprint(recipients) };
  });
export const scheduleCampaignFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        id,
        fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
        scheduledAt: z.number().int(),
        confirmation: z.literal("SEND"),
      })
      .strict()
      .parse(raw),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const now = Date.now();
    if (data.scheduledAt < now - 60000 || data.scheduledAt > now + 90 * 86400000)
      throw new Error("Choose a time within the next 90 days");
    return scheduleCampaign(
      await getEnv(),
      data.id,
      data.fingerprint,
      Math.max(now, data.scheduledAt),
    );
  });
export const cancelCampaignFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ id }).strict().parse(raw))
  .handler(async ({ data }) => {
    await requireAdmin();
    const env = await getEnv();
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE email_campaigns SET status='cancelled' WHERE id=?::uuid AND status IN('draft','scheduled')",
      ).bind(data.id),
      env.DB.prepare(
        "UPDATE communication_jobs SET status='skipped',last_error='Campaign cancelled' WHERE status IN('pending','failed') AND message_id IN(SELECT id FROM candidate_messages WHERE campaign_id=?::uuid)",
      ).bind(data.id),
      env.DB.prepare(
        "UPDATE candidate_messages SET status='skipped',error='Campaign cancelled' WHERE campaign_id=?::uuid AND status IN('pending','failed')",
      ).bind(data.id),
    ]);
    return { ok: true };
  });
export const unsubscribeCampaignsFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({ token: z.string().regex(/^[0-9a-f]{64}$/) })
      .strict()
      .parse(raw),
  )
  .handler(async ({ data }) => {
    await (
      await getEnv()
    ).DB.prepare(
      "UPDATE communication_preferences SET campaigns_enabled=false,updated_at=? WHERE unsubscribe_token=?",
    )
      .bind(Date.now(), data.token)
      .run();
    return { ok: true };
  });
