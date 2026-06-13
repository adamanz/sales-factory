// Slack posting via bot token (xoxb-). The relay executes the agent's `slack_post`
// custom tool. Needs SLACK_BOT_TOKEN with chat:write, bot invited to the channel.
import crypto from "crypto";

// Verify a Slack request signature (v0 HMAC). Shared by the Events + Interactivity webhooks.
// Returns true in dev when SLACK_SIGNING_SECRET is unset; otherwise requires a valid, fresh sig.
export function verifySlackSignature(raw: string, ts: string | null, sig: string | null): boolean {
  const signing = process.env.SLACK_SIGNING_SECRET;
  if (!signing) return true; // dev: allow when no signing secret is configured
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // stale / replay
  const mac = "v0=" + crypto.createHmac("sha256", signing).update(`v0:${ts}:${raw}`).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(sig)); } catch { return false; }
}

export async function postMessage(opts: { channel: string; text?: string; blocks?: any; thread_ts?: string }) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "SLACK_BOT_TOKEN not set", ts: null };
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: opts.channel, text: opts.text || " ", blocks: opts.blocks, thread_ts: opts.thread_ts }),
  });
  const j = await res.json();
  return j.ok ? { ok: true, ts: j.ts as string, channel: j.channel as string } : { ok: false, error: j.error, ts: null };
}
