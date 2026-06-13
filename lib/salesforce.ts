// Salesforce REST client (direct-token mode). Backs the agent's `salesforce_op`
// custom tool. Verified against simpleco.my.salesforce.com (catalog + Quote flow).
const API = "v62.0";

function base() {
  const url = process.env.SALESFORCE_INSTANCE_URL;
  const token = process.env.SALESFORCE_ACCESS_TOKEN;
  if (!url || !token) throw new Error("Missing SALESFORCE_INSTANCE_URL / SALESFORCE_ACCESS_TOKEN");
  return { url, token };
}
function headers() {
  return { Authorization: `Bearer ${base().token}`, "Content-Type": "application/json" };
}
async function sf(path: string, init?: RequestInit) {
  const res = await fetch(`${base().url}/services/data/${API}${path}`, { ...init, headers: { ...headers(), ...(init?.headers || {}) } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`SF ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

export async function query<T = any>(soql: string): Promise<T[]> {
  const r = await sf(`/query?q=${encodeURIComponent(soql)}`);
  return r.records as T[];
}
export async function create(sobject: string, fields: Record<string, any>): Promise<string> {
  const r = await sf(`/sobjects/${sobject}`, { method: "POST", body: JSON.stringify(fields) });
  return r.id as string;
}
export async function update(sobject: string, id: string, fields: Record<string, any>): Promise<void> {
  await sf(`/sobjects/${sobject}/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
}
export function recordUrl(id: string): string {
  return `${base().url}/lightning/r/${id}/view`;
}

// --- Catalog (modern AI pricing SKUs) ---
export async function getCatalog() {
  return query(
    `SELECT Id, UnitPrice, Product2.Name, Product2.ProductCode, Product2.Family
     FROM PricebookEntry
     WHERE Pricebook2Id = '${process.env.SF_PRICEBOOK_ID}' AND IsActive = true AND Product2.ProductCode LIKE 'SKU-%'
     ORDER BY UnitPrice`
  );
}

// --- Quote + line items ---
export type QuoteLine = { pricebookEntryId: string; quantity: number; unitPrice: number; discount?: number };
export async function createQuote(opts: { opportunityId: string; pricebookId: string; name: string; lines: QuoteLine[]; status?: string }) {
  const quoteId = await create("Quote", {
    Name: opts.name, OpportunityId: opts.opportunityId, Pricebook2Id: opts.pricebookId, Status: opts.status ?? "Draft",
  });
  for (const l of opts.lines) {
    await create("QuoteLineItem", {
      QuoteId: quoteId, PricebookEntryId: l.pricebookEntryId, Quantity: l.quantity, UnitPrice: l.unitPrice,
      ...(l.discount != null ? { Discount: l.discount } : {}),
    });
  }
  const [q] = await query(`SELECT Id, Name, TotalPrice FROM Quote WHERE Id = '${quoteId}'`);
  return { quoteId, total: q?.TotalPrice ?? 0, url: recordUrl(quoteId) };
}
