# Pitch Deliverables Rubric

DONE only when ALL criteria are verifiably met. Grade each independently against tool results.

## 1. Catalog grounding
- [ ] Every QuoteLineItem uses a real PricebookEntry from get_catalog (SKU-SEAT/USAGE/FDE/PREMIUM).
- [ ] UnitPrice matches the catalog list price (no invented SKUs or prices).

## 2. Modern AI pricing motion
- [ ] Seats (SKU-SEAT) are included with the negotiated Discount (e.g. 100% → $0) reflecting a land deal.
- [ ] A Usage Pool (SKU-USAGE) line is the primary revenue driver; quantity = committed $k blocks.
- [ ] FDE and/or Premium Support included where the call warranted expansion.

## 3. Quote records in Salesforce
- [ ] A Quote linked to the demo Opportunity exists with >= 1 QuoteLineItem per option discussed (>= 2 options).
- [ ] Quote.TotalPrice rolls up correctly (free seats contribute $0; usage pool drives the total).
- [ ] A RECOMMENDED option is identified with a one-line rationale.

## 4. HTML deck (artifact)
- [ ] deck.html written to /mnt/session/outputs/, one section per option, recommended highlighted.
- [ ] Each option links to its quote page; a competitor battlecard appendix is present.

## 5. Order form (Slack)
- [ ] An interactive order form was posted to the call's Slack thread with options, total, deck link, Confirm button.
- [ ] The post returned a confirmed Slack message ts (record it).

## 6. Memory
- [ ] Account memory updated with objections handled, options/SKUs quoted, recommended option, next step.

## Output
End with a report: Quote id + total, deck URL, order ts, recommended option + net amount — each tied to evidence.
