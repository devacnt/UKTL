import { z } from "zod";
import type { AppEnv } from "./env";
import {
  calendarToken,
  decryptCalendarSecret,
  encryptCalendarSecret,
  providerRequest,
  digest,
  type CalendarProvider,
} from "./calendar-provider.ts";
const EXTENSION = "String {b5af7f1e-42c5-4fa0-a607-d271ba1edce5} Name UKTLBooking";
export function calendarEventBody(
  provider: CalendarProvider,
  key: string,
  start: number,
  end: number,
) {
  const summary = "UK Talent Link consultation";
  // No candidate names, contact details, HR topics or notes leave UKTL.
  return provider === "google"
    ? {
        id: key,
        summary,
        start: { dateTime: new Date(start).toISOString() },
        end: { dateTime: new Date(end).toISOString() },
        extendedProperties: { private: { uktl: key } },
      }
    : {
        subject: summary,
        start: { dateTime: new Date(start).toISOString(), timeZone: "UTC" },
        end: { dateTime: new Date(end).toISOString(), timeZone: "UTC" },
        transactionId: key,
        singleValueExtendedProperties: [{ id: EXTENSION, value: key }],
      };
}
export function parseBusyWindows(
  provider: CalendarProvider,
  data: unknown,
): { start: number; end: number }[] {
  let values: { start: string; end: string }[];
  if (provider === "google") {
    const parsed = z
      .object({
        calendars: z.object({
          primary: z.object({
            errors: z.array(z.unknown()).optional(),
            busy: z.array(z.object({ start: z.string(), end: z.string() })),
          }),
        }),
      })
      .safeParse(data);
    const calendar = parsed.success ? parsed.data.calendars.primary : null;
    if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy))
      throw new Error("Calendar availability could not be read");
    values = calendar.busy.map((r) => ({ start: r.start, end: r.end }));
  } else {
    const parsed = z
      .object({
        value: z.array(
          z.object({
            isCancelled: z.boolean().optional(),
            showAs: z.string().optional(),
            start: z.object({ timeZone: z.string(), dateTime: z.string() }).optional(),
            end: z.object({ timeZone: z.string(), dateTime: z.string() }).optional(),
          }),
        ),
      })
      .safeParse(data);
    if (!parsed.success) throw new Error("Calendar availability could not be read");
    values = parsed.data.value
      .filter((r) => !r.isCancelled && r.showAs !== "free")
      .map((r) => {
        if (r.start?.timeZone !== "UTC" || r.end?.timeZone !== "UTC")
          throw new Error("Unexpected calendar time zone");
        const utc = (s: unknown) =>
          typeof s === "string" ? (/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + "Z") : "";
        return { start: utc(r.start.dateTime), end: utc(r.end.dateTime) };
      });
  }
  return values.map((r) => {
    const start = Date.parse(r.start),
      end = Date.parse(r.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      throw new Error("Invalid calendar availability");
    return { start, end };
  });
}
async function busyWindows(provider: CalendarProvider, token: string, from: number, to: number) {
  if (provider === "google") {
    const r = await providerRequest(provider, token, "/freeBusy", "POST", {
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      items: [{ id: "primary" }],
    });
    if (r.status !== 200) throw new Error("Calendar availability failed");
    return parseBusyWindows(provider, r.data);
  }
  let path =
    "/me/calendarView?" +
    new URLSearchParams({
      startDateTime: new Date(from).toISOString(),
      endDateTime: new Date(to).toISOString(),
      $top: "1000",
      $select: "start,end,isCancelled,showAs",
    });
  const result: { start: number; end: number }[] = [];
  for (let page = 0; page < 5; page++) {
    const r = await providerRequest(provider, token, path);
    if (r.status !== 200) throw new Error("Calendar availability failed");
    result.push(...parseBusyWindows(provider, r.data));
    if (!r.data["@odata.nextLink"]) return result;
    const next = new URL(r.data["@odata.nextLink"]);
    if (next.origin !== "https://graph.microsoft.com" || next.pathname !== "/v1.0/me/calendarView")
      throw new Error("Invalid calendar pagination");
    path = next.pathname.slice("/v1.0".length) + next.search;
  }
  throw new Error("Calendar is too large to synchronize safely");
}
async function eventId(provider: CalendarProvider, token: string, key: string) {
  if (provider === "google") return key;
  const params = new URLSearchParams({
    $filter: `singleValueExtendedProperties/Any(ep: ep/id eq '${EXTENSION}' and ep/value eq '${key}')`,
    $select: "id",
    $top: "2",
  });
  const r = await providerRequest(provider, token, "/me/events?" + params);
  if (r.status !== 200 || !Array.isArray(r.data?.value) || r.data.value.length > 1)
    throw new Error("Calendar event reconciliation failed");
  return r.data.value[0]?.id as string | undefined;
}

export async function syncCalendar(env: AppEnv, provider: CalendarProvider, now = Date.now()) {
  const lease = crypto.randomUUID();
  const connection = await env.DB.prepare(
    `UPDATE calendar_connections SET lease_token=?::uuid,lease_until=?
 WHERE provider=? AND (lease_until IS NULL OR lease_until<?) AND EXISTS(SELECT 1 FROM staff_users s WHERE s.user_id=calendar_connections.connected_by AND s.active=true AND s.role='admin') RETURNING connected_by,refresh_token_encrypted`,
  )
    .bind(lease, now + 180000, provider, now)
    .first<{ connected_by: string; refresh_token_encrypted: string }>();
  if (!connection) return { status: "busy" as const };
  async function alive() {
    const row = await env.DB.prepare(
      "UPDATE calendar_connections SET lease_until=? WHERE provider=? AND lease_token=?::uuid AND lease_until>? RETURNING provider",
    )
      .bind(Date.now() + 180000, provider, lease, Date.now())
      .first();
    if (!row) throw new Error("Calendar synchronization lease expired");
  }
  try {
    const context = `${provider}:${connection.connected_by}`;
    const refresh = await decryptCalendarSecret(
      env.CALENDAR_ENCRYPTION_KEY,
      connection.refresh_token_encrypted,
      context,
    );
    const credentials = await calendarToken(env, provider, {
      grant_type: "refresh_token",
      refresh_token: refresh,
    });
    if (credentials.refresh_token)
      await env.DB.prepare(
        "UPDATE calendar_connections SET refresh_token_encrypted=? WHERE provider=? AND lease_token=?::uuid",
      )
        .bind(
          await encryptCalendarSecret(
            env.CALENDAR_ENCRYPTION_KEY,
            credentials.refresh_token,
            context,
          ),
          provider,
          lease,
        )
        .run();
    const token = credentials.access_token;
    const rows = await env.DB.prepare(
      `SELECT b.id,b.starts_at,b.ends_at,b.status,l.event_key,l.event_id,l.synced_signature,l.first_attempt_at
   FROM bookings b LEFT JOIN calendar_event_links l ON l.booking_id=b.id AND l.provider=?
   WHERE b.source='native' AND b.starts_at>? AND (b.status='confirmed' OR l.event_key IS NOT NULL)
   AND COALESCE(l.synced_signature,'')<>b.status||':'||b.starts_at||':'||b.ends_at ORDER BY b.starts_at,b.id LIMIT 11`,
    )
      .bind(provider, now - 86400000)
      .all<{
        id: string;
        starts_at: number;
        ends_at: number;
        status: string;
        event_key: string | null;
        event_id: string | null;
        synced_signature: string | null;
        first_attempt_at: number | null;
      }>();
    for (const b of (rows.results ?? []).slice(0, 10)) {
      await alive();
      const key = b.event_key ?? (await digest(`${env.SITE_URL}:${b.id}`)),
        signature = `${b.status}:${b.starts_at}:${b.ends_at}`;
      await env.DB.prepare(
        "INSERT INTO calendar_event_links(provider,booking_id,event_key) SELECT provider,?,? FROM calendar_connections WHERE provider=? AND lease_token=?::uuid ON CONFLICT DO NOTHING",
      )
        .bind(b.id, key, provider, lease)
        .run();
      let remote = b.event_id ?? (await eventId(provider, token, key));
      const resource = (id: string) =>
        provider === "google"
          ? `/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=none`
          : `/me/events/${encodeURIComponent(id)}`;
      if (b.status !== "confirmed") {
        if (remote) {
          const r = await providerRequest(provider, token, resource(remote), "DELETE");
          if (![204, 404, 410].includes(r.status)) throw new Error("Calendar cancellation failed");
        }
      } else {
        const body = calendarEventBody(provider, key, Number(b.starts_at), Number(b.ends_at));
        const patch = { ...body } as Record<string, unknown>;
        delete patch.id;
        delete patch.transactionId;
        let existing = remote
          ? await providerRequest(provider, token, resource(remote), "PATCH", patch)
          : null;
        if (!existing || existing.status === 404) {
          // First record the attempt. Outlook reconciles by the private property before retry;
          // ambiguous creates older than the dedupe window require manual reconciliation.
          if (
            provider === "outlook" &&
            b.first_attempt_at &&
            Number(b.first_attempt_at) < now - 23 * 3600000
          )
            throw new Error("Calendar event requires provider reconciliation");
          await env.DB.prepare(
            "UPDATE calendar_event_links SET first_attempt_at=COALESCE(first_attempt_at,?) WHERE provider=? AND event_key=?",
          )
            .bind(now, provider, key)
            .run();
          const created = await providerRequest(
            provider,
            token,
            provider === "google" ? "/calendars/primary/events?sendUpdates=none" : "/me/events",
            "POST",
            body,
          );
          if (provider === "google" && created.status === 409) {
            existing = await providerRequest(provider, token, resource(key), "PATCH", patch);
            if (existing.status !== 200) throw new Error("Calendar event update failed");
            remote = key;
          } else {
            if (![200, 201].includes(created.status) || typeof created.data?.id !== "string")
              throw new Error("Calendar event creation failed");
            remote = created.data.id;
          }
        } else if (existing.status !== 200) throw new Error("Calendar event update failed");
      }
      await env.DB.prepare(
        `UPDATE calendar_event_links SET event_id=?,synced_signature=?,last_error=NULL
    WHERE provider=? AND event_key=? AND EXISTS(SELECT 1 FROM calendar_connections WHERE provider=? AND lease_token=?::uuid)`,
      )
        .bind(remote ?? null, signature, provider, key, provider, lease)
        .run();
    }
    // Erasure deletes the native appointment but preserves the opaque external event key for cleanup.
    const orphans = await env.DB.prepare(
      "SELECT event_key,event_id FROM calendar_event_links WHERE provider=? AND booking_id IS NULL LIMIT 10",
    )
      .bind(provider)
      .all<{ event_key: string; event_id: string | null }>();
    for (const link of orphans.results ?? []) {
      await alive();
      const remote = link.event_id ?? (await eventId(provider, token, link.event_key));
      if (remote) {
        const path =
          provider === "google"
            ? `/calendars/primary/events/${encodeURIComponent(remote)}?sendUpdates=none`
            : `/me/events/${encodeURIComponent(remote)}`;
        const r = await providerRequest(provider, token, path, "DELETE");
        if (![204, 404, 410].includes(r.status)) throw new Error("Calendar cleanup failed");
      }
      await env.DB.prepare(
        "DELETE FROM calendar_event_links WHERE provider=? AND event_key=? AND booking_id IS NULL",
      )
        .bind(provider, link.event_key)
        .run();
    }
    await alive();
    const horizon = now + 180 * 86400000,
      windows = await busyWindows(provider, token, now, horizon);
    if (windows.length > 5000) throw new Error("Calendar availability exceeds capacity");
    if ((rows.results?.length ?? 0) > 10)
      throw new Error("More appointments are queued for synchronization");
    // Serialize imported availability with the atomic native reservation transaction.
    const statements = [
      env.DB.prepare("SELECT pg_advisory_xact_lock(492741129)"),
      env.DB.prepare(
        "DELETE FROM availability_blocks WHERE calendar_provider=? AND EXISTS(SELECT 1 FROM calendar_connections WHERE provider=? AND lease_token=?::uuid)",
      ).bind(provider, provider, lease),
    ];
    for (const w of windows)
      statements.push(
        env.DB.prepare(
          `INSERT INTO availability_blocks(starts_at,ends_at,reason,created_at,calendar_provider)
   SELECT ?,?,'Connected calendar',?,provider FROM calendar_connections WHERE provider=? AND lease_token=?::uuid`,
        ).bind(w.start, w.end, now, provider, lease),
      );
    statements.push(
      env.DB.prepare(
        "UPDATE calendar_connections SET last_sync_at=?,busy_until=?,last_error=NULL,lease_token=NULL,lease_until=NULL WHERE provider=? AND lease_token=?::uuid",
      ).bind(now, horizon, provider, lease),
    );
    await env.DB.batch(statements);
    return { status: "synced" as const, busyIntervals: windows.length };
  } catch (e) {
    // Only application-owned error codes; never persist provider bodies or tokens.
    const message =
      e instanceof Error &&
      /^(Calendar |More appointments|Unexpected calendar|Invalid calendar|A canonical HTTPS|Offline calendar)/.test(
        e.message,
      )
        ? e.message.slice(0, 200)
        : "Calendar synchronization failed; check configuration or reconnect";
    await env.DB.prepare(
      "UPDATE calendar_connections SET last_error=?,lease_token=NULL,lease_until=NULL WHERE provider=? AND lease_token=?::uuid",
    )
      .bind(message, provider, lease)
      .run();
    return { status: "failed" as const, error: message };
  }
}
