// One-time org makeover for the demo: give the Acme opportunity a real buyer, a clean
// narrative, and a deliberate pair of catalog-grounded quotes (Lean $100k / Full $185k).
// Idempotent on the Contact; (re)pins the canonical quote pair into .env.local.
//   npm run demo:build
import fs from "node:fs";
import * as sf from "../lib/salesforce";

const ACCOUNT_ID = process.env.SF_ACCOUNT_ID!;
const PRICEBOOK_ID = process.env.SF_PRICEBOOK_ID!;
const PBE = {
  SEAT: process.env.SF_PBE_SEAT!, USAGE: process.env.SF_PBE_USAGE!,
  FDE: process.env.SF_PBE_FDE!, PREMIUM: process.env.SF_PBE_PREMIUM!,
};
const CONTACT = { first: "Dana", last: "Reyes", title: "VP, Engineering", email: "dana.reyes@acmerobotics.com", phone: "+1 (415) 555-0142" };
const plus = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

// Catalog-grounded line items (mirror the rubric's modern-AI pricing motion).
const SEAT = { pricebookEntryId: PBE.SEAT, quantity: 40, unitPrice: 1500, discount: 100, description: "40 platform seats — 100% waived. Adopt org-wide at zero per-seat cost." };
const USAGE = { pricebookEntryId: PBE.USAGE, quantity: 100, unitPrice: 1000, description: "Annual usage pool — 100 × $1,000 credit blocks. Powers every agent run, token & tool call." };
const FDE = { pricebookEntryId: PBE.FDE, quantity: 1, unitPrice: 60000, description: "Forward Deployed Engineer (quarterly) — embedded engineer shipping your highest-value workflows." };
const PREMIUM = { pricebookEntryId: PBE.PREMIUM, quantity: 1, unitPrice: 25000, description: "Premium Support (annual) — dedicated Slack channel, 1-hour SLA, named TAM." };

async function resolveOpp(): Promise<string> {
  const [o] = await sf.query<any>(`SELECT Id FROM Opportunity WHERE AccountId = '${ACCOUNT_ID}' ORDER BY CreatedDate DESC LIMIT 1`);
  if (!o) throw new Error(`No Opportunity found for account ${ACCOUNT_ID}`);
  return o.Id;
}

async function ensureContact(): Promise<string> {
  const [c] = await sf.query<any>(`SELECT Id FROM Contact WHERE AccountId = '${ACCOUNT_ID}' AND Email = '${CONTACT.email}' LIMIT 1`);
  if (c) return c.Id;
  return sf.create("Contact", { AccountId: ACCOUNT_ID, FirstName: CONTACT.first, LastName: CONTACT.last, Title: CONTACT.title, Email: CONTACT.email, Phone: CONTACT.phone });
}

async function ensurePrimaryRole(oppId: string, contactId: string) {
  const existing = await sf.query<any>(`SELECT Id, IsPrimary FROM OpportunityContactRole WHERE OpportunityId = '${oppId}' AND ContactId = '${contactId}'`);
  if (existing.length) return;
  try { await sf.create("OpportunityContactRole", { OpportunityId: oppId, ContactId: contactId, Role: "Decision Maker", IsPrimary: true }); }
  catch (e) { console.warn("  (contact role skipped:", String((e as any)?.message || e).slice(0, 120), ")"); }
}

function writeEnv(updates: Record<string, string>) {
  let env = fs.readFileSync(".env.local", "utf8");
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    env = re.test(env) ? env.replace(re, `${k}=${v}`) : env + `\n${k}=${v}`;
  }
  fs.writeFileSync(".env.local", env);
}

async function main() {
  const oppId = await resolveOpp();
  console.log("Opportunity:", oppId);

  const contactId = await ensureContact();
  console.log("Contact (Dana Reyes):", contactId);
  await ensurePrimaryRole(oppId, contactId);

  // Enrich the opportunity into a clean, believable late-stage deal.
  await sf.update("Opportunity", oppId, {
    Name: "Acme Robotics — Platform Rollout",
    StageName: "Proposal/Price Quote",
    CloseDate: plus(21),
    NextStep: "Customer reviewing tailored options (Lean vs. Full). Awaiting acceptance to finalize.",
    Description: "Acme Robotics evaluating the platform org-wide. Modern AI pricing: free seats + a committed annual usage pool, expanding with a Forward Deployed Engineer and Premium Support. Two options presented — Lean ($100k) and Full ($185k, recommended).",
  });
  console.log("Opportunity enriched → 'Acme Robotics — Platform Rollout' @ Proposal/Price Quote");

  const common = { opportunityId: oppId, pricebookId: PRICEBOOK_ID, status: "Presented", expirationDate: plus(30), contactId, email: CONTACT.email, phone: CONTACT.phone };
  const lean = await sf.createQuote({
    ...common, name: "Acme Robotics — Lean (Land)",
    description: "Land fast: org-wide adoption with a right-sized usage pool. Free seats — you commit to usage.",
    lines: [SEAT, USAGE],
  });
  const full = await sf.createQuote({
    ...common, name: "Acme Robotics — Full (Land + Expand)",
    description: "Land + expand: everything in Lean, plus an embedded Forward Deployed Engineer and Premium Support to drive value from day one.",
    lines: [SEAT, USAGE, FDE, PREMIUM],
  });
  console.log(`Lean quote: ${lean.quoteId}  $${lean.total.toLocaleString()}`);
  console.log(`Full quote: ${full.quoteId}  $${full.total.toLocaleString()}`);

  writeEnv({ SF_OPPORTUNITY_ID: oppId, SF_DEMO_QUOTE_LEAN: lean.quoteId, SF_DEMO_QUOTE_FULL: full.quoteId });
  console.log("\n.env.local updated → SF_OPPORTUNITY_ID + SF_DEMO_QUOTE_LEAN/FULL pinned.");
  console.log(`Offer page: ${process.env.PUBLIC_BASE_URL || "http://localhost:3000"}/api/of/demo`);
}
main().catch((e) => { console.error(e); process.exit(1); });
