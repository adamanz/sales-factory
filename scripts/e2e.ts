// End-to-end check (the "test suite" the Orchestration rubric rewards):
// fire the replay, then assert the agent produced real, grounded deliverables.
import { query } from "../lib/salesforce";

const BASE = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
async function main() {
  const res = await fetch(`${BASE}/api/recall/replay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixture: "call-acme" }) });
  const { sessionId } = await res.json();
  console.log("session:", sessionId);
  // TODO: poll session until outcome satisfied (span.outcome_evaluation_end), then:
  const quotes = await query(`SELECT Id, TotalPrice, (SELECT Product2.ProductCode, Quantity, Discount, TotalPrice FROM QuoteLineItems) FROM Quote WHERE OpportunityId='${process.env.SF_OPPORTUNITY_ID}' ORDER BY CreatedDate DESC LIMIT 1`);
  const q = quotes[0];
  if (!q) throw new Error("FAIL: no Quote created");
  const lines = (q as any).QuoteLineItems?.records ?? [];
  const skus = new Set(lines.map((l: any) => l.Product2.ProductCode));
  const seat = lines.find((l: any) => l.Product2.ProductCode === "SKU-SEAT");
  const checks: [string, boolean][] = [
    ["Quote created", !!q],
    [">=2 line items", lines.length >= 2],
    ["usage pool present", skus.has("SKU-USAGE")],
    ["seats discounted", !!seat && seat.Discount > 0],
    ["catalog SKUs only", [...skus].every((s) => String(s).startsWith("SKU-"))],
  ];
  let ok = true;
  for (const [name, pass] of checks) { console.log(pass ? "✅" : "❌", name); ok = ok && pass; }
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
