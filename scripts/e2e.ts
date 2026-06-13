// E2E "test suite" — the model-verifiable, rerunnable "done" (Orchestration). Requires `npm run dev`
// running with a working consumer. Fires the scripted replay, REQUIRES the grader to reach
// "satisfied", then asserts the Salesforce records THIS run created (>=2 grounded options, free-seat
// motion, usage pool, expansion SKU on the top option) + the offer page. Run: npm run e2e
import fs from "node:fs";
import path from "node:path";
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
import { query } from "../lib/salesforce";
import { anthropic } from "../lib/anthropic";

const BASE = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
const OPP = process.env.SF_OPPORTUNITY_ID!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TERMINAL = new Set(["satisfied", "failed", "max_iterations_reached"]);

// Poll the session events (not a 2nd stream — that would compete with the relay's consumer).
async function waitForOutcome(sessionId: string, timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const page: any = await (anthropic as any).beta.sessions.events.list(sessionId, { limit: 200 });
    for (const ev of (page?.data ?? page?.events ?? [])) {
      if (ev.type === "span.outcome_evaluation_end" && TERMINAL.has(ev.result))
        return { result: ev.result as string, explanation: String(ev.explanation || "") };
      if (ev.type === "session.status_terminated") return { result: "terminated", explanation: "" };
    }
    await sleep(5000);
  }
  return { result: "timeout", explanation: "" };
}

async function main() {
  const t0 = new Date().toISOString().replace(/\.\d{3}Z$/, "Z"); // SOQL datetime literal (no millis)
  const res = await fetch(`${BASE}/api/recall/replay`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ fixture: "call-acme", speedMs: 120 }),
  });
  const { sessionId } = await res.json();
  console.log("replay session:", sessionId);

  const outcome = await waitForOutcome(sessionId);
  console.log(`grader: ${outcome.result} — ${outcome.explanation.slice(0, 160)}`);

  let quotes: any[] = [];
  for (let i = 0; i < 12; i++) {
    quotes = await query<any>(
      `SELECT Id, Name, TotalPrice, CreatedDate,
              (SELECT Product2.ProductCode, Quantity, Discount, TotalPrice FROM QuoteLineItems)
       FROM Quote WHERE OpportunityId = '${OPP}' AND CreatedDate >= ${t0}
       ORDER BY TotalPrice DESC`
    );
    if (quotes.length >= 2) break;
    await sleep(5000);
  }
  const top = quotes[0];
  const topLines = top?.QuoteLineItems?.records || [];
  const topSkus = new Set(topLines.map((l: any) => l.Product2?.ProductCode));
  const seat = topLines.find((l: any) => l.Product2?.ProductCode === "SKU-SEAT");
  let html = "";
  try { html = await (await fetch(`${BASE}/api/of/demo`)).text(); } catch {}

  const checks: [string, boolean][] = [
    ["grader satisfied", outcome.result === "satisfied"],
    [">= 2 quote options created this run", quotes.length >= 2],
    ["usage pool present (SKU-USAGE)", topSkus.has("SKU-USAGE")],
    ["expansion SKU on top option (FDE or PREMIUM)", topSkus.has("SKU-FDE") || topSkus.has("SKU-PREMIUM")],
    ["seats are FREE (100% / $0)", !!seat && (Number(seat.TotalPrice) === 0 || Number(seat.Discount) >= 100)],
    ["only catalog SKUs (no hallucinated items)", [...topSkus].every((s: any) => String(s || "").startsWith("SKU-"))],
    ["top option total > 0 (usage drives it)", Number(top?.TotalPrice) > 0],
    ["offer page renders Recommended + Accept", html.includes("Recommended") && html.includes("Accept")],
  ];
  let ok = true;
  for (const [name, pass] of checks) { console.log(pass ? "✅" : "❌", name); ok = ok && pass; }
  if (top) console.log(`\nTop option: ${top.Name} — $${Number(top.TotalPrice).toLocaleString()} (${quotes.length} options this run)`);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
