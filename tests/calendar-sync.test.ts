import test from "node:test";
import assert from "node:assert/strict";
import {
  encryptCalendarSecret,
  decryptCalendarSecret,
  calendarConfig,
  digest,
} from "../src/lib/server/calendar-provider.ts";
import { parseBusyWindows, calendarEventBody } from "../src/lib/server/calendar-sync.ts";
import { audienceFingerprint } from "../src/lib/server/communications.ts";
const key = Buffer.alloc(32, 7).toString("base64");
test("calendar tokens use authenticated encryption bound to their provider and owner", async () => {
  const encrypted = await encryptCalendarSecret(key, "private-refresh-token", "google:user-a");
  assert.ok(!encrypted.includes("private-refresh-token"));
  assert.equal(
    await decryptCalendarSecret(key, encrypted, "google:user-a"),
    "private-refresh-token",
  );
  await assert.rejects(decryptCalendarSecret(key, encrypted, "outlook:user-a"));
  await assert.rejects(
    decryptCalendarSecret(Buffer.alloc(32, 8).toString("base64"), encrypted, "google:user-a"),
  );
  await assert.rejects(encryptCalendarSecret("short", "token", "google"));
  assert.notEqual(
    await encryptCalendarSecret(key, "token", "google"),
    await encryptCalendarSecret(key, "token", "google"),
  );
});
test("calendar authorization requires canonical HTTPS origin and provider credentials", () => {
  const env = {
    SITE_URL: "https://uktl.example",
    GOOGLE_CALENDAR_CLIENT_ID: "client",
    GOOGLE_CALENDAR_CLIENT_SECRET: "secret",
    CALENDAR_ENCRYPTION_KEY: key,
  } as any;
  assert.equal(
    calendarConfig(env, "google").redirect,
    "https://uktl.example/api/calendar/callback/google",
  );
  assert.throws(() =>
    calendarConfig({ ...env, SITE_URL: "https://uktl.example/nested" }, "google"),
  );
  assert.throws(() => calendarConfig({ ...env, SITE_URL: "http://uktl.example" }, "google"));
  assert.throws(() => calendarConfig(env, "outlook"));
});
test("calendar imports reject missing or invalid availability rather than treating it as free", () => {
  const start = "2026-10-25T09:00:00Z",
    end = "2026-10-25T10:00:00Z";
  assert.deepEqual(
    parseBusyWindows("google", { calendars: { primary: { busy: [{ start, end }] } } }),
    [{ start: Date.parse(start), end: Date.parse(end) }],
  );
  assert.throws(() =>
    parseBusyWindows("google", {
      calendars: { primary: { errors: [{ reason: "notFound" }], busy: [] } },
    }),
  );
  assert.throws(() =>
    parseBusyWindows("google", { calendars: { primary: { busy: [{ start: end, end: start }] } } }),
  );
  assert.deepEqual(
    parseBusyWindows("outlook", {
      value: [
        {
          showAs: "busy",
          start: { dateTime: "2026-10-25T09:00:00", timeZone: "UTC" },
          end: { dateTime: "2026-10-25T10:00:00", timeZone: "UTC" },
        },
        { showAs: "free" },
      ],
    }),
    [{ start: Date.parse(start), end: Date.parse(end) }],
  );
  assert.throws(() =>
    parseBusyWindows("outlook", { value: [{ start: { timeZone: "Pacific Standard Time" } }] }),
  );
});
test("external events contain no candidate contact or HR information and retain a stable identity", async () => {
  const key = await digest("https://uktl.example:booking-id");
  for (const provider of ["google", "outlook"] as const) {
    const body = calendarEventBody(
      provider,
      key,
      Date.UTC(2026, 9, 25, 9),
      Date.UTC(2026, 9, 25, 10),
    );
    assert.ok(!("attendees" in body));
    assert.ok(!("description" in body));
    assert.ok(JSON.stringify(body).includes(key));
  }
});
test("campaign preview fingerprint changes when the recipient or delivery address changes", async () => {
  const rows = [{ id: "a", auth_user_id: "u", email: "one@example.invalid" }];
  assert.notEqual(
    await audienceFingerprint(rows),
    await audienceFingerprint([{ ...rows[0], email: "two@example.invalid" }]),
  );
  assert.notEqual(
    await audienceFingerprint(rows),
    await audienceFingerprint([{ ...rows[0], id: "b" }]),
  );
});
