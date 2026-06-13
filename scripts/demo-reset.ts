// Re-prime the demo after a close: put the Opportunity + pinned quotes back to the
// pre-accept state so you can click "Accept" and watch it flip to Closed Won again.
//   npm run demo:reset
import * as sf from "../lib/salesforce";

const OPP = process.env.SF_OPPORTUNITY_ID!;
const LEAN = process.env.SF_DEMO_QUOTE_LEAN;
const FULL = process.env.SF_DEMO_QUOTE_FULL;
const plus = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

async function main() {
  // 1. Un-sync any synced quote (frees Amount to be editable again).
  try { await sf.update("Opportunity", OPP, { SyncedQuoteId: null }); } catch (e) { console.warn("unsync:", String((e as any)?.message || e).slice(0, 100)); }

  // 2. Remove line items that quote-sync mirrored onto the opportunity.
  const olis = await sf.query<any>(`SELECT Id FROM OpportunityLineItem WHERE OpportunityId = '${OPP}'`);
  for (const o of olis) { try { await sf.del("OpportunityLineItem", o.Id); } catch { /* ignore */ } }
  if (olis.length) console.log(`Removed ${olis.length} synced Opportunity line item(s).`);

  // 3. Re-open the opportunity.
  await sf.update("Opportunity", OPP, { StageName: "Proposal/Price Quote", CloseDate: plus(21), Amount: null });
  console.log("Opportunity re-opened → Proposal/Price Quote, Amount cleared.");

  // 4. Put the pinned quotes back to 'Presented'.
  for (const id of [LEAN, FULL].filter(Boolean) as string[]) {
    try { await sf.update("Quote", id, { Status: "Presented" }); } catch { /* ignore */ }
  }
  console.log("Pinned Lean/Full quotes → Presented. Ready to demo again.");
}
main().catch((e) => { console.error(e); process.exit(1); });
