// Read-only free/busy for Adam's primary calendar, 9:00-17:00 ET.
// Never calls a calendar write endpoint.
import { formatSecretLocation, readGoogleOAuthClient, readSecret, redactSecrets, storePersonalApiCredential } from "../lib/secrets";
import { CALENDAR_FREEBUSY_URL, LOOPBACK_REDIRECT_URI, assertCalendarRequestAllowed } from "../lib/slots/allowlist";
import { readOnlySlotFinder, type FetchLike } from "../lib/slots/finder";
import { driveConsentBrowser } from "../lib/slots/loopback-consent";
import {
  buildAuthorizationUrl,
  createOAuthState,
  exchangeAuthorizationCode,
  listenForOAuthCode,
  refreshAccessToken,
} from "../lib/slots/oauth";
import { EASTERN, businessHoursEt, todayInTimeZone } from "../lib/slots/window";

const MISSING_CLIENT_URL = "https://console.cloud.google.com/apis/credentials";
const held: string[] = [];

async function main(): Promise<number> {
  const client = await readGoogleOAuthClient();
  if (!client) {
    return blocked("missing Google OAuth client", MISSING_CLIENT_URL);
  }
  held.push(client.clientId.value, client.clientSecret.value);
  console.log(`GOOGLE_CLIENT_ID from ${formatSecretLocation(client.clientId.location)}`);
  console.log(`GOOGLE_CLIENT_SECRET from ${formatSecretLocation(client.clientSecret.location)}`);

  let refresh = await readSecret("GOOGLE_REFRESH_TOKEN");
  if (!refresh) {
    const obtained = await obtainRefreshToken(client.clientId.value, client.clientSecret.value);
    if (!obtained.ok) return blocked(obtained.reason, obtained.url);
    held.push(obtained.refreshToken);
    const itemId = await storePersonalApiCredential("GOOGLE_REFRESH_TOKEN", obtained.refreshToken);
    console.log(`Stored GOOGLE_REFRESH_TOKEN in 1Password Personal, item ${itemId}`);
    refresh = {
      value: obtained.refreshToken,
      location: { kind: "op", vault: "Personal", title: "GOOGLE_REFRESH_TOKEN" },
    };
  }
  held.push(refresh.value);
  console.log(`GOOGLE_REFRESH_TOKEN from ${formatSecretLocation(refresh.location)}`);

  const access = await refreshAccessToken({
    refreshToken: refresh.value,
    clientId: client.clientId.value,
    clientSecret: client.clientSecret.value,
  });
  held.push(access.accessToken);
  if (access.refreshToken && access.refreshToken !== refresh.value) {
    held.push(access.refreshToken);
    const itemId = await storePersonalApiCredential("GOOGLE_REFRESH_TOKEN", access.refreshToken);
    console.log(`Rotated GOOGLE_REFRESH_TOKEN in 1Password Personal, item ${itemId}`);
  }

  const date = todayInTimeZone(EASTERN);
  const window = businessHoursEt(date);
  console.log(`window: ${date} 09:00-17:00 ET`);
  console.log(`utc: ${window.start.toISOString()} to ${window.end.toISOString()}`);
  const guardedFetch: FetchLike = async (input, init) => {
    assertCalendarRequestAllowed(init?.method ?? "GET", input);
    return fetch(input, init);
  };
  const finder = readOnlySlotFinder({ accessToken: access.accessToken, fetchImpl: guardedFetch });
  const free = await finder.freeSlots(window);
  console.log(`request: POST ${CALENDAR_FREEBUSY_URL}`);
  console.log(`free slots: ${free.length}`);
  for (const slot of free) {
    console.log(`${slot.start.toISOString()} to ${slot.end.toISOString()}`);
  }
  console.log("Free/busy read completed. No events were created.");
  return 0;
}

async function obtainRefreshToken(
  clientId: string,
  clientSecret: string,
): Promise<{ ok: true; refreshToken: string } | { ok: false; reason: string; url: string }> {
  const state = createOAuthState();
  const authUrl = buildAuthorizationUrl({ clientId, state });
  let listener: Awaited<ReturnType<typeof listenForOAuthCode>> | null = null;
  try {
    listener = await listenForOAuthCode({ expectedState: state, timeoutMs: 40_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth callback listener failed";
    if (message.includes("EADDRINUSE")) {
      return { ok: false, reason: "OAuth callback port 8787 is already in use", url: authUrl };
    }
    return { ok: false, reason: "OAuth callback listener failed", url: authUrl };
  }
  try {
    const driven = await driveConsentBrowser({ authUrl, redirectUri: LOOPBACK_REDIRECT_URI, timeoutMs: 30_000 });
    if (!driven.ok) return driven;
    const code = await listener.result;
    held.push(code);
    const tokens = await exchangeAuthorizationCode({ code, clientId, clientSecret });
    return { ok: true, refreshToken: tokens.refreshToken };
  } finally {
    await listener.close();
  }
}

function blocked(reason: string, url: string): number {
  console.error("SLOT FINDER BLOCKED");
  console.error(`reason: ${reason}`);
  console.error(`url: ${url}`);
  return 2;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Slot finder failed";
    console.error(redactSecrets(message, held));
    process.exitCode = 1;
  });
