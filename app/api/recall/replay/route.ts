import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { createCallSession, sendUserMessage, defineOutcome } from "@/lib/anthropic";
import { runConsumer } from "@/lib/consumer";
import fs from "fs";
import path from "path";

// Deterministic demo spine: drives the full session/event/outcome path from a scripted call.
// POST { fixture?: "call-acme", speedMs?: 400 }
export async function POST(req: NextRequest) {
  const { fixture = "call-acme", speedMs = 400 } = await req.json().catch(() => ({}));
  const script = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "fixtures", `${fixture}.json`), "utf8"));
  const botId = `replay-${fixture}-${Date.now()}`;
  const session = await createCallSession({});
  store.set({ botId, sessionId: session.id, channelId: process.env.SLACK_CHANNEL_ID, opportunityId: process.env.SF_OPPORTUNITY_ID!, quoteIds: [] });

  runConsumer(session.id); // fire-and-forget: open the stream before sending events

  await sendUserMessage(session.id, `Replaying a live sales call for ${script.account}. Coach live; track every pricing option discussed.`);
  for (const turn of script.turns) {
    await sendUserMessage(session.id, `[${turn.speaker}] ${turn.text}`);
    await new Promise((r) => setTimeout(r, speedMs));
  }
  const rubric = fs.readFileSync(path.join(process.cwd(), "agents", "pitch-rubric.md"), "utf8");
  await defineOutcome(session.id, `Produce the post-call deliverables for ${script.account}.`, rubric);

  return NextResponse.json({ ok: true, sessionId: session.id, console: `https://platform.claude.com/workspaces/default/sessions/${session.id}` });
}
