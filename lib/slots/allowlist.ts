// The slot finder may call one Calendar endpoint and one token endpoint.
export const FREEBUSY_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";
export const CALENDAR_FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const LOOPBACK_REDIRECT_URI = "http://127.0.0.1:8787/oauth/callback";

export function assertCalendarRequestAllowed(method: string, url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Calendar request refused");
  }
  const allowed = new URL(CALENDAR_FREEBUSY_URL);
  if (method.toUpperCase() !== "POST" || parsed.origin !== allowed.origin || parsed.pathname !== allowed.pathname || parsed.search !== "") {
    throw new Error(`Calendar request refused: ${method.toUpperCase()} ${parsed.origin}${parsed.pathname}`);
  }
}

export function assertTokenRequestAllowed(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Token request refused");
  }
  const allowed = new URL(GOOGLE_TOKEN_URL);
  if (parsed.origin !== allowed.origin || parsed.pathname !== allowed.pathname || parsed.search !== "") {
    throw new Error(`Token request refused: ${parsed.origin}${parsed.pathname}`);
  }
}
