import { NextRequest } from "next/server";
import { query, update } from "@/lib/salesforce";
import { offers, OfferConfig } from "@/lib/offers";

const SF = () => process.env.SALESFORCE_INSTANCE_URL!;
const sfRecordUrl = (quoteId: string) => `${SF()}/lightning/r/Quote/${quoteId}/view`;
const isQuoteId = (s: string) => /^0Q[0-9A-Za-z]{13,16}$/.test(s);
const money = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

// Build an offer config from the latest 2 quotes on the demo Opportunity (pinned if set).
async function demoConfig(): Promise<OfferConfig | undefined> {
  const lean = process.env.SF_DEMO_QUOTE_LEAN, full = process.env.SF_DEMO_QUOTE_FULL;
  if (lean && full) return { account: "Acme Robotics", headline: "Your tailored options", options: [{ quoteId: lean, label: "Lean (Land)" }, { quoteId: full, label: "Full (Land + Expand)", recommended: true }] };
  const rows = await query<any>(`SELECT Id, Name, TotalPrice FROM Quote WHERE OpportunityId = '${process.env.SF_OPPORTUNITY_ID}' ORDER BY CreatedDate DESC LIMIT 2`);
  if (!rows.length) return undefined;
  const recId = [...rows].sort((a, b) => (b.TotalPrice || 0) - (a.TotalPrice || 0))[0].Id;
  return { account: "Acme Robotics", headline: "Your tailored options", options: rows.map((q) => ({ quoteId: q.Id, label: q.Name, recommended: q.Id === recId })) };
}
function configFromIds(sp: URLSearchParams): OfferConfig {
  const ids = (sp.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const rec = sp.get("rec");
  return { account: sp.get("account") || undefined, headline: sp.get("headline") || undefined, notes: sp.get("notes") || undefined, options: ids.map((quoteId) => ({ quoteId, recommended: quoteId === rec })) };
}

// GET /api/of/<quoteId>  → enterprise order form for a single Salesforce Quote, live from SF.
// Also: /api/of/demo, /api/of/<offerId>, /api/of/x?ids=ID1,ID2&rec=ID2 . ?accept=<quoteId> marks Accepted.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  let cfg = offers.get(id);
  if (!cfg && sp.get("ids")) cfg = configFromIds(sp);
  else if (!cfg && id === "demo") cfg = await demoConfig();
  else if (!cfg && isQuoteId(id)) cfg = { options: [{ quoteId: id, recommended: true }] }; // quote-id-addressable
  if (!cfg) return new Response("Offer not found", { status: 404 });

  const accept = sp.get("accept");
  let acceptedId: string | null = null;
  if (accept) { try { await update("Quote", accept, { Status: "Accepted" }); acceptedId = accept; } catch {} }

  const ids = cfg.options.map((o) => `'${o.quoteId}'`).join(",");
  const rows = await query<any>(
    `SELECT Id, Name, Status, TotalPrice, ExpirationDate, Description, Opportunity.Account.Name,
            (SELECT Product2.ProductCode, Product2.Name, Description, Quantity, UnitPrice, Discount, TotalPrice
             FROM QuoteLineItems ORDER BY TotalPrice DESC)
     FROM Quote WHERE Id IN (${ids})`
  );
  const byId: Record<string, any> = Object.fromEntries(rows.map((r) => [r.Id, r]));
  const options = cfg.options.map((o) => ({ ...o, quote: byId[o.quoteId], accepted: o.quoteId === acceptedId || byId[o.quoteId]?.Status === "Accepted" })).filter((o) => o.quote);
  const account = cfg.account || options[0]?.quote?.Opportunity?.Account?.Name || "Your team";
  return new Response(render(account, cfg.headline, options, id, !!acceptedId), { headers: { "content-type": "text/html; charset=utf-8" } });
}

function lineRow(li: any) {
  const disc = Number(li.Discount || 0);
  const free = disc >= 100 || Number(li.TotalPrice) === 0;
  const amount = free ? `<span class="free">$0</span><span class="waived">100% waived</span>` : money(li.TotalPrice);
  const unit = `${money(li.UnitPrice)}${disc > 0 && !free ? ` <span class="disc">−${disc}%</span>` : ""}`;
  return `<tr>
    <td><span class="sku">${li.Product2?.ProductCode || ""}</span></td>
    <td><div class="pname">${li.Product2?.Name || ""}</div><div class="pdesc">${li.Description || ""}</div></td>
    <td class="num">${li.Quantity}</td>
    <td class="num">${unit}</td>
    <td class="num amt">${amount}</td>
  </tr>`;
}

function optionSection(opt: any, offerId: string) {
  const q = opt.quote;
  const lines = (q.QuoteLineItems?.records || []).map(lineRow).join("");
  const cta = opt.accepted
    ? `<div class="accepted">✓ Accepted</div>`
    : `<a class="btn primary" href="/api/of/${offerId}?accept=${q.Id}">Accept this proposal</a>`;
  return `<section class="card ${opt.recommended ? "rec" : ""} ${opt.accepted ? "won" : ""}">
    ${opt.recommended ? `<div class="ribbon">Recommended</div>` : ""}
    <div class="opt-head"><div><div class="opt-label">${opt.label || q.Name}</div><div class="opt-status">Quote ${q.Status}${q.ExpirationDate ? ` · valid through ${q.ExpirationDate}` : ""}</div></div>
      <div class="opt-total">${money(q.TotalPrice)}<span class="per">/year</span></div></div>
    <table class="lines"><thead><tr><th>SKU</th><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead><tbody>${lines}</tbody>
      <tfoot><tr><td colspan="4" class="num">Annual total</td><td class="num amt total">${money(q.TotalPrice)}</td></tr></tfoot></table>
    <div class="actions">${cta}<a class="btn ghost" href="${sfRecordUrl(q.Id)}" target="_blank" rel="noopener">View in Salesforce →</a></div>
  </section>`;
}

function render(account: string, headline: string | undefined, options: any[], offerId: string, accepted: boolean) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${headline || "Proposal"} — ${account}</title><style>
  :root{--navy:#0b1f3a;--ink:#0f1729;--mut:#5b6b85;--line:#e4e9f2;--accent:#0f766e;--accent2:#10b981;--bg:#eef2f8}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:920px;margin:0 auto;padding:0 0 64px}
  .top{background:linear-gradient(180deg,#0b1f3a,#0e2748);color:#fff;padding:34px 40px;border-radius:0 0 20px 20px}
  .eyebrow{letter-spacing:.2em;text-transform:uppercase;font-size:11px;color:#8fb4d6;font-weight:700}
  .top h1{margin:8px 0 2px;font-size:30px;font-weight:800;letter-spacing:-.02em}
  .top .acct{color:#c7d6ea;font-size:15px}
  .sfbtn{float:right;margin-top:4px;color:#bfe9dd;border:1px solid #1f6f57;background:#0c3a30;padding:8px 12px;border-radius:9px;text-decoration:none;font-weight:600;font-size:13px}
  .model{margin:22px 40px 0;background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:14px;padding:16px 18px;font-size:14.5px;line-height:1.5}
  .model b{color:#047857}
  .card{position:relative;background:#fff;border:1px solid var(--line);border-radius:16px;margin:22px 40px 0;padding:24px;box-shadow:0 12px 30px -20px #0b1f3a55}
  .card.rec{border-color:var(--accent2);box-shadow:0 0 0 1px var(--accent2),0 18px 40px -24px #0f766e66}
  .ribbon{position:absolute;top:-12px;right:22px;background:var(--accent2);color:#04241a;font-weight:800;font-size:12px;padding:5px 12px;border-radius:999px}
  .opt-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:1px solid var(--line);padding-bottom:16px}
  .opt-label{font-size:19px;font-weight:800} .opt-status{color:var(--mut);font-size:13px;margin-top:3px}
  .opt-total{font-size:30px;font-weight:850;white-space:nowrap} .per{font-size:14px;color:var(--mut);font-weight:600;margin-left:4px}
  table.lines{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px}
  .lines th{text-align:left;color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em;padding:8px 10px;border-bottom:1px solid var(--line)}
  .lines td{padding:12px 10px;border-bottom:1px solid #f1f4f9;vertical-align:top}
  .num{text-align:right;white-space:nowrap} .amt{font-weight:700}
  .sku{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#f1f4f9;border:1px solid var(--line);border-radius:6px;padding:2px 7px;color:#334}
  .pname{font-weight:650} .pdesc{color:var(--mut);font-size:12.5px;margin-top:3px;max-width:430px;line-height:1.4}
  .disc{color:#b45309;font-weight:700;font-size:12px}
  .free{color:var(--accent2);font-weight:850} .waived{display:block;color:#059669;font-size:11px;font-weight:600}
  .lines tfoot td{border-bottom:none;border-top:2px solid var(--line);padding-top:14px;font-weight:700} .total{font-size:18px;color:var(--navy)}
  .actions{display:flex;gap:12px;margin-top:20px;flex-wrap:wrap}
  .btn{display:inline-block;padding:12px 18px;border-radius:11px;text-decoration:none;font-weight:750;font-size:14px}
  .btn.primary{background:var(--accent2);color:#04241a} .btn.primary:hover{filter:brightness(1.05)}
  .btn.ghost{background:#fff;color:var(--navy);border:1px solid var(--line)}
  .accepted{display:inline-block;padding:12px 18px;border-radius:11px;background:#ecfdf5;border:1px solid #6ee7b7;color:#047857;font-weight:800}
  .banner{margin:22px 40px 0;background:#0e2748;color:#bbf7d0;border-radius:12px;padding:14px 18px;font-weight:600}
  .foot{margin:30px 40px 0;color:#8a98ad;font-size:12px;border-top:1px solid var(--line);padding-top:16px}
  @media(max-width:600px){.top,.model,.card,.banner,.foot{margin-left:14px;margin-right:14px;padding-left:18px;padding-right:18px}.pdesc{max-width:none}}
</style></head><body><div class="wrap">
  <div class="top">${options[0] ? `<a class="sfbtn" href="${sfRecordUrl(options[0].quote.Id)}" target="_blank" rel="noopener">View in Salesforce →</a>` : ""}
    <div class="eyebrow">Proposal for ${account}</div>
    <h1>${headline || (options.length > 1 ? "Your tailored options" : options[0]?.quote?.Name || "Enterprise Agreement")}</h1>
    <div class="acct">Modern AI platform — seats included, you commit to usage.</div></div>
  ${accepted ? `<div class="banner">🎉 Accepted — your account team will follow up to finalize. Status written back to Salesforce.</div>` : ""}
  <div class="model">💡 <b>How our pricing works:</b> Platform <b>seats are free</b> (100% waived) — you commit to an annual <b>usage pool</b>, and we expand with a dedicated <b>Forward Deployed Engineer</b> and <b>Premium Support</b>. You pay for value delivered, not seats.</div>
  ${options.map((o) => optionSection(o, offerId)).join("")}
  <div class="foot">Rendered live from Salesforce · ${options.map((o) => "Quote " + o.quote.Id).join(" · ")}</div>
</div></body></html>`;
}
