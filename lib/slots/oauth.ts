// Google OAuth for the free/busy scope only. Token exchange goes to the
// OAuth token endpoint and nowhere else.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { redactSecrets } from "../secrets";
import {
  assertTokenRequestAllowed,
  FREEBUSY_SCOPE,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  LOOPBACK_REDIRECT_URI,
} from "./allowlist";

export function createOAuthState(): string {
  return randomBytes(16).toString("hex");
}

export function buildAuthorizationUrl(opts: {
  clientId: string;
  state: string;
  redirectUri?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri ?? LOOPBACK_REDIRECT_URI,
    response_type: "code",
    scope: FREEBUSY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state: opts.state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function parseOAuthCallback(callbackUrl: URL, expectedState: string): { code: string } {
  if (callbackUrl.pathname !== "/oauth/callback") throw new Error("OAuth callback path rejected");
  const error = callbackUrl.searchParams.get("error");
  if (error) throw new Error(`OAuth error: ${error}`);
  const state = callbackUrl.searchParams.get("state");
  if (state !== expectedState) throw new Error("OAuth state mismatch");
  const code = callbackUrl.searchParams.get("code");
  if (!code) throw new Error("OAuth callback missing code");
  return { code };
}

export async function exchangeAuthorizationCode(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = await postToken(
    {
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri ?? LOOPBACK_REDIRECT_URI,
      grant_type: "authorization_code",
    },
    [opts.code, opts.clientSecret, opts.clientId],
    opts.fetchImpl,
  );
  if (typeof payload.refresh_token !== "string" || typeof payload.access_token !== "string") {
    throw new Error("Token exchange did not return a refresh token");
  }
  return { accessToken: payload.access_token, refreshToken: payload.refresh_token };
}

export async function refreshAccessToken(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}): Promise<{ accessToken: string; refreshToken?: string }> {
  const payload = await postToken(
    {
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      grant_type: "refresh_token",
    },
    [opts.refreshToken, opts.clientSecret, opts.clientId],
    opts.fetchImpl,
  );
  if (typeof payload.access_token !== "string") throw new Error("Token refresh did not return an access token");
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
  };
}

export async function listenForOAuthCode(opts: {
  expectedState: string;
  port?: number;
  timeoutMs?: number;
}): Promise<{ result: Promise<string>; close: () => Promise<void> }> {
  const port = opts.port ?? 8787;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  let resolveCode: (code: string) => void = () => {};
  let rejectCode: (error: Error) => void = () => {};
  let settled = false;
  const result = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  result.catch(() => {});

  const finish = (code: string) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolveCode(code);
  };
  const failure = (error: Error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    rejectCode(error);
  };
  const timer = setTimeout(() => failure(new Error("Timed out waiting for the OAuth callback")), timeoutMs);

  const server = createServer((req, res) => {
    handleCallback(req, res, port, opts.expectedState, finish, failure);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    result,
    close: () =>
      new Promise((resolve) => {
        clearTimeout(timer);
        if (!settled) failure(new Error("OAuth callback listener closed"));
        server.close(() => resolve());
      }),
  };
}

async function postToken(
  fields: Record<string, string>,
  secrets: readonly string[],
  fetchImpl: ((input: string, init?: RequestInit) => Promise<Response>) | undefined,
): Promise<Record<string, unknown>> {
  assertTokenRequestAllowed(GOOGLE_TOKEN_URL);
  const send = fetchImpl ?? ((input: string, init?: RequestInit) => fetch(input, init));
  const response = await send(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Token request failed (${response.status}): ${redactSecrets(text, secrets)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Token response was not JSON");
  }
  if (!isRecord(parsed)) throw new Error("Token response was not an object");
  return parsed;
}

function handleCallback(
  req: IncomingMessage,
  res: ServerResponse,
  port: number,
  expectedState: string,
  finish: (code: string) => void,
  failure: (error: Error) => void,
): void {
  let url: URL;
  try {
    url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  if (url.pathname !== "/oauth/callback") {
    res.writeHead(404).end("Not found");
    return;
  }
  try {
    const { code } = parseOAuthCallback(url, expectedState);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!doctype html><p>Slot Finder connected. You can close this tab.</p>");
    finish(code);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth callback rejected";
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!doctype html><p>Slot Finder could not complete sign-in.</p>");
    failure(new Error(message));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
