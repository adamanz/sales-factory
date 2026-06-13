// Offer (order form) configs: which Salesforce Quotes to show on a shareable page.
// The page renders LIVE from Salesforce — we only store the quote ids + presentation.
export type OfferOption = { quoteId: string; label?: string; recommended?: boolean };
export type OfferConfig = {
  headline?: string; account?: string; notes?: string; options: OfferOption[];
  // Call context stamped at creation so the stateless /api/of/[id]?accept= path can
  // reply into the right Slack thread and advance the right Opportunity.
  botId?: string; threadTs?: string; channelId?: string; opportunityId?: string;
};
const mem = new Map<string, OfferConfig>();
export const offers = {
  put: (id: string, cfg: OfferConfig) => void mem.set(id, cfg),
  get: (id: string) => mem.get(id),
};
