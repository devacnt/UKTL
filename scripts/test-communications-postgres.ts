import postgres from "postgres";
import assert from "node:assert/strict";
import { postgresQuery } from "../src/lib/server/postgres.ts";
import { candidateInbox, markMessageRead } from "../src/lib/server/inbox.ts";
import {
  campaignRecipients,
  audienceFingerprint,
  scheduleCampaign,
  deliverNextCommunication,
  enqueueReminders,
} from "../src/lib/server/communications.ts";
import {
  startCalendarConnection,
  finishCalendarConnection,
} from "../src/lib/server/calendar-provider.ts";
import { syncCalendar } from "../src/lib/server/calendar-sync.ts";
const url =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Only isolated local database fixtures are permitted");
const sql = postgres(url, { max: 1, prepare: false }),
  originalFetch = globalThis.fetch;
class Rollback extends Error {}
try {
  await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path=recruitment,public`;
    const env = {
      DATA_BACKEND: "supabase",
      DB: {
        prepare(query: string) {
          let values: unknown[] = [];
          return {
            bind(...args: unknown[]) {
              values = args;
              return this;
            },
            async execute(connection?: typeof tx) {
              const q = postgresQuery(query, values);
              const run = (c: typeof tx) => c.unsafe(q.sql, q.values as any[]);
              return connection ? run(connection) : tx.savepoint(run);
            },
            async first() {
              return (await this.execute())[0] ?? null;
            },
            async all() {
              return { success: true, results: await this.execute() };
            },
            async run() {
              return { success: true, results: await this.execute() };
            },
          };
        },
        async batch(statements: any[]) {
          return tx.savepoint(async (sub) => {
            const results = [];
            for (const statement of statements)
              results.push({ success: true, results: await statement.execute(sub) });
            return results;
          });
        },
      },
    } as any;
    await tx`DELETE FROM recruitment.calendar_connections`;
    await tx`DELETE FROM candidates`;
    await tx`DELETE FROM bookings`;
    await tx`DELETE FROM email_campaigns`;
    const owner = crypto.randomUUID(),
      other = crypto.randomUUID(),
      staff = crypto.randomUUID();
    const now = Date.now(),
      enc = Buffer.alloc(32, 7).toString("base64");
    Object.assign(env, {
      RESEND_API_KEY: "test-key",
      SITE_URL: "https://uktl.example.invalid",
      CALENDAR_ENCRYPTION_KEY: enc,
      GOOGLE_CALENDAR_CLIENT_ID: "test-client",
      GOOGLE_CALENDAR_CLIENT_SECRET: "test-secret",
    });
    await tx`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES (${owner},'owner@example.invalid',now()),(${other},'other@example.invalid',now()),(${staff},'staff@example.invalid',now())`;
    await tx`INSERT INTO recruitment.staff_users(user_id,role,active,created_at) VALUES(${staff},'admin',true,${now})`;
    await tx`INSERT INTO candidates(id,created_at,updated_at,status,name,auth_user_id) VALUES('comm-old',${now - 100},${now},'parsed','Old CV',${owner}),('comm-new',${now},${now},'parsed','New CV',${owner}),('comm-other',${now},${now},'parsed','Other',${other})`;
    const message = crypto.randomUUID(),
      failed = crypto.randomUUID();
    await tx`INSERT INTO candidate_messages(id,candidate_id,template,to_email,subject,body,status,created_at,updated_at) VALUES
      (${message},'comm-old','custom','owner@example.invalid','Private message','A private recruitment message.','sent',${now},${now}),
      (${failed},'comm-new','custom','owner@example.invalid','Failed message','Must not be visible before sending.','failed',${now},${now})`;
    assert.equal((await candidateInbox(env, owner)).messages.length, 1);
    assert.equal((await candidateInbox(env, other)).messages.length, 0);
    await assert.rejects(markMessageRead(env, other, message));
    await markMessageRead(env, owner, message, now);
    assert.equal((await candidateInbox(env, owner)).messages[0].read_at, now);
    assert.equal((await campaignRecipients(env, "")).length, 0);
    await tx`INSERT INTO communication_preferences(user_id,campaigns_enabled,updated_at) VALUES(${owner},true,${now}),(${other},false,${now})`;
    const recipients = await campaignRecipients(env, "");
    assert.deepEqual(
      recipients.map((r) => r.id),
      ["comm-new"],
    );
    const campaign = crypto.randomUUID();
    await tx`INSERT INTO email_campaigns(id,subject,body,created_by,created_at) VALUES(${campaign},'Opt-in job update','A genuine recruitment campaign body.',${staff},${now})`;
    await assert.rejects(scheduleCampaign(env, campaign, "bad-fingerprint", now, now));
    await scheduleCampaign(env, campaign, await audienceFingerprint(recipients), now, now);
    await assert.rejects(
      scheduleCampaign(env, campaign, await audienceFingerprint(recipients), now, now),
    );
    assert.equal(
      Number((await tx`SELECT count(*) AS n FROM communication_jobs WHERE kind='campaign'`)[0].n),
      1,
    );
    let sends = 0;
    const keys: string[] = [];
    globalThis.fetch = async (input: any, init: any) => {
      assert.equal(String(input), "https://api.resend.com/emails");
      sends++;
      keys.push(init.headers["Idempotency-Key"]);
      return Response.json({ id: "synthetic" });
    };
    await tx`UPDATE communication_preferences SET campaigns_enabled=false WHERE user_id=${owner}`;
    assert.equal((await deliverNextCommunication(env, now)).status, "skipped");
    assert.equal(sends, 0);
    await tx`UPDATE communication_preferences SET campaigns_enabled=true WHERE user_id=${owner}`;
    const next = crypto.randomUUID();
    await tx`INSERT INTO email_campaigns(id,subject,body,created_by,created_at) VALUES(${next},'Second job update','A second opted-in recruitment campaign.',${staff},${now})`;
    await scheduleCampaign(env, next, await audienceFingerprint(recipients), now, now);
    assert.equal((await deliverNextCommunication(env, now)).status, "sent");
    assert.equal(sends, 1);
    assert.equal((await deliverNextCommunication(env, now)).status, "idle");
    assert.equal(sends, 1);
    assert.equal((await candidateInbox(env, owner)).messages.length, 2);
    const starts = now + 3600000;
    await tx`INSERT INTO bookings(id,created_at,auth_user_id,user_email,contact_name,contact_email,status,source,starts_at,ends_at) VALUES('comm-booking',${now - 86400000},${owner},'owner@example.invalid','Owner','owner@example.invalid','confirmed','native',${starts},${starts + 1800000})`;
    await enqueueReminders(env, now);
    await enqueueReminders(env, now);
    assert.equal(
      Number((await tx`SELECT count(*) AS n FROM communication_jobs WHERE kind='reminder'`)[0].n),
      1,
    );
    await tx`UPDATE bookings SET status='cancelled' WHERE id='comm-booking'`;
    assert.equal((await deliverNextCommunication(env, now)).status, "skipped");
    assert.equal(sends, 1);
    await tx`UPDATE bookings SET status='confirmed',starts_at=${starts + 3600000},ends_at=${starts + 5400000} WHERE id='comm-booking'`;
    await enqueueReminders(env, now + 3600000);
    let attempts = 0;
    globalThis.fetch = async (_input: any, init: any) => {
      attempts++;
      keys.push(init.headers["Idempotency-Key"]);
      return attempts === 1 ? new Response("", { status: 503 }) : Response.json({ id: "retry" });
    };
    assert.equal((await deliverNextCommunication(env, now + 3600000)).status, "failed");
    assert.equal((await deliverNextCommunication(env, now + 3900000)).status, "sent");
    assert.equal(keys.at(-1), keys.at(-2));
    // Backend-only tables cannot be directly read by a signed-in browser.
    for (const table of [
      "communication_preferences",
      "email_campaigns",
      "communication_jobs",
      "calendar_connections",
      "calendar_oauth_states",
      "calendar_event_links",
    ]) {
      assert.equal(
        (
          await tx`SELECT has_table_privilege('authenticated',${"recruitment." + table},'SELECT') AS allowed`
        )[0].allowed,
        false,
      );
    }
    const authUrl = new URL(await startCalendarConnection(env, "google", staff));
    assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256");
    assert.equal(authUrl.searchParams.get("access_type"), "offline");
    await assert.rejects(
      finishCalendarConnection(
        env,
        "google",
        other,
        authUrl.searchParams.get("state")!,
        "wrong-user",
      ),
    );
    let created = 0,
      deleted = 0,
      patched = 0;
    globalThis.fetch = async (input: any, init: any) => {
      const u = new URL(String(input));
      if (u.hostname === "oauth2.googleapis.com")
        return Response.json({ access_token: "test-access", refresh_token: "test-refresh" });
      if (u.pathname.endsWith("/freeBusy"))
        return Response.json({
          calendars: {
            primary: {
              busy: [
                {
                  start: new Date(now + 72000000).toISOString(),
                  end: new Date(now + 73800000).toISOString(),
                },
              ],
            },
          },
        });
      if (init.method === "PATCH") {
        patched++;
        return created
          ? Response.json({ id: "calendar-event" })
          : Response.json({}, { status: 404 });
      }
      if (init.method === "POST") {
        created++;
        return Response.json({ id: JSON.parse(init.body).id }, { status: 201 });
      }
      if (init.method === "DELETE") {
        deleted++;
        return new Response(null, { status: 204 });
      }
      throw new Error("Unexpected provider call");
    };
    await finishCalendarConnection(
      env,
      "google",
      staff,
      authUrl.searchParams.get("state")!,
      "synthetic-code",
    );
    await assert.rejects(
      finishCalendarConnection(env, "google", staff, authUrl.searchParams.get("state")!, "replay"),
    );
    const stored = (
      await tx`SELECT refresh_token_encrypted FROM calendar_connections WHERE provider='google'`
    )[0].refresh_token_encrypted;
    assert.ok(!stored.includes("test-refresh"));
    assert.equal((await syncCalendar(env, "google", now)).status, "synced");
    assert.equal(created, 1);
    assert.equal(
      Number(
        (
          await tx`SELECT count(*) AS n FROM availability_blocks WHERE calendar_provider='google'`
        )[0].n,
      ),
      1,
    );
    assert.equal((await syncCalendar(env, "google", now + 1000)).status, "synced");
    assert.equal(created, 1);
    await tx`UPDATE bookings SET status='cancelled' WHERE id='comm-booking'`;
    assert.equal((await syncCalendar(env, "google", now + 2000)).status, "synced");
    assert.equal(deleted, 1);
    await tx`DELETE FROM bookings WHERE id='comm-booking'`;
    assert.equal((await syncCalendar(env, "google", now + 3000)).status, "synced");
    assert.equal(Number((await tx`SELECT count(*) AS n FROM calendar_event_links`)[0].n), 0);
    await tx`UPDATE calendar_connections SET last_sync_at=0 WHERE provider='google'`;
    await assert.rejects(
      tx.savepoint(
        async (sub) =>
          sub`INSERT INTO bookings(id,created_at,auth_user_id,user_email,contact_name,contact_email,status,source,starts_at,ends_at) VALUES('comm-stale',${now},${owner},'owner@example.invalid','Owner','owner@example.invalid','confirmed','native',${now + 86400000},${now + 88200000})`,
      ),
    );
    // Outlook uses transaction IDs and private-property lookup before any create.
    await tx`DELETE FROM calendar_connections`;
    await tx`INSERT INTO bookings(id,created_at,auth_user_id,user_email,contact_name,contact_email,status,source,starts_at,ends_at) VALUES('comm-outlook',${now},${owner},'owner@example.invalid','Owner','owner@example.invalid','confirmed','native',${now + 10800000},${now + 12600000})`;
    Object.assign(env, {
      MICROSOFT_CALENDAR_CLIENT_ID: "test-ms-client",
      MICROSOFT_CALENDAR_CLIENT_SECRET: "test-ms-secret",
    });
    const msUrl = new URL(await startCalendarConnection(env, "outlook", staff));
    let msCreated = 0,
      msDeleted = 0;
    globalThis.fetch = async (input: any, init: any) => {
      const u = new URL(String(input));
      if (u.hostname === "login.microsoftonline.com")
        return Response.json({ access_token: "test-ms-access", refresh_token: "test-ms-refresh" });
      if (u.pathname === "/v1.0/me/calendarView")
        return Response.json({
          value: [
            {
              showAs: "busy",
              start: { dateTime: new Date(now + 72000000).toISOString(), timeZone: "UTC" },
              end: { dateTime: new Date(now + 73800000).toISOString(), timeZone: "UTC" },
            },
          ],
        });
      if (u.pathname === "/v1.0/me/events" && init.method === "GET")
        return Response.json({ value: msCreated ? [{ id: "ms-event" }] : [] });
      if (init.method === "POST") {
        msCreated++;
        assert.ok(JSON.parse(init.body).transactionId);
        return Response.json({ id: "ms-event" }, { status: 201 });
      }
      if (init.method === "DELETE") {
        msDeleted++;
        return new Response(null, { status: 204 });
      }
      throw new Error("Unexpected Outlook provider call");
    };
    await finishCalendarConnection(
      env,
      "outlook",
      staff,
      msUrl.searchParams.get("state")!,
      "synthetic-ms-code",
    );
    assert.equal((await syncCalendar(env, "outlook", now)).status, "synced");
    assert.equal(msCreated, 1);
    assert.equal((await syncCalendar(env, "outlook", now + 1000)).status, "synced");
    assert.equal(msCreated, 1);
    await tx`UPDATE bookings SET status='cancelled' WHERE id='comm-outlook'`;
    assert.equal((await syncCalendar(env, "outlook", now + 2000)).status, "synced");
    assert.equal(msDeleted, 1);
    console.log(
      "Communications PostgreSQL: ownership, consent, frozen audience, reminder dedupe/cancellation/retry, OAuth state, encrypted credentials, calendar sync/erasure and stale-calendar gate passed",
    );
    throw new Rollback();
  });
} catch (error) {
  if (!(error instanceof Rollback)) throw error;
} finally {
  globalThis.fetch = originalFetch;
  await sql.end();
}
