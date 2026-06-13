import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { store } from "@/lib/store";
import { createCallSession, sendUserMessage, defineOutcome } from "@/lib/anthropic";
import { runConsumer } from "@/lib/consumer";
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
  const botId = event?.data?.bot_id;

  switch (event.event) {
    case "bot.status_change": {
      const code = event?.data?.status?.code;
      if ((code === "in_call_recording" || code === "in_call") && botId && !store.get(botId)) {
        // TODO: create Slack thread (via Slack MCP-driven priming or relay fallback) + memory store
        const session = await createCallSession({ memoryStoreId: undefined });
        store.set({ botId, sessionId: session.id, channelId: process.env.SLACK_CHANNEL_ID, opportunityId: process.env.SF_OPPORTUNITY_ID!, quoteIds: [] });
        runConsumer(session.id); // open the stream before sending events (handles salesforce_op/slack_post/publish_artifact)
        await sendUserMessage(session.id, "A sales call just started. Coach live; track every pricing option discussed.");
      }
      break;
    }
    case "bot.transcription": {
      const s = botId && store.get(botId);
      if (s?.sessionId) {
        const t = event.data.transcript;
        pushChunk(botId, { speaker: t?.speaker || "Speaker", text: t?.words?.map((w: any) => w.text).join(" ") || t?.text || "", ts: Date.now() },
          (text) => sendUserMessage(s.sessionId!, text));
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
