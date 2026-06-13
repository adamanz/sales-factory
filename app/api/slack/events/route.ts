import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { createCallSession, sendUserMessage, defineOutcome } from "@/lib/anthropic";
import { runConsumer } from "@/lib/consumer";
import { getBot, botStatus } from "@/lib/recall";
import { postMessage, verifySlackSignature } from "@/lib/slack";
import fs from "fs";
import path from "path";

// Slack Events API: drop a Google Meet / Zoom / Teams link in the channel → the bot joins, coaches
// live in that thread, and posts the quotes + offer when the call ends.
// Slack setup: Event Subscriptions → Request URL https://<PUBLIC_BASE_URL>/api/slack/events,
// subscribe the bot to `message.channels` (and `message.groups` for private), then /invite the bot.
const RECALL_KEY = process.env.RECALL_API_KEY;
const RECALL_REGION = process.env.RECALL_REGION || "us-east-1";
const MEET_RE = /https?:\/\/(?:meet\.google\.com\/[a-z-]+|[a-z0-9.]*zoom\.us\/j\/\S+|teams\.microsoft\.com\/\S+)/i;
const seen = new Set<string>(); // dedupe Slack event_ids

async function createBot(meetingUrl: string): Promise<string | undefined> {
  const res = await fetch(`https://${RECALL_REGION}.recall.ai/api/v1/bot/`, {
    method: "POST",
    headers: { Authorization: `Token ${RECALL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: "Sales Factory",
      recording_config: {
        transcript: { provider: { meeting_captions: { language_code: "en" } } },
        realtime_endpoints: [{ type: "webhook", url: `${process.env.PUBLIC_BASE_URL}/api/recall/webhook`, events: ["transcript.data", "transcript.partial_data"] }],
      },
    }),
  });
  return (await res.json())?.id;
}

async function handleMeet(meetingUrl: string, channel: string, threadTs: string) {
  const botId = await createBot(meetingUrl);
  if (!botId) { await postMessage({ channel, thread_ts: threadTs, text: "⚠️ Couldn't start the Recall bot for that link." }); return; }
  const session = await createCallSession({});
  // Thread all coaching/deliverables under the user's Meet-link message.
  store.set({ botId, sessionId: session.id, channelId: channel, slackThreadTs: threadTs, opportunityId: process.env.SF_OPPORTUNITY_ID!, quoteIds: [] });
  await postMessage({ channel, thread_ts: threadTs, text: `:factory: On it — joining the call. I'll coach live here and post the quotes + offer when it wraps. _(Recall bot ${botId})_` });
  runConsumer(session.id);
  await sendUserMessage(session.id, "A sales call just started (joined from Slack). Coach live; track every pricing option discussed.");

  // When the call ends, fire the post-call outcome (the live transcript fed the session via /api/recall/webhook).
  (async () => {
    for (let i = 0; i < 180; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      try {
        const s = botStatus(await getBot(botId));
        if (["done", "call_ended", "fatal"].includes(s)) {
          const rubric = fs.readFileSync(path.join(process.cwd(), "agents", "pitch-rubric.md"), "utf8");
          await defineOutcome(session.id, "Produce the post-call deliverables for this sales call.", rubric);
          return;
        }
      } catch { /* keep polling */ }
    }
  })();
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const body = JSON.parse(raw || "{}");
  if (body.type === "url_verification") return NextResponse.json({ challenge: body.challenge }); // Slack setup handshake
  if (!verifySlackSignature(raw, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"))) {
    return new NextResponse("bad signature", { status: 401 });
  }
  if (req.headers.get("x-slack-retry-num")) return NextResponse.json({ ok: true }); // ignore Slack retries
  const ev = body.event;
  if (ev?.type === "message" && !ev.bot_id && !ev.subtype && !seen.has(body.event_id)) {
    const m = String(ev.text || "").match(MEET_RE);
    if (m) {
      seen.add(body.event_id);
      handleMeet(m[0], ev.channel, ev.thread_ts || ev.ts).catch((e) => console.error("[slack/events] error:", e));
    }
  }
  return NextResponse.json({ ok: true }); // ack within 3s; work runs in background
}
