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
    transcription_options: { provider: "meeting_captions" },
    real_time_transcription: { destination_url: webhook, partial_results: true },
  });
  console.log("create ->", r.status, JSON.stringify(r.json).slice(0, 300));
  return r.json?.id as string | undefined;
}

async function status(botId: string) {
  const r = await api("GET", `/bot/${botId}/`);
  const code = r.json?.status_changes?.at?.(-1)?.code || r.json?.status?.code;
  console.log(`status ${botId}: ${code}  (http ${r.status})`);
  return code as string | undefined;
}

async function transcript(botId: string) {
  // Try the documented transcript endpoint; print raw so we see the real shape.
  const r = await api("GET", `/bot/${botId}/transcript/`);
  console.log(`transcript ${botId} -> http ${r.status}`);
  if (Array.isArray(r.json)) {
    for (const seg of r.json) {
      const who = seg.speaker || seg.participant?.name || "Speaker";
      const words = seg.words?.map((w: any) => w.text).join(" ") || seg.text || "";
      console.log(`  [${who}] ${words}`);
    }
    console.log(`(${r.json.length} segments)`);
  } else {
    console.log(JSON.stringify(r.json, null, 2).slice(0, 2000));
  }
}

async function main() {
  const [arg1, arg2] = process.argv.slice(2);
  if (arg1 === "transcript") return transcript(arg2);
  if (arg1 === "status") { await status(arg2); return; }

  const meetingUrl = arg1;
  if (!meetingUrl) { console.error('Pass a meeting URL: npx tsx scripts/recall-test.ts "<MEETING_URL>"'); process.exit(1); }
  const botId = await createBot(meetingUrl);
  if (!botId) { console.error("no bot id returned"); process.exit(1); }
  console.log(`\nBOT_ID=${botId}\nPolling status (Ctrl+C to stop). Speak in the meeting to generate transcript.`);
  console.log(`Watch real-time chunks in the dev server log (/tmp/sf-dev.log).`);
  for (let i = 0; i < 120; i++) {
    const code = await status(botId);
    if (code === "done" || code === "call_ended" || code === "fatal") break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log("\nFetching post-call transcript:");
  await transcript(botId);
}
main().catch((e) => { console.error(e); process.exit(1); });
