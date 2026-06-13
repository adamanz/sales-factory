import { NextRequest } from "next/server";
import { query, update } from "@/lib/salesforce";
import { offers, OfferConfig } from "@/lib/offers";

// Dependency-free demo/fallback: build an offer from the latest Quotes on the demo Opportunity.
async function demoConfig(): Promise<OfferConfig | undefined> {
  const rows = await query<any>(
    `SELECT Id, Name, TotalPrice FROM Quote WHERE OpportunityId = '${process.env.SF_OPPORTUNITY_ID}' ORDER BY CreatedDate DESC LIMIT 2`
  );
  if (!rows.length) return undefined;
  const recId = [...rows].sort((a, b) => (b.TotalPrice || 0) - (a.TotalPrice || 0))[0].Id;
  return {
    account: "Acme Robotics",
    headline: "Your tailored options",
    options: rows.map((q) => ({ quoteId: q.Id, label: q.Name, recommended: q.Id === recId })),
  };
}

// Server-rendered offer / order form, LIVE from Salesforce. GET /api/of/[id]
// ?accept=<quoteId> marks that Quote accepted in Salesforce and re-renders.
// Self-contained offer encoded in the URL (?ids=ID1,ID2&rec=ID2) so links survive server
// restarts (in-memory store resets) and render on any deployment with no shared store.
function configFromIds(sp: URLSearchParams): OfferConfig {
  const ids = (sp.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const rec = sp.get("rec");
  return {
    account: sp.get("account") || undefined,
    headline: sp.get("headline") || undefined,
    notes: sp.get("notes") || undefined,
    options: ids.map((quoteId) => ({ quoteId, recommended: quoteId === rec })),
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const cfg = offers.get(id) || (sp.get("ids") ? configFromIds(sp) : id === "demo" ? await demoConfig() : undefined);
  if (!cfg) return new Response("Offer not found", { status: 404 });

  const accept = sp.get("accept");
  let acceptedId: string | null = null;
  if (accept) {
    try { await update("Quote", accept, { Status: "Accepted" }); acceptedId = accept; } catch (e) { /* show page anyway */ }
  }

  const options: any[] = [];
  for (const opt of cfg.options) {
    const rows = await query(
      `SELECT Id, Name, Status, TotalPrice,
              (SELECT Product2.Name, Product2.ProductCode, Quantity, UnitPrice, Discount, TotalPrice
               FROM QuoteLineItems ORDER BY TotalPrice DESC)
       FROM Quote WHERE Id = '${opt.quoteId}'`
    );
    if (rows[0]) options.push({ ...opt, quote: rows[0], accepted: rows[0].Id === acceptedId || rows[0].Status === "Accepted" });
  }

  return new Response(render(cfg, options, id, acceptedId), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const money = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

function lineRow(li: any) {
  const disc = Number(li.Discount || 0);
  const discPill = disc > 0 ? `<span class="pill">${disc}% off</span>` : "";
  const sub = `${li.Quantity} × ${money(li.UnitPrice)}${disc > 0 ? " " + discPill : ""}`;
  const total = disc >= 100 ? `<span class="free">$0</span>` : money(li.TotalPrice);
  return `<tr><td><div class="li-name">${li.Product2?.Name || li.Product2?.ProductCode || "Item"}</div>
    <div class="li-sub">${sub}</div></td><td class="li-total">${total}</td></tr>`;
}

function card(opt: any, offerId: string) {
  const q = opt.quote;
  const rec = opt.recommended;
  const accepted = opt.accepted;
  const lines = (q.QuoteLineItems?.records || []).map(lineRow).join("");
  const cta = accepted
    ? `<div class="accepted-badge">✓ Accepted</div>`
    : `<a class="cta" href="/api/of/${offerId}?accept=${q.Id}">Accept ${opt.label || "this option"}</a>`;
  return `<div class="card ${rec ? "rec" : ""} ${accepted ? "won" : ""}">
    ${rec ? `<div class="ribbon">Recommended</div>` : ""}
    <div class="card-h"><div class="label">${opt.label || q.Name}</div></div>
    <div class="total">${money(q.TotalPrice)}<span class="per">/year</span></div>
    <table class="lines">${lines}</table>
    ${cta}
  </div>`;
}

function render(cfg: any, options: any[], offerId: string, acceptedId: string | null) {
  const banner = acceptedId
    ? `<div class="banner">🎉 Thanks — your option is locked in. Your account team will follow up to finalize.</div>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${cfg.headline || "Your offer"} — ${cfg.account || ""}</title>
<style>
  :root{--bg:#0a0e16;--card:#121826;--line:#222c3d;--ink:#e8edf6;--mut:#8a97ad;--acc:#2dd4a7;--acc2:#34d399}
  *{box-sizing:border-box}
  body{margin:0;background:radial-gradient(1200px 600px at 50% -10%,#16203210,transparent),var(--bg);
    color:var(--ink);font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1000px;margin:0 auto;padding:56px 20px 80px}
  .eyebrow{letter-spacing:.18em;text-transform:uppercase;font-size:12px;color:var(--acc);font-weight:700}
  h1{font-size:40px;line-height:1.1;margin:10px 0 6px;font-weight:800;letter-spacing:-.02em}
  .sub{color:var(--mut);font-size:17px;max-width:640px}
  .banner{margin:20px 0 0;padding:14px 18px;border:1px solid #1f6f57;background:#0f2a22;border-radius:12px;color:#9ff0d6}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-top:34px}
  .card{position:relative;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px 24px;
    box-shadow:0 24px 60px -30px #000}
  .card.rec{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc),0 30px 70px -28px #0b3b2e}
  .card.won{border-color:#2f8f72}
  .ribbon{position:absolute;top:-12px;right:18px;background:var(--acc);color:#04150f;font-weight:800;font-size:12px;
    letter-spacing:.04em;padding:6px 12px;border-radius:999px}
  .label{font-size:14px;color:var(--mut);font-weight:600;text-transform:uppercase;letter-spacing:.08em}
  .total{font-size:42px;font-weight:850;margin:8px 0 18px;letter-spacing:-.02em}
  .per{font-size:15px;color:var(--mut);font-weight:600;margin-left:6px}
  table.lines{width:100%;border-collapse:collapse;margin-bottom:22px}
  .lines td{padding:12px 0;border-top:1px solid var(--line);vertical-align:top}
  .li-name{font-weight:650}
  .li-sub{color:var(--mut);font-size:13px;margin-top:3px}
  .li-total{text-align:right;font-weight:750;white-space:nowrap}
  .free{color:var(--acc2);font-weight:800}
  .pill{display:inline-block;background:#10311f;color:#7fe7be;border:1px solid #1f6f57;border-radius:999px;
    font-size:11px;font-weight:700;padding:2px 8px;margin-left:6px;vertical-align:middle}
  .cta{display:block;text-align:center;background:var(--acc);color:#04150f;font-weight:800;text-decoration:none;
    padding:13px;border-radius:12px;transition:transform .06s ease}
  .cta:hover{transform:translateY(-1px)}
  .card:not(.rec) .cta{background:transparent;color:var(--acc);border:1px solid var(--acc)}
  .accepted-badge{text-align:center;color:var(--acc2);font-weight:800;padding:13px;border:1px solid #2f8f72;border-radius:12px}
  .notes{margin-top:30px;color:var(--mut);font-size:14px;line-height:1.6;max-width:680px}
  .foot{margin-top:46px;color:#5b6678;font-size:12px;border-top:1px solid var(--line);padding-top:18px}
</style></head>
<body><div class="wrap">
  <div class="eyebrow">Proposal for ${cfg.account || "your team"}</div>
  <h1>${cfg.headline || "Your tailored options"}</h1>
  <div class="sub">${cfg.notes || "Two ways to get started, based on what we discussed on the call. Seats are on us — you only pay for what you use."}</div>
  ${banner}
  <div class="grid">${options.map((o) => card(o, offerId)).join("")}</div>
  <div class="foot">Generated from your sales call · rendered live from Salesforce · prices reflect the current quote.</div>
</div></body></html>`;
}
