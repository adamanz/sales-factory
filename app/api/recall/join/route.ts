import { NextRequest, NextResponse } from "next/server";
const KEY = process.env.RECALL_API_KEY;
const REGION = process.env.RECALL_REGION || "us-west-2";

export async function POST(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: "RECALL_API_KEY not set" }, { status: 500 });
  const { meetingUrl } = await req.json();
  if (!meetingUrl) return NextResponse.json({ error: "meetingUrl required" }, { status: 400 });
  const res = await fetch(`https://${REGION}.recall.ai/api/v1/bot/`, {
    method: "POST",
    headers: { Authorization: `Token ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: "Sales Factory",
      recording_config: {
        transcript: { provider: { meeting_captions: { language_code: "en" } } },
        realtime_endpoints: [{
          type: "webhook",
          url: `${process.env.PUBLIC_BASE_URL}/api/recall/webhook`,
          events: ["transcript.data", "transcript.partial_data"],
        }],
      },
    }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 200 : res.status });
}
