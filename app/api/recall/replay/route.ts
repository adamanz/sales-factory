import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { createCallSession, sendUserMessage, defineOutcome } from "@/lib/anthropic";
import fs from "fs";
import path from "path";

// Drives the identical session/event/outcome path from a scripted transcript —
// the deterministic, offline-safe demo spine. POST { fixture?: "call-acme" }.
export async function POST(req: NextRequest) {
  const { fixture = "call-acme", speedMs = 400 } = await req.json().catch(() => ({}));
  const script = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "fixtures", `${fixture}.json`), "utf8"));
  const botId = `replay-${fixture}`;
  const session = await createCallSession({ memoryStoreId: undefined });
  store.set({ botId, sessionId: session.id, opportunityId: process.env.SF_OPPORTUNITY_ID!, quoteIds: [] });
  await sendUserMessage(session.id, `Replaying call for ${script.account}. Coach live; track every pricing option.`);
  for (const turn of script.turns) {
    await sendUserMessage(session.id, `[${turn.speaker}] ${turn.text}`);
    await new Promise((r) => setTimeout(r, speedMs));
  }
  const rubric = fs.readFileSync(path.join(process.cwd(), "agents", "pitch-rubric.md"), "utf8");
  await defineOutcome(session.id, `Produce post-call deliverables for ${script.account}.`, rubric);
  return NextResponse.json({ ok: true, sessionId: session.id, consoleUrl: `https://platform.claude.com/workspaces/default/sessions/${session.id}` });
}
