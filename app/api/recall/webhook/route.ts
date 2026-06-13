import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { store } from "@/lib/store";
import { createCallSession, sendUserMessage, defineOutcome } from "@/lib/anthropic";
import { runConsumer, openCallThread } from "@/lib/consumer";
import { pushChunk, doFlush } from "@/lib/transcript";
import fs from "fs";
import path from "path";

const SECRET = process.env.RECALL_WEBHOOK_SECRET;
function verify(body: string, sig: string | null) {
  if (!SECRET || !sig) return process.env.NODE_ENV !== "production";
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(`sha256=${expected}`)); } catch { return false; }
}
const rubric = () => fs.readFileSync(path.join(process.cwd(), "agents", "pitch-rubric.md"), "utf8");

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get("x-recall-signature"))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  const event = JSON.parse(raw);
  // Real-time transcript events nest the bot under data.bot.id; status events use data.bot_id.
  const botId = event?.data?.bot?.id || event?.data?.bot_id;

  // Pull speaker + spoken text from a transcript.* event payload (data.data.{participant,words}).
  const parseTranscript = () => {
    const d = event?.data?.data;
    return { speaker: d?.participant?.name || "Speaker", text: d?.words?.map((w: any) => w.text).join(" ") || "" };
  };

  // Debug: log every Recall event so we can verify real-time transcript delivery.
  if (event.event === "transcript.data" || event.event === "transcript.partial_data") {
    const { speaker, text } = parseTranscript();
    const tag = event.event === "transcript.partial_data" ? "partial" : "final";
    console.log(`[recall] transcript.${tag} bot=${botId} [${speaker}] ${text}`);
  } else {
    console.log(`[recall] ${event.event} bot=${botId} ${event?.data?.status?.code || ""}`);
  }

  switch (event.event) {
    case "bot.status_change": {
      const code = event?.data?.status?.code;
      if ((code === "in_call_recording" || code === "in_call") && botId && !store.get(botId)) {
        // TODO: create Slack thread (via Slack MCP-driven priming or relay fallback) + memory store
        const session = await createCallSession({ memoryStoreId: undefined });
        store.set({ botId, sessionId: session.id, channelId: process.env.SLACK_CHANNEL_ID, opportunityId: process.env.SF_OPPORTUNITY_ID!, quoteIds: [] });
        await openCallThread(botId, ":factory: *Sales Factory* — live sales call"); // one thread per call
        runConsumer(session.id); // open the stream before sending events (handles salesforce_op/slack_post/publish_artifact)
        await sendUserMessage(session.id, "A sales call just started. Coach live; track every pricing option discussed.");
      }
      break;
    }
    // Finalized utterances only (partials are for live captions, not the agent feed).
    case "transcript.data": {
      const s = botId && store.get(botId);
      if (s?.sessionId) {
        const { speaker, text } = parseTranscript();
        if (text) pushChunk(botId, { speaker, text, ts: Date.now() }, (t) => sendUserMessage(s.sessionId!, t));
      }
      break;
    }
    case "bot.done": {
      const s = botId && store.get(botId);
      if (s?.sessionId) {
        doFlush(botId, (text) => sendUserMessage(s.sessionId!, text));
        await defineOutcome(s.sessionId, "Produce the post-call deliverables for this sales call.", rubric());
      }
      break;
    }
  }
  return NextResponse.json({ received: true });
}
export async function GET() { return NextResponse.json({ status: "recall webhook active" }); }
