# 🏭 Sales Factory

Turn a live sales call into **real Salesforce quote line items, a clickable deck, and an order form** — built by a swarm of Claude agents that coach the rep live and then self-verify their work against a rubric.

Built for Claude Build Day on **Anthropic Managed Agents** (`claude-opus-4-8`).

## What it does
1. A **Recall.ai** bot auto-joins a sales call and streams the transcript.
2. A Claude **coordinator agent** posts **live coaching nudges** to a Slack thread (via Slack MCP) when it detects objections, pricing questions, competitor mentions, or buying signals.
3. At end of call, a **swarm of subagents** (quote / deck / order / research):
   - reads the org's real **product catalog** and creates a Salesforce **Quote + QuoteLineItems** using modern AI pricing — **discounted seats (often 100% → $0)**, a **usage pool** as the revenue driver, plus **FDE** and **premium support** expansion lines;
   - builds a self-contained **HTML deck** (one section per option, recommended highlighted), each option linking to its quote;
   - posts an interactive **order form** to Slack (Confirm closes the loop → Quote Accepted);
   - writes learnings to a per-account **memory store**.
4. It iterates until **its own grader** (`agents/pitch-rubric.md`) **and** `npm run e2e` both pass — done verified by the model, rerunnable on any transcript.

## Architecture
```
Recall.ai (calendar auto-join) ──webhooks──▶ RELAY (Next.js, this repo) ──▶ Managed Agents session
                                                  │                              │ Slack MCP (vault)
                                                  │ salesforce_op (host-side)    │ pptx-free HTML deck
                                                  ▼                              ▼
                                            Salesforce REST              Slack thread + deck/quote URLs
```
The relay is the **only** self-hosted piece. Slack creds live in an Anthropic **vault**; Salesforce creds stay host-side in the relay (the agent never sees them).

## Status — ✅ END-TO-END VERIFIED
A single `POST /api/recall/replay` of the scripted Acme call produced, with no human in the loop:
- **Live coaching** posted to Slack during the call (coordinator → `slack_post`).
- **Two real Salesforce Quotes** the prospect asked for, catalog-grounded:
  - *Lean* — **$100,000** (40 free seats @ 100% discount + $100k usage pool)
  - *Full (Land + Expand)* — **$185,000** (free seats + $100k usage + FDE $60k + Premium Support $25k)
- Quote line items use real `PricebookEntry` SKUs; the **discounted-seats / usage-pool AI motion** applied automatically.

Provisioned & working: Salesforce org (Quotes + AI-pricing catalog + demo Opportunity), Managed Agents
(coordinator + quote/deck/order/research subagents), the relay consumer (`salesforce_op` / `slack_post`
/ `publish_artifact`), Slack via bot token. Remaining polish: deck/order-form rendering pass, e2e
outcome-polling, optional Recall live path (replay is the demo spine).

## Setup
```bash
npm install
cp .env.example .env.local   # (already populated with the verified Salesforce values)

# 1. Anthropic key + CLI
export ANTHROPIC_API_KEY=sk-ant-...        # also put in .env.local
brew install anthropics/tap/ant            # one-time

# 2. Slack vault (fill slack-cred.json from your Slack MCP OAuth — see slack-cred.example.json)
SLACK_MCP_URL=https://<your-slack-mcp>/mcp  # add to .env.local
npm run setup:vault                         # → prints SLACK_VAULT_ID (add to .env.local)

# 3. Create environment + coordinator + subagents
npm run setup:agents                        # → prints SALES_FACTORY_ENV_ID + SALES_FACTORY_AGENT_ID (add to .env.local)

# 4. Run
npm run dev
curl -XPOST localhost:3000/api/recall/replay -d '{"fixture":"call-acme"}'   # the demo spine
npm run e2e                                  # asserts real Quote + lines + grounding
npm run refresh:sf                           # rewrite the SF token when it expires
```

## Repo layout
```
app/api/recall/{webhook,join,replay}   relay endpoints (transcript → session events)
app/api/slack/interactivity            order-form Confirm → SF
app/api/{deck,quote}/[id]              serve generated HTML artifacts
lib/salesforce.ts                      org-verified REST + Quote helpers (salesforce_op backend)
lib/anthropic.ts                       Managed Agents session/event helpers
lib/{store,transcript,artifacts}.ts    state, batching, artifact hosting
agents/*.agent.yaml                    coordinator + quote/deck/order/research
agents/pitch-rubric.md                 the model-graded definition of "done"
scripts/fixtures/call-acme.json        scripted multi-option demo call
scripts/{setup-agents,setup-vault}.sh  one-time provisioning
scripts/e2e.ts                         the rerunnable "test suite"
salesforce/                            DX project: QuoteSettings + seed/verify Apex
```

## Demo
`POST /api/recall/replay` plays the scripted Acme Robotics call (free seats + usage pool, then a fuller option with FDE + premium support). Watch coaching land in Slack live, then the Quote, deck URL, and order form appear — and the grader's `satisfied` verdict.
