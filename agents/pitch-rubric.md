# Pitch Deliverables Rubric

Grade ONLY from `tool_result` evidence in THIS session. If a criterion has no supporting tool
result, mark it FAILED. The outcome is DONE only when all required criteria pass.

## 1. Catalog grounding
- [ ] Every QuoteLineItem uses a real PricebookEntry from `get_catalog` (SKU-SEAT/USAGE/FDE/PREMIUM).
- [ ] UnitPrice matches the catalog list price (no invented SKUs or prices).

## 2. Modern AI pricing motion
- [ ] Seats (SKU-SEAT) are included with the negotiated Discount (e.g. 100% → $0), reflecting a land deal.
- [ ] A Usage Pool (SKU-USAGE) line is the primary revenue driver; quantity = committed $k blocks.
- [ ] FDE and/or Premium Support appear on the expansion option where the call warranted it.

## 3. Quote records in Salesforce
- [ ] >= 2 Quotes (one per option discussed) linked to the demo Opportunity, each with QuoteLineItems.
- [ ] Quote.TotalPrice rolls up correctly (free seats contribute $0; the usage pool drives the total).
- [ ] A RECOMMENDED option is identified with a one-line rationale.

## 4. Pitch deck (artifact)
- [ ] `publish_artifact(kind=deck)` returned a live URL — an HTML deck, one section per option, recommended highlighted.
- [ ] A competitor battlecard appendix is present (from the research subagent).

## 5. Shareable offer / order form
- [ ] `create_offer` returned an offer URL rendered live from the Salesforce Quotes, with an Accept button.
- [ ] The offer URL was `slack_post`ed to the call thread (record the returned message ts).

## Output
End with a report: each Quote id + total, the deck URL, the offer URL + Slack ts, and the
recommended option + net amount — each tied to a `tool_result` from this session.
