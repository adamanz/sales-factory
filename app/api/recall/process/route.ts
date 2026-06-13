import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { createCallSession, sendUserMessage, defineOutcome } from "@/lib/anthropic";
import { runConsumer, openCallThread } from "@/lib/consumer";
import { getTranscript, getBot, botStatus } from "@/lib/recall";
import fs from "fs";
import path from "path";

// Post-call ingestion — turn a FINISHED real Recall meeting into the full Sales Factory flow
// (coaching thread -> quotes -> offer). NO public tunnel needed: it pulls the completed transcript
// from the Recall API. POST { botId, account?, speedMs? }.
export async function POST(req: NextRequest) {
  const { botId, account = "the prospect", speedMs = 60 } = await req.json().catch(() => ({}));
  if (!botId) return NextResponse.json({ error: "botId required" }, { status: 400 });

  let turns;
  try { turns = await getTranscript(botId); }
  catch (e: any) { return NextResponse.json({ error: String(e?.message || e) }, { status: 502 }); }
  if (!turns.length) {
    const bot = await getBot(botId).catch(() => null);
    return NextResponse.json({ error: "transcript not ready", status: bot ? botStatus(bot) : "unknown" }, { status: 409 });
  }

  const session = await createCallSession({});
  const key = `process-${botId}`;
  store.set({ botId: key, sessionId: session.id, channelId: process.env.SLACK_CHANNEL_ID, opportunityId: process.env.SF_OPPORTUNITY_ID!, quoteIds: [] });
  await openCallThread(key, `:factory: *Sales Factory* — call with *${account}*  _(Recall ${botId})_`);
  runConsumer(session.id); // open the stream before sending events

  await sendUserMessage(session.id, `Processing a completed sales call with ${account}. Coach on the key moments and track every pricing option discussed.`);
  for (const t of turns) {
    await sendUserMessage(session.id, `[${t.speaker}] ${t.text}`);
    await new Promise((r) => setTimeout(r, speedMs));
  }
  const rubric = fs.readFileSync(path.join(process.cwd(), "agents", "pitch-rubric.md"), "utf8");
  await defineOutcome(session.id, `Produce the post-call deliverables for ${account}.`, rubric);

  return NextResponse.json({
    ok: true, botId, turns: turns.length, sessionId: session.id,
    console: `https://platform.claude.com/workspaces/default/sessions/${session.id}`,
  });
}
