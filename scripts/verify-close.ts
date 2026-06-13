// Verifies the demo climax against the LIVE org: customer accepts the Full quote →
// Lean denied, Opportunity Closed Won @ the quote total, agreed order form filed, and a
// win posted into a Slack thread. Exercises the real lib/accept path via a stored offer.
//   npm run verify:close      (then `npm run demo:reset` to re-prime)
import * as sf from "../lib/salesforce";
import { offers } from "../lib/offers";
import { acceptOffer } from "../lib/accept";
import { postMessage } from "../lib/slack";

const OPP = process.env.SF_OPPORTUNITY_ID!;
const FULL = process.env.SF_DEMO_QUOTE_FULL!;
const LEAN = process.env.SF_DEMO_QUOTE_LEAN!;
const CHAN = process.env.SLACK_CHANNEL_ID;
const today = new Date().toISOString().slice(0, 10);

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };

async function main() {
  console.log(`Opp ${OPP} · Full ${FULL} · Lean ${LEAN}\n`);

  // Open a Slack root so the win has a thread to reply into (proves the in-thread writeback).
  let threadTs: string | undefined;
  if (CHAN) {
    const root = await postMessage({ channel: CHAN, text: ":test_tube: verify:close — simulating customer acceptance" });
    threadTs = root.ok ? root.ts! : undefined;
    check("Slack root posted (thread for the win)", !!threadTs);
  }

  // Stamp a stored offer so acceptOffer resolves deny-list + channel/thread off the record.
  offers.put("verify-offer", {
    account: "Acme Robotics", headline: "Your tailored options",
    options: [{ quoteId: FULL, label: "Full", recommended: true }, { quoteId: LEAN, label: "Lean" }],
    channelId: CHAN, threadTs,
  });

  const r = await acceptOffer(FULL, { offerId: "verify-offer", source: "of_page" });
  check("acceptOffer returned ok", (r as any).ok === true);
  check("acceptOffer total = $185,000", (r as any).total === 185000, `got ${(r as any).total}`);
  if (CHAN) check("win posted to Slack thread", (r as any).posted === true);

  // Re-query the org as the source of truth.
  const [opp] = await sf.query<any>(`SELECT StageName, Amount, CloseDate, IsWon, IsClosed FROM Opportunity WHERE Id = '${OPP}'`);
  check("Opportunity StageName = Closed Won", opp?.StageName === "Closed Won", opp?.StageName);
  check("Opportunity IsWon", opp?.IsWon === true);
  check("Opportunity Amount = 185000", Number(opp?.Amount) === 185000, String(opp?.Amount));
  check("Opportunity CloseDate = today", opp?.CloseDate === today, opp?.CloseDate);

  const quotes = await sf.query<any>(`SELECT Id, Status FROM Quote WHERE Id IN ('${FULL}','${LEAN}')`);
  const byId = Object.fromEntries(quotes.map((q: any) => [q.Id, q.Status]));
  check("Full quote = Accepted", byId[FULL] === "Accepted", byId[FULL]);
  check("Lean quote = Denied", byId[LEAN] === "Denied", byId[LEAN]);

  const files = await sf.query<any>(`SELECT Id, Title FROM ContentVersion WHERE FirstPublishLocationId = '${FULL}' AND Title LIKE 'Order Form%'`);
  check("Agreed order form filed on the Quote", files.length >= 1, files[0]?.Title || "none");

  console.log(`\n${fail === 0 ? "🎉 ALL PASS" : "⚠️  FAILURES"} — ${pass} passed, ${fail} failed.`);
  if (fail === 0) console.log("Run `npm run demo:reset` to re-prime for the next run.");
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
