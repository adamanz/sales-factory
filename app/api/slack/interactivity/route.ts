import { NextRequest, NextResponse } from "next/server";
import { acceptOffer } from "@/lib/accept";
import { verifySlackSignature } from "@/lib/slack";
// Slack "Accept" button → close the loop in Salesforce + reply in-thread.
// Button value is "<quoteId>" or "<quoteId>|<offerId>".
export async function POST(req: NextRequest) {
  // Read the RAW body first so we can verify the Slack signature, then parse the form payload.
  const raw = await req.text();
  if (!verifySlackSignature(raw, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"))) {
    return new NextResponse("bad signature", { status: 401 });
  }
  const payload = JSON.parse(new URLSearchParams(raw).get("payload") || "{}");
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
