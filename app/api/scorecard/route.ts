import { NextRequest, NextResponse } from "next/server";
import { scoreCall, toSlackMarkdown } from "@/lib/scorecard";

// Stateless post-call scorecard: transcript in, JSON + Slack markdown out. Nothing is posted or
// stored, so it runs fine as a Vercel serverless function (unlike the relay routes).
export const runtime = "nodejs";
export const maxDuration = 60;

// POST application/json { transcript, rep?, account?, llm? }  (transcript: text, turns[], or Recall segments)
// POST text/plain       raw "Speaker: text" transcript; ?rep=&account=&llm=false as query params
export async function POST(req: NextRequest) {
  const token = process.env.SCORECARD_API_TOKEN;
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const qs = req.nextUrl.searchParams;
  let body: Record<string, any>;
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    body = await req.json().catch(() => ({}));
  } else {
    body = { transcript: await req.text() };
  }
  const transcript = body.transcript ?? (body.turns || body.segments ? body : undefined);
  if (!transcript) return NextResponse.json({ error: "transcript required" }, { status: 400 });

  const repRaw = body.rep ?? qs.get("rep");
  const rep = repRaw ? (Array.isArray(repRaw) ? repRaw.map(String) : [String(repRaw)]) : undefined;
  const llmOff = body.llm === false || qs.get("llm") === "false";

  try {
    const scorecard = await scoreCall(transcript, {
      rep,
      account: body.account ?? qs.get("account") ?? undefined,
      judge: llmOff ? null : undefined,
    });
    return NextResponse.json({ scorecard, markdown: toSlackMarkdown(scorecard) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
