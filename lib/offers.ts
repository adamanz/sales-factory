// Offer (order form) configs: which Salesforce Quotes to show on a shareable page.
// The page renders LIVE from Salesforce — we only store the quote ids + presentation.
export type OfferOption = { quoteId: string; label?: string; recommended?: boolean };
export type OfferConfig = { headline?: string; account?: string; notes?: string; options: OfferOption[] };
const mem = new Map<string, OfferConfig>();
export const offers = {
  put: (id: string, cfg: OfferConfig) => void mem.set(id, cfg),
  get: (id: string) => mem.get(id),
};
