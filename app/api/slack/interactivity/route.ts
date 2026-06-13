import { NextRequest, NextResponse } from "next/server";
import { update } from "@/lib/salesforce";
// Confirm Order → advance the Quote/Opportunity. (Verify Slack signature in prod.)
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const payload = JSON.parse(String(form.get("payload") || "{}"));
  const action = payload?.actions?.[0]?.action_id;
  if (action === "confirm_order") {
    const quoteId = payload.actions[0].value;
    if (quoteId) await update("Quote", quoteId, { Status: "Accepted" });
    // TODO: advance Opportunity stage + post confirmation back to thread
  }
  return NextResponse.json({ ok: true });
}
