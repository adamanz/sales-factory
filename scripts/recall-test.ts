// Standalone Recall transcript test — decoupled from the agent/Slack pipeline.
// Proves we can (1) create a bot, (2) stream real-time transcript to our webhook,
// and (3) pull the post-call transcript from the Recall API.
//
// Usage:
//   npx tsx scripts/recall-test.ts "<MEETING_URL>"      # create a bot + poll + fetch transcript
//   npx tsx scripts/recall-test.ts transcript <BOT_ID>  # just fetch transcript for an existing bot
//   npx tsx scripts/recall-test.ts status <BOT_ID>      # just print bot status
import fs from "fs";
import path from "path";

// load .env.local
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const KEY = process.env.RECALL_API_KEY!;
const REGION = process.env.RECALL_REGION || "us-east-1";
const BASE = `https://${REGION}.recall.ai/api/v1`;
const H = { Authorization: `Token ${KEY}`, "Content-Type": "application/json" };

async function api(method: string, urlPath: string, body?: any) {
  const res = await fetch(`${BASE}${urlPath}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json: any; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, ok: res.ok, json };
}

async function createBot(meetingUrl: string) {
  const webhook = `${process.env.PUBLIC_BASE_URL}/api/recall/webhook`;
  console.log(`Creating bot for ${meetingUrl}\n  real-time transcript -> ${webhook}`);
  const r = await api("POST", "/bot/", {
    meeting_url: meetingUrl,
    bot_name: "Sales Factory Test",
    recording_config: {
      transcript: { provider: { meeting_captions: { language_code: "en" } } },
      realtime_endpoints: [{
        type: "webhook",
        url: webhook,
        events: ["transcript.data", "transcript.partial_data"],
      }],
    },
  });
  console.log("create ->", r.status, JSON.stringify(r.json).slice(0, 400));
  return r.json?.id as string | undefined;
}

async function getBot(botId: string) {
  return api("GET", `/bot/${botId}/`);
}

async function status(botId: string) {
  const r = await getBot(botId);
  const code = r.json?.status_changes?.at?.(-1)?.code || r.json?.status?.code || r.json?.recordings?.at?.(-1)?.status?.code;
  console.log(`status ${botId}: ${code}  (http ${r.status})`);
  return code as string | undefined;
}

function printSegments(data: any) {
  const segs = Array.isArray(data) ? data : data?.segments || data?.data?.segments || data?.transcript || [];
  if (!Array.isArray(segs) || segs.length === 0) {
    console.log("(no segments parsed — raw):", JSON.stringify(data).slice(0, 1500));
    return;
  }
  for (const seg of segs) {
    const who = seg.speaker || seg.participant?.name || `Speaker ${seg.speaker_id ?? ""}`;
    const words = Array.isArray(seg.words) ? seg.words.map((w: any) => w.text).join(" ") : seg.text || "";
    console.log(`  [${who}] ${words}`);
  }
  console.log(`(${segs.length} segments)`);
}

async function transcript(botId: string) {
  // Preferred: GET the bot, find the transcript download URL on its recording, fetch the S3 artifact.
  const r = await getBot(botId);
  const recs = r.json?.recordings || [];
  let url: string | undefined;
  for (const rec of recs) {
    url = rec?.media_shortcuts?.transcript?.data?.download_url || url;
  }
  if (url) {
    console.log(`transcript download_url found; fetching artifact…`);
    const t = await fetch(url); // signed S3 URL — no auth header
    const body = await t.json().catch(() => null);
    console.log(`artifact -> http ${t.status}`);
    printSegments(body);
    return;
  }
  // Fallback: older per-bot transcript endpoint.
  console.log("no download_url on recording; trying /bot/{id}/transcript/ …");
  const f = await api("GET", `/bot/${botId}/transcript/`);
  console.log(`/transcript/ -> http ${f.status}`);
  printSegments(f.json);
}

async function main() {
  const [arg1, arg2] = process.argv.slice(2);
  if (arg1 === "transcript") return transcript(arg2);
  if (arg1 === "status") { await status(arg2); return; }

  const meetingUrl = arg1;
  if (!meetingUrl) { console.error('Pass a meeting URL: npx tsx scripts/recall-test.ts "<MEETING_URL>"'); process.exit(1); }
  const botId = await createBot(meetingUrl);
  if (!botId) { console.error("no bot id returned"); process.exit(1); }
  console.log(`\nBOT_ID=${botId}\nPolling status (Ctrl+C to stop). Admit the bot, then speak in the meeting.`);
  console.log(`Real-time chunks (if tunnel is live) appear in /tmp/sf-dev.log as [recall] transcript.final ...`);
  let last = "";
  for (let i = 0; i < 120; i++) {
    const code = await status(botId);
    if (code && code !== last) last = code;
    if (code === "done" || code === "call_ended" || code === "fatal") break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log("\nFetching post-call transcript:");
  await transcript(botId);
}
main().catch((e) => { console.error(e); process.exit(1); });
