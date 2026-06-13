// Shared customer-accept handler. Both entry points call this:
//   - Slack "Accept" button  → app/api/slack/interactivity (passes channel + thread from the payload)
//   - hosted offer page       → app/api/of/[id]?accept= (passes offerId; thread comes off the offer record)
// On accept it: marks the Quote Accepted, syncs it to the Opportunity (so Amount reflects it) and
// advances the stage to Closed Won, files the agreed Order Form as a Salesforce File on the Quote +
// Opportunity, and replies in the call's Slack thread. Idempotent: a second click is a no-op.
import { query, create, update, recordUrl } from "@/lib/salesforce";
import { postMessage } from "@/lib/slack";
import { offers } from "@/lib/offers";
import { renderAgreedOrderForm } from "@/lib/of-html";

const money = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const WON_STAGE = "Closed Won";

export type AcceptOpts = {
  offerId?: string;
  source?: "slack_button" | "of_page";
  channel?: string;
  threadTs?: string;
  account?: string;
  denyQuoteIds?: string[]; // the other options shown — set to 'Denied' so the win is unambiguous
};

export async function acceptOffer(quoteId: string, opts: AcceptOpts = {}) {
  const rows = await query<any>(
    `SELECT Id, Name, Status, TotalPrice, OpportunityId, Opportunity.Name, Opportunity.Account.Name,
            (SELECT Product2.ProductCode, Product2.Name, Quantity, UnitPrice, Discount, TotalPrice
             FROM QuoteLineItems ORDER BY TotalPrice DESC)
     FROM Quote WHERE Id = '${quoteId}'`
  );
  const q = rows[0];
  if (!q) return { ok: false as const, alreadyAccepted: false };
  const oppId: string = q.OpportunityId;
  const account: string = q.Opportunity?.Account?.Name || opts.account || "The customer";
  const alreadyAccepted = q.Status === "Accepted";

  if (!alreadyAccepted) {
    await update("Quote", quoteId, { Status: "Accepted" });
    // Deny the losing options so the picture is unambiguous: one Accepted, the rest Denied.
    const denyIds = opts.denyQuoteIds
      || (opts.offerId ? (offers.get(opts.offerId)?.options || []).map((o) => o.quoteId) : []);
    for (const id of denyIds) {
      if (id && id !== quoteId) { try { await update("Quote", id, { Status: "Denied" }); } catch { /* one bad id shouldn't abort the close */ } }
    }
    // Close the Opportunity and set Amount to the accepted quote's total DIRECTLY. Quote→Opp
    // sync is unreliable here: Salesforce breaks the sync the moment the Opp closes (in testing
    // it cleared SyncedQuoteId and left a stale Amount). So we null any existing sync to make
    // Amount writeable, then write the authoritative won-figures ourselves — works on every re-run.
    const today = new Date().toISOString().slice(0, 10);
    try { await update("Opportunity", oppId, { SyncedQuoteId: null }); } catch { /* no active sync */ }
    try { await update("Opportunity", oppId, { StageName: WON_STAGE, CloseDate: today, Amount: q.TotalPrice }); }
    catch (e) { console.error("[accept] close-won failed:", String(e).slice(0, 160)); }
    await fileAgreedOrderForm(quoteId, oppId, q, account);
  }

  // Resolve the Slack thread to reply into.
  let channel = opts.channel;
  let threadTs = opts.threadTs;
  if ((!channel || !threadTs) && opts.offerId) {
    const off = offers.get(opts.offerId);
    channel = channel || off?.channelId;
    threadTs = threadTs || off?.threadTs;
  }

  let posted = false;
  if (channel && threadTs && !alreadyAccepted) {
    const r = await postMessage({
      channel,
      thread_ts: threadTs,
      text: `✅ ${account} accepted ${q.Name} — ${money(q.TotalPrice)}/yr`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `:white_check_mark: *${account} accepted ${q.Name}*\n*${money(q.TotalPrice)}/yr* committed · Opportunity moved to *${WON_STAGE}* · agreed order form filed in Salesforce.` } },
        { type: "actions", elements: [
          { type: "button", text: { type: "plain_text", text: "Opportunity in Salesforce" }, url: recordUrl(oppId) },
          { type: "button", text: { type: "plain_text", text: "Accepted Quote" }, url: recordUrl(quoteId) },
        ] },
      ],
    });
    posted = !!r.ok;
  }

  return {
    ok: true as const,
    alreadyAccepted,
    quoteId,
    opportunityId: oppId,
    total: q.TotalPrice,
    account,
    posted,
    quoteUrl: recordUrl(quoteId),
    opportunityUrl: recordUrl(oppId),
  };
}

// File the agreed Order Form as a Salesforce File on the Quote, then link it to the Opportunity.
// Deduped so re-accept doesn't attach twice.
async function fileAgreedOrderForm(quoteId: string, oppId: string, quote: any, account: string) {
  try {
    const existing = await query<any>(
      `SELECT Id FROM ContentVersion WHERE FirstPublishLocationId = '${quoteId}' AND Title LIKE 'Order Form%'`
    );
    if (existing.length) return;
  } catch { /* if the filter isn't supported, fall through and create */ }

  const html = renderAgreedOrderForm({ account, quote });
  const versionData = Buffer.from(html, "utf8").toString("base64");
  let cvId: string;
  try {
    cvId = await create("ContentVersion", {
      Title: `Order Form — ${quote.Name} (Accepted)`,
      PathOnClient: "Order-Form.html",
      VersionData: versionData,
      FirstPublishLocationId: quoteId, // auto-links the file to the Quote
      ContentLocation: "S",
    });
  } catch (e) {
    console.error("[accept] file order form (ContentVersion) failed:", String(e).slice(0, 200));
    return;
  }
  try {
    const [cv] = await query<any>(`SELECT ContentDocumentId FROM ContentVersion WHERE Id = '${cvId}'`);
    if (cv?.ContentDocumentId) {
      await create("ContentDocumentLink", {
        ContentDocumentId: cv.ContentDocumentId,
        LinkedEntityId: oppId, // surface the same file on the Opportunity
        ShareType: "V",
        Visibility: "AllUsers",
      });
    }
  } catch (e) {
    console.error("[accept] link order form to Opportunity failed (filed on Quote only):", String(e).slice(0, 160));
  }
}
