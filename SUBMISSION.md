# Sales Factory — Submission Assets

## 60-second demo video script

SALES FACTORY — 60-SECOND SUBMISSION VIDEO (scene-by-scene)

[0:00–0:06]  ON SCREEN: Title card "Sales Factory" + subtitle "A swarm of Claude Opus 4.8 agents that closes deals." Then cut to a sales-call transcript (call-acme.json turns scrolling).
VO: "This is a live sales call. A Recall.ai bot is on it — and a Claude Opus 4.8 coordinator is listening."

[0:06–0:18]  ON SCREEN: Slack #sales-bot thread, coaching nudges appearing in real time as the transcript scrolls (budget objection -> "lead with free seats"; "Glean" -> battlecard nudge; two-option ask).
VO: "As the prospect pushes back on price and name-drops a competitor, the agent coaches the rep in real time — every objection, every buying signal — posted right into Slack."

[0:18–0:32]  ON SCREEN: Salesforce — the Opportunity with TWO Quotes; zoom into QuoteLineItems showing Seats at 100% discount = $0, a Usage Pool line, FDE, Premium Support.
VO: "The call ends — and a swarm of subagents takes over. They read the org's real catalog and write actual Salesforce quote line items, using a modern AI pricing motion: seats are free, the usage pool drives the deal, with an FDE and premium support on the expansion option."

[0:32–0:48]  ON SCREEN: /api/of/demo — two polished cards rendered live from Salesforce; $205,000 Full option with the green "Recommended" ribbon; seats shown as $0. Cursor clicks "Accept" -> page reloads with "🎉 locked in" banner.
VO: "It generates this offer page — rendered live from Salesforce — recommends the right option, and posts the link to Slack. The prospect clicks Accept… and that writes the quote to Accepted, straight back into Salesforce. No human in the loop."

[0:48–0:58]  ON SCREEN: split — left: the session grader showing "satisfied"; right: terminal running `npm run e2e` with green checkmarks.
VO: "And 'done' isn't our opinion. The agent grades itself against a rubric, and a test suite asserts the real Salesforce records exist. Both have to pass — so any team can rerun it on any call."

[0:58–1:00]  ON SCREEN: Title card "Sales Factory — Opus 4.8 + Managed Agents + Salesforce" + github.com/adamanz/sales-factory.
VO: "Sales Factory. From conversation to closed — automatically."

---

## Round-2 intro slide

SALES FACTORY
A swarm of Claude Opus 4.8 agents that turns a live sales call into a closed deal.

Team: Adam Anzuoni
Stack: Anthropic Managed Agents (claude-opus-4-8) · Next.js relay · Salesforce · Recall.ai · Slack

One-liner:
A Recall.ai bot joins the call → Opus 4.8 coaches the rep LIVE in Slack → post-call a multiagent swarm writes REAL Salesforce quotes (free seats, usage-pool pricing, FDE + premium support), renders a live-from-Salesforce offer page, and the prospect's Accept writes Quote.Status=Accepted back to Salesforce — no human in the loop.

Remember these 3 things:
1. IMPACT — It does the real work: actual Salesforce Quote line items ($100k Lean + $205k Full) and a real Accept-to-close write-back. Not a mockup.
2. OPUS 4.8 ORCHESTRATION — A coordinator + 4 subagents (quote / deck / order / research) reason over the transcript and the org's live catalog to build the right deal.
3. VERIFIABLE DONE — The agent grades itself against a rubric AND a rerunnable test suite asserts the real Salesforce records — so any team can rerun it on any call.
