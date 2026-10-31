import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CALENDAR_FREEBUSY_URL,
  FREEBUSY_SCOPE,
  GOOGLE_TOKEN_URL,
  LOOPBACK_REDIRECT_URI,
  assertCalendarRequestAllowed,
  assertTokenRequestAllowed,
} from "../lib/slots/allowlist";
import * as finder from "../lib/slots/finder";
import { classifyConsentPage, consentBlockReason } from "../lib/slots/loopback-consent";
import { buildAuthorizationUrl, exchangeAuthorizationCode, parseOAuthCallback, refreshAccessToken } from "../lib/slots/oauth";
import { businessHoursEt, todayInTimeZone, zonedWallTimeToUtc } from "../lib/slots/window";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Oct 31 2026 09:00 ET is 13:00Z and Nov 2 2026 09:00 ET is 14:00Z", () => {
  assert.equal(zonedWallTimeToUtc(2026, 10, 31, 9, 0).toISOString(), "2026-10-31T13:00:00.000Z");
  assert.equal(zonedWallTimeToUtc(2026, 10, 31, 17, 0).toISOString(), "2026-10-31T21:00:00.000Z");
  assert.equal(zonedWallTimeToUtc(2026, 11, 2, 9, 0).toISOString(), "2026-11-02T14:00:00.000Z");
  assert.equal(zonedWallTimeToUtc(2026, 11, 2, 17, 0).toISOString(), "2026-11-02T22:00:00.000Z");

  const october = businessHoursEt("2026-10-31");
  assert.equal(october.start.toISOString(), "2026-10-31T13:00:00.000Z");
  assert.equal(october.end.toISOString(), "2026-10-31T21:00:00.000Z");

  const november = businessHoursEt("2026-11-02");
  assert.equal(november.start.toISOString(), "2026-11-02T14:00:00.000Z");
  assert.equal(november.end.toISOString(), "2026-11-02T22:00:00.000Z");

  assert.equal(todayInTimeZone("America/New_York", new Date("2026-11-01T03:30:00.000Z")), "2026-10-31");
});

test("subtracts busy time from the window", () => {
  const window = businessHoursEt("2026-10-31");
  const free = finder.subtractBusy(window, [
    { start: new Date("2026-10-31T12:00:00.000Z"), end: new Date("2026-10-31T14:00:00.000Z") },
    { start: new Date("2026-10-31T18:00:00.000Z"), end: new Date("2026-10-31T18:30:00.000Z") },
    { start: new Date("2026-10-31T18:30:00.000Z"), end: new Date("2026-10-31T19:00:00.000Z") },
    { start: new Date("2026-11-01T00:00:00.000Z"), end: new Date("2026-11-01T02:00:00.000Z") },
  ]);
  assert.deepEqual(free.map((slot) => [slot.start.toISOString(), slot.end.toISOString()]), [
    ["2026-10-31T14:00:00.000Z", "2026-10-31T18:00:00.000Z"],
    ["2026-10-31T19:00:00.000Z", "2026-10-31T21:00:00.000Z"],
  ]);
  assert.deepEqual(finder.subtractBusy(window, []), [window]);
  assert.deepEqual(
    finder.subtractBusy(window, [{ start: new Date("2026-10-31T13:00:00.000Z"), end: new Date("2026-10-31T21:00:00.000Z") }]),
    [],
  );
});

test("queryFreeBusy posts only the freeBusy endpoint and returns open slots", async () => {
  const window = businessHoursEt("2026-10-31");
  let calls = 0;
  const fetchImpl: finder.FetchLike = async (input, init) => {
    calls += 1;
    assert.equal(input, CALENDAR_FREEBUSY_URL);
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer test-access");
    const body = JSON.parse(String(init?.body)) as { timeMin: string; timeMax: string; items: Array<{ id: string }> };
    assert.equal(body.timeMin, "2026-10-31T13:00:00.000Z");
    assert.equal(body.timeMax, "2026-10-31T21:00:00.000Z");
    assert.deepEqual(body.items, [{ id: "primary" }]);
    return new Response(JSON.stringify({
      calendars: {
        primary: {
          busy: [{ start: "2026-10-31T15:00:00.000Z", end: "2026-10-31T16:00:00.000Z" }],
        },
      },
    }));
  };
  const client = finder.readOnlySlotFinder({ accessToken: "test-access", fetchImpl });
  assert.deepEqual(Object.keys(client), ["freeSlots"]);
  const free = await client.freeSlots(window);
  assert.equal(calls, 1);
  assert.deepEqual(free.map((slot) => slot.start.toISOString()), [
    "2026-10-31T13:00:00.000Z",
    "2026-10-31T16:00:00.000Z",
  ]);
});

test("freebusy errors redact the access token", async () => {
  const fetchImpl: finder.FetchLike = async () => new Response("bad test-access token", { status: 403 });
  await assert.rejects(
    () => finder.queryFreeBusy({ accessToken: "test-access", window: businessHoursEt("2026-10-31"), fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes("test-access"), false);
      assert.match(error.message, /403/);
      return true;
    },
  );
});

test("authorization url requests only the freebusy scope", () => {
  const url = new URL(buildAuthorizationUrl({ clientId: "client-id", state: "state-1" }));
  assert.equal(`${url.origin}${url.pathname}`, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("scope"), FREEBUSY_SCOPE);
  assert.equal(url.searchParams.get("scope")?.split(" ").length, 1);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("include_granted_scopes"), "false");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), LOOPBACK_REDIRECT_URI);
  assert.equal(url.searchParams.get("scope")?.includes("calendar.events"), false);
});

test("oauth callback and token exchange stay on the token endpoint", async () => {
  const redirect = new URL("http://127.0.0.1:8787/oauth/callback?code=code-test&state=state-1");
  assert.deepEqual(parseOAuthCallback(redirect, "state-1"), { code: "code-test" });
  assert.throws(() => parseOAuthCallback(redirect, "other"), /state mismatch/);
  assert.throws(
    () => parseOAuthCallback(new URL("http://127.0.0.1:8787/oauth/callback?error=access_denied&state=state-1"), "state-1"),
    /OAuth error: access_denied/,
  );

  let seen = "";
  const fetchImpl = async (input: string, init?: RequestInit) => {
    seen = input;
    assertTokenRequestAllowed(input);
    const body = String(init?.body);
    assert.match(body, /grant_type=authorization_code/);
    assert.equal(body.includes("calendar.events"), false);
    return new Response(JSON.stringify({ access_token: "access-test", refresh_token: "refresh-test" }));
  };
  const tokens = await exchangeAuthorizationCode({
    code: "code-test",
    clientId: "client-id",
    clientSecret: "client-secret",
    fetchImpl,
  });
  assert.equal(seen, GOOGLE_TOKEN_URL);
  assert.equal(tokens.refreshToken, "refresh-test");

  const refreshed = await refreshAccessToken({
    refreshToken: "refresh-test",
    clientId: "client-id",
    clientSecret: "client-secret",
    fetchImpl: async (input, init) => {
      assert.equal(input, GOOGLE_TOKEN_URL);
      assert.match(String(init?.body), /grant_type=refresh_token/);
      assert.equal(String(init?.body).includes("calendar.events"), false);
      return new Response(JSON.stringify({ access_token: "access-2" }));
    },
  });
  assert.equal(refreshed.accessToken, "access-2");
  assert.equal(refreshed.refreshToken, undefined);
});

test("consent page classifier stops on login, MFA, and redirect mismatch", () => {
  const redirect = LOOPBACK_REDIRECT_URI;
  assert.equal(
    classifyConsentPage(
      "https://accounts.google.com/o/oauth2/v2/auth?prompt=consent&scope=https://www.googleapis.com/auth/calendar.freebusy",
      redirect,
    ),
    "pending",
  );
  assert.equal(classifyConsentPage("https://accounts.google.com/v3/signin/identifier?foo=1", redirect), "login");
  assert.equal(classifyConsentPage("https://accounts.google.com/signin/challenge/pwd", redirect), "login");
  assert.equal(classifyConsentPage("https://accounts.google.com/signin/challenge/totp", redirect), "mfa");
  assert.equal(
    classifyConsentPage("https://accounts.google.com/signin/oauth/error?authError=redirect_uri_mismatch", redirect),
    "mismatch",
  );
  const encodedMismatch = Buffer.from("redirect_uri_mismatch").toString("base64url");
  const encodedPage = `https://accounts.google.com/signin/oauth/error?authError=${encodedMismatch}&client_id=test-client`;
  assert.equal(classifyConsentPage(encodedPage, redirect), "mismatch");
  assert.equal(consentBlockReason("mismatch", encodedPage), "redirect_uri_mismatch");
  assert.equal(
    consentBlockReason("mismatch", "https://accounts.google.com/signin/oauth/error?authError=access_denied"),
    "Google OAuth error",
  );
  assert.equal(classifyConsentPage("https://accounts.google.com/signin/oauth/consent", redirect), "consent");
  assert.equal(classifyConsentPage(`${redirect}?code=abc&state=xyz`, redirect), "done");
});

test("runtime guard refuses every calendar request except freeBusy", () => {
  assert.doesNotThrow(() => assertCalendarRequestAllowed("POST", CALENDAR_FREEBUSY_URL));
  assert.throws(() => assertCalendarRequestAllowed("GET", CALENDAR_FREEBUSY_URL), /Calendar request refused/);
  assert.throws(() => assertCalendarRequestAllowed("POST", `${CALENDAR_FREEBUSY_URL}?x=1`), /Calendar request refused/);
  assert.throws(
    () => assertCalendarRequestAllowed("POST", "https://www.googleapis.com/calendar/v3/calendars/primary/events"),
    /Calendar request refused/,
  );
  assert.throws(
    () => assertCalendarRequestAllowed("POST", "https://www.googleapis.com/calendar/v3/calendars/primary/events/quickAdd"),
    /Calendar request refused/,
  );
  assert.doesNotThrow(() => assertTokenRequestAllowed(GOOGLE_TOKEN_URL));
  assert.throws(() => assertTokenRequestAllowed("https://oauth2.googleapis.com/revoke"), /Token request refused/);
});

test("slot finder exports and source cannot create events", () => {
  const bannedName = /create|insert|patch|update|delete|write/i;
  for (const name of Object.keys(finder)) {
    assert.equal(bannedName.test(name), false, name);
  }
  const files = [...walk(path.join(root, "lib", "slots")), path.join(root, "scripts", "slot-finder-test.ts")];
  const banned = [
    "events.insert",
    "events.patch",
    "events.update",
    "events.delete",
    "calendar.events",
    "calendar.readonly",
    "/calendar/v3/events",
    "quickAdd",
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const word of banned) {
      assert.equal(text.includes(word), false, `${path.relative(root, file)} contains ${word}`);
    }
    const urls = text.match(/https:\/\/[^\s"'`)]+/g) ?? [];
    for (const raw of urls) {
      const url = raw.replace(/[.,;]+$/, "");
      if (url.includes("/calendar/v3/") && url !== CALENDAR_FREEBUSY_URL) {
        assert.fail(`${path.relative(root, file)} has a calendar URL other than freeBusy`);
      }
      if (url.includes("googleapis.com/auth/") && url !== FREEBUSY_SCOPE) {
        assert.fail(`${path.relative(root, file)} has a Google scope other than calendar.freebusy`);
      }
      if (url.startsWith("https://oauth2.googleapis.com/") && url !== GOOGLE_TOKEN_URL) {
        assert.fail(`${path.relative(root, file)} has an OAuth token URL other than /token`);
      }
    }
  }
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}
