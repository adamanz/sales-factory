// Drives a throwaway headless Chrome through the free/busy consent screen.
// Never attaches to ports 9222 or 9333.
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FORBIDDEN_DEBUG_PORTS = new Set([9222, 9333]);
const DEBUG_PORT_CANDIDATES = [9477, 9488, 9499];

export type ConsentPageKind = "done" | "login" | "mfa" | "mismatch" | "consent" | "pending";

export type ConsentDriveResult =
  | { ok: true }
  | { ok: false; reason: string; url: string };

export function classifyConsentPage(pageUrl: string, redirectUri: string): ConsentPageKind {
  if (pageUrl.startsWith(redirectUri)) return "done";
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return "pending";
  }
  const path = `${url.hostname}${url.pathname}`.toLowerCase();
  const error = `${url.searchParams.get("error") ?? ""} ${url.searchParams.get("authError") ?? ""}`.toLowerCase();
  if (error.includes("redirect_uri_mismatch") || path.includes("signin/oauth/error") || path.includes("autherror")) {
    return "mismatch";
  }
  if (error.trim()) return "mismatch";
  if (path.includes("pwd") || path.includes("password")) return "login";
  if (path.includes("challenge") || path.includes("totp") || path.includes("2step")) return "mfa";
  if (path.includes("/consent")) return "consent";
  if (
    path.includes("servicelogin") ||
    path.includes("identifier") ||
    path.includes("accountchooser") ||
    path.includes("oauthchooseaccount") ||
    path.includes("/v3/signin")
  ) {
    return "login";
  }
  return "pending";
}

export function consentBlockReason(kind: "login" | "mfa" | "mismatch", pageUrl: string): string {
  switch (kind) {
    case "login":
      return "Google sign-in required";
    case "mfa":
      return "Google MFA required";
    case "mismatch":
      return oauthErrorText(pageUrl).includes("redirect_uri_mismatch") ? "redirect_uri_mismatch" : "Google OAuth error";
    default: {
      const neverKind: never = kind;
      return `OAuth blocked: ${String(neverKind)}`;
    }
  }
}

function oauthErrorText(pageUrl: string): string {
  const parts = [pageUrl];
  try {
    const authError = new URL(pageUrl).searchParams.get("authError");
    if (authError) {
      const padded = authError.replace(/-/g, "+").replace(/_/g, "/");
      parts.push(Buffer.from(padded, "base64").toString("utf8"));
    }
  } catch {
    // A non-URL or non-base64 payload still matches on the raw page URL.
  }
  return parts.join(" ").toLowerCase();
}

export async function driveConsentBrowser(opts: {
  authUrl: string;
  redirectUri: string;
  timeoutMs?: number;
}): Promise<ConsentDriveResult> {
  let lastUrl = opts.authUrl;
  try {
    await access(CHROME_PATH);
  } catch {
    return { ok: false, reason: "Google Chrome is not installed", url: opts.authUrl };
  }
  const port = await pickDebugPort();
  if (port === null) {
    return { ok: false, reason: "No free Chrome debugging port", url: opts.authUrl };
  }
  const dir = await mkdtemp(join(tmpdir(), "slot-chrome-"));
  const child = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${dir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--password-store=basic",
      "--use-mock-keychain",
      "--headless=new",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore", detached: true },
  );
  let cdp: Cdp | null = null;
  try {
    await waitForDebugPort(port, 10_000);
    const versionUrl = `http://127.0.0.1:${port}/json/version`;
    const versionResponse = await fetch(versionUrl);
    const version = (await versionResponse.json()) as unknown;
    if (!isRecord(version) || typeof version.webSocketDebuggerUrl !== "string") {
      return { ok: false, reason: "Google consent could not be completed", url: lastUrl };
    }
    cdp = await Cdp.connect(version.webSocketDebuggerUrl);
    const created = await cdp.call("Target.createTarget", { url: opts.authUrl, background: true });
    const targetId = stringField(created, "targetId");
    const attached = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
    const sessionId = stringField(attached, "sessionId");
    await cdp.call("Runtime.enable", {}, sessionId);
    const timeoutMs = opts.timeoutMs ?? 25_000;
    const started = Date.now();
    let clicks = 0;
    while (Date.now() - started < timeoutMs) {
      const href = await readHref(cdp, sessionId);
      if (href) lastUrl = href;
      const kind = classifyConsentPage(lastUrl, opts.redirectUri);
      if (kind === "done") return { ok: true };
      if (kind === "login" || kind === "mfa" || kind === "mismatch") {
        return { ok: false, reason: consentBlockReason(kind, lastUrl), url: lastUrl };
      }
      if (kind === "consent" && clicks < 3) {
        const clicked = await clickAllow(cdp, sessionId);
        if (clicked) clicks += 1;
      }
      await delay(400);
    }
    return { ok: false, reason: "OAuth consent timed out", url: lastUrl };
  } catch {
    return { ok: false, reason: "Google consent could not be completed", url: lastUrl };
  } finally {
    if (cdp) {
      try {
        await cdp.call("Browser.close", {});
      } catch {
        // The browser may already be gone.
      }
      cdp.close();
    }
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // The process already exited.
      }
    }
    await rm(dir, { recursive: true, force: true });
  }
}

async function pickDebugPort(): Promise<number | null> {
  for (const port of DEBUG_PORT_CANDIDATES) {
    if (FORBIDDEN_DEBUG_PORTS.has(port)) continue;
    if (await canListen(port)) return port;
  }
  return null;
}

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function waitForDebugPort(port: number, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await delay(100);
  }
  throw new Error("Chrome debugging port did not open");
}

async function readHref(cdp: Cdp, sessionId: string): Promise<string | null> {
  const value = await evaluate(cdp, sessionId, "location.href");
  return typeof value === "string" ? value : null;
}

async function clickAllow(cdp: Cdp, sessionId: string): Promise<boolean> {
  const value = await evaluate(
    cdp,
    sessionId,
    `(() => {
      if (document.querySelector("input[type='password'], input[type='email']")) return false;
      const wanted = new Set(["Allow", "Continue"]);
      const nodes = Array.from(document.querySelectorAll("button, [role='button'], input[type='submit']"));
      for (const node of nodes) {
        const label = (node.innerText || node.value || "").trim();
        if (wanted.has(label)) {
          node.click();
          return true;
        }
      }
      return false;
    })()`,
  );
  return value === true;
}

async function evaluate(cdp: Cdp, sessionId: string, expression: string): Promise<unknown> {
  const raw = await cdp.call(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (!isRecord(raw) || !isRecord(raw.result)) return undefined;
  return raw.result.value;
}

class Cdp {
  private next = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      const text = cdpText(event.data);
      if (!text) return;
      let message: unknown;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }
      if (!isRecord(message) || typeof message.id !== "number") return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (isRecord(message.error) && typeof message.error.message === "string") waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", () => reject(new Error("CDP connection failed")));
    });
    return new Cdp(ws);
  }

  call(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<unknown> {
    const id = this.next++;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 5_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.ws.send(JSON.stringify(payload));
    });
  }

  close(): void {
    this.ws.close();
  }
}

function stringField(value: unknown, key: string): string {
  if (!isRecord(value) || typeof value[key] !== "string") throw new Error("Chrome debugging response was incomplete");
  return value[key];
}

function cdpText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
