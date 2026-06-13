import { NextRequest, NextResponse } from "next/server";
import { acceptOffer } from "@/lib/accept";
// Slack "Accept" button → close the loop in Salesforce + reply in-thread.
// Button value is "<quoteId>" or "<quoteId>|<offerId>". (Verify Slack signature in prod.)
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const payload = JSON.parse(String(form.get("payload") || "{}"));
  const action = payload?.actions?.[0]?.action_id;
  if (action === "confirm_order" || action === "accept_quote") {
    const [quoteId, offerId] = String(payload.actions[0].value || "").split("|");
    const channel = payload?.channel?.id;
    const threadTs = payload?.message?.thread_ts || payload?.message?.ts;
    // Fire-and-forget: Slack needs a 200 within ~3s; the SF writes + reply run after we ack.
    if (quoteId) acceptOffer(quoteId, { source: "slack_button", channel, threadTs, offerId }).catch((e) => console.error("[interactivity] acceptOffer:", e));
  }
  return NextResponse.json({ ok: true });
}
