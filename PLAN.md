# Sales Factory — Claude Build Day Plan

## Context

Claude Build Day (Jun 13, 2026; submit 5pm; public repo + live URL). Judged on **Impact (35%)**, **Demo (35%)**, **creative Opus 4.8 use (15%)**, **Orchestration (15% — "done" verifiable by the model via a rubric + test suite, rerunnable)**.

**The product / demo:** a "sales factory" that turns a live sales call into real CRM artifacts. In the demo, a mocked call is replayed where the rep floats **multiple pricing options**. A Recall.ai bot streams the transcript to a Claude agent that posts **live coaching nudges** to a Slack thread. At end of call a **swarm of subagents**: (1) reads the org's **real product catalog (Pricebook)**, maps the spoken options to actual **SKUs**, and **creates real `Quote` + `QuoteLineItem` records in Salesforce**; (2) builds an **HTML deck artifact** (one section per option, recommended highlighted, each linking to its quote) served at a **live URL**; (3) posts an **interactive order form + deck link** to Slack; (4) writes learnings to **per-account memory** — then self-verifies against a rubric until its grader and an **e2e test** both pass. Clicking **Confirm** closes the loop (Quote → accepted / Opportunity stage advanced).

**Why this shape (locked):** all-in **Managed Agents** (hosted loop + per-session container + MCP + Skills + Outcomes + **multiagent coordinator** + **memory**); **Recall.ai** transcript + **calendar auto-join** trigger; **Salesforce** with **catalog-grounded Quote line items**; deck as **HTML/Artifact**; model **`claude-opus-4-8`**. Only self-hosted piece is a thin **stateless relay** (Next.js/Vercel, TS).

**Hits two named problems** (multi-day back-office workflow; **"the swarm"**) and avoids all prohibited categories.

---

## Headline "win" moments (what judges remember)
1. **SKU intelligence:** spoken, messy options → grounded SKUs at real catalog prices (creative Opus 4.8).
2. **Real records:** open Salesforce live → a `Quote` with `QuoteLineItem`s the agent created.
3. **Clickable artifact:** an HTML deck at a live URL, each option linking to its quote.
4. **Self-verified done:** the model's own grader + a green e2e test, rerunnable on a new transcript.

---

## Architecture

```
Calendar event → Recall.ai auto-join → bot joins call
        │  HMAC webhooks (status_change | transcription | done)
        ▼
RELAY (Next.js/Vercel, stateless; state in Vercel KV by botId; hosts deck/quote pages)
        │ Anthropic SDK (sessions, events, files)     │ Slack Web API (thread + posts)   │ serves /deck /quote URLs
        ▼                                              ▼
ANTHROPIC ORCHESTRATION LAYER                      Slack thread (#sales-coach)
  LIVE: COORDINATOR (claude-opus-4-8)                   ▲ live nudges, order form, deck link
    tools: agent_toolset + slack MCP + salesforce_op
    memory: per-account store
  SESSION (per call): cloud env, vault_ids:[slack],
    resources:[{memory_store: account-XYZ}]; shared container
        │
        ▼ POST-CALL: define_outcome → coordinator fans out to subagent THREADS
        ├─ Quote agent  → SOQL pricebook → map options→SKUs → CREATE Quote + QuoteLineItems (salesforce_op)
        ├─ Deck agent   → HTML deck (section per option, recommended highlighted), links to quote pages
        ├─ Order agent  → Block Kit order form + deck URL → Slack
        └─ Research agent → web_search competitor battlecard → deck appendix
        │ agent.custom_tool_use(salesforce_op)        │ SSE stream
        ▼                                             ▼
  RELAY executes salesforce.ts → custom_tool_result   RELAY: forwards transcript, fires outcome,
        ▼                                             on satisfied → host deck HTML → post URL to Slack
  Salesforce REST (Quote, QuoteLineItem, Opportunity)
```

**Credential split:** Slack creds in an Anthropic **vault** (MCP, OAuth auto-refresh); **Salesforce creds host-side** in the relay (custom-tool pattern).

---

## Salesforce setup — ✅ DONE & VERIFIED in the `simple` org (`simpleco.my.salesforce.com`)
- **Quotes enabled** (metadata deploy). **Quote + QuoteLineItem create verified**, including a seat line at **100% discount → $0** with a usage pool → correct rollup.
- **Modern-AI-pricing catalog** seeded on the Standard Pricebook (`SF_PRICEBOOK_ID=01sfo000000McxtAAC`):
  | SKU | Name | List | Role in deal |
  |---|---|---|---|
  | SKU-SEAT | Platform Seat (per user / yr) | $1,500 | land via discount up to 100% (free seats) |
  | SKU-USAGE | Usage Pool (per $1k credit block / yr) | $1,000 | primary monetization; qty = committed $k |
  | SKU-FDE | Forward Deployed Engineer (per quarter) | $60,000 | services expansion |
  | SKU-PREMIUM | Premium Support (annual) | $25,000 | support tier |
- Demo **Account** "Acme Robotics" (`SF_ACCOUNT_ID`) + **Opportunity** "Acme Robotics - New Platform" (`SF_OPPORTUNITY_ID`, pricebook attached). All IDs + `SALESFORCE_ACCESS_TOKEN` + instance URL in `.env.local` (REST verified). `npm run refresh:sf` will rewrite the token.

---

## Components

### 1. Agents — created ONCE via `ant beta:agents create` from YAML; store IDs+versions in Vercel env
- **Coordinator** (`sales-factory.agent.yaml`): `model: claude-opus-4-8`; `multiagent:{type:coordinator, agents:[quote, deck, order, research]}`; `tools:[agent_toolset_20260401, mcp_toolset(slack), custom salesforce_op]`; `mcp_servers:[slack]`. (No pptx skill needed — deck is HTML.)
- **Subagents:** **Quote** (SOQL the pricebook, map options→SKUs, create `Quote` + `QuoteLineItem` via `salesforce_op`; return record ids + totals), **Deck** (write self-contained HTML deck to `/mnt/session/outputs/`, one section per option, recommended highlighted, each linking the option's quote page), **Order** (post Block Kit order form + deck URL to Slack), **Research** (`web_search` battlecard → deck appendix).
- **Two-phase coordinator system prompt:**
  - **LIVE:** receives speaker-tagged transcript batches + account memory. Track every pricing option/SKU/quantity the rep or prospect mentions. Stay **silent** unless a coachable moment (objection / pricing / competitor / buying signal); then one nudge (<40 words) via Slack MCP, max one / ~20s. Never post raw transcript.
  - **POST-CALL:** on the outcome, delegate in parallel — Quote agent first (catalog → SKUs → Quote+lines, returns ids/totals), then Deck (links quotes), Order (Slack), Research. Pick a **recommended** option with one-line rationale. Write learnings to memory. Iterate until rubric satisfied.
- **`salesforce_op` custom tool** (relay-executed via ported `salesforce.ts`): `action: query | create | update`; fields: `soql`, `sobject`, `records` (array for line items), `id`, `fields`. Supports: SOQL the `PricebookEntry`/`Product2` catalog; create `Quote` (OpportunityId, Pricebook2Id, Name, Status) then `QuoteLineItem`s (QuoteId, PricebookEntryId, Quantity, UnitPrice); update on Confirm. **Fallback:** if Quotes are unavailable, create `OpportunityLineItem`s instead (same SKU grounding, simpler object).

### 2. Cross-call memory
Per-account **memory store**; attach at session create `resources:[{type:"memory_store", memory_store_id, access:"read_write", instructions:"Account history: prior objections, options/SKUs quoted, promises, stage."}]`. Live phase reads to personalize coaching; post-call writes objections handled, SKUs quoted, recommended option, next step. Call #2 starts informed.

### 3. Relay endpoints (stateless; KV per `botId`: `{sessionId, slackThreadTs, channelId, sfOpportunityId, memoryStoreId, quoteIds, deckId}`)
- **`POST /api/recall/webhook`** — adapt `anam-recall-meet/.../recall/webhook/route.ts` (reuse `verifyWebhookSignature`):
  - `status_change` in-call → create Slack thread (`TalkCRM/convex/slack.ts`); resolve/create account memory store; `sessions.create({agent:{coordinator id,version}, environment_id, vault_ids:[SLACK_VAULT_ID], resources:[memory_store]})`; **open SSE stream first**, prime with SF Opportunity/Account context; write KV.
  - `transcription` → buffer per `botId`, flush batched speaker-tagged lines as one `user.message`; ack 200 fast.
  - `done` → `events.send({type:"user.define_outcome", description, rubric:{type:"text", content: PITCH_RUBRIC_MD}, max_iterations:5})`.
- **Stream consumer** (long-lived background worker, not in a request handler; stream-first, dedupe via `events.list`, idle-break only on terminal `stop_reason`; subagent tool calls cross-post to the session stream):
  - `agent.custom_tool_use` `salesforce_op` → run ported `salesforce.ts` (query/create/update) → `user.custom_tool_result` (return created ids + record URLs).
  - `span.outcome_evaluation_end` satisfied → `files.list({scope_id, betas:["managed-agents-2026-04-01"]})` (retry 1–3×) → download deck HTML → store under `deckId` → post **deck URL** + grader verdict to Slack.
- **`GET /api/deck/[id]`** + **`GET /api/quote/[id]`** — serve the hosted HTML artifacts (deck + per-option quote pages) at public URLs the deck links to.
- **`POST /api/slack/interactivity`** (closed loop) → "Confirm Order": `salesforce_op update` Quote.Status=Accepted (or advance Opportunity stage); reply in thread.
- **`POST /api/recall/join`** — reuse for manual trigger. **`POST /api/recall/replay`** — DEMO fallback (first-class): replays a scripted multi-option call through the identical session/event/outcome path. Deterministic, offline-safe.

### 4. Live-coaching latency strategy
Batch transcript (~15–20s / speaker-turn); silent-unless-coachable; short outputs; **Slack posts via MCP (non-blocking)**; relay round-trips reserved for Salesforce; ack Recall immediately (queue, don't block).

### 5. `pitch-rubric.md` (orchestration centerpiece)
- **Catalog grounding:** every quoted line item's `PricebookEntryId` exists in the org pricebook; `UnitPrice` matches the catalog (no invented SKUs/prices).
- **AI pricing motion (the differentiator):** the quote reflects modern AI pricing — **Seats** discounted (often 100% → $0 via `QuoteLineItem.Discount`) to land, a **Usage Pool** committed (quantity = $k blocks) as the primary $ driver, plus **FDE** and/or **Premium Support** as expansion lines where the call warrants. The agent applies the seat discount the prospect negotiated.
- **Quote records:** a `Quote` linked to the Opportunity exists with ≥1 `QuoteLineItem` per option discussed (≥2 options); a recommended option is flagged with one-line rationale, and `TotalPrice` rolls up correctly (verified: free seats + usage pool ⇒ usage-only total).
- **Deck (HTML):** deck file in `/mnt/session/outputs/`; one section per option (name/SKU/qty/price/inclusions); recommended highlighted; each option links to its quote page; competitor battlecard appendix.
- **Order form:** posted to the thread; returned confirmed `ts`; lists options + total + deck link + Confirm action.
- **Memory:** account memory updated with objections + SKUs quoted + recommended option + next step.
- **Output:** final report tying Quote id(s)/line-item ids, deck URL, order `ts`, recommended option+amount to tool-result evidence.

### 6. Order form (closed loop)
Block Kit interactive message via Slack MCP `chat.postMessage` (`thread_ts`) from `TalkCRM/convex/slackBlocks.ts` (header, fields per option, staticSelect, **Confirm Order** button, deck-link button). Confirm → `/api/slack/interactivity` sets Quote.Status=Accepted / advances stage. Returned `ts` satisfies the rubric.

### 7. Automated e2e test (`scripts/e2e.ts` — second model-verifiable "done")
Hits `/api/recall/replay` with a canned 2-option call, polls the session, then **asserts**: deck URL 200s with ≥2 option sections; each links a resolving quote page; a `Quote` + ≥2 `QuoteLineItem`s exist (SOQL) with SKUs/prices from the pricebook; order-form `ts` present; recommended option amount matches the deck; memory updated. Exit 0/1 → `npm run e2e`, rerunnable on a new transcript.

---

## Reusable code map
| Need | Source | Use |
|---|---|---|
| Recall bot create | `anam-recall-meet/src/app/api/recall/join/route.ts` | reuse |
| Recall webhook + HMAC | `anam-recall-meet/src/app/api/recall/webhook/route.ts` | adapt into relay |
| Salesforce REST/auth/SOQL/create | `TalkCRM/convex/salesforce.ts` | port into `salesforce_op` (direct token mode; add Quote/QuoteLineItem create) |
| Slack thread/post | `TalkCRM/convex/slack.ts` | thread + posts |
| Slack Block Kit | `TalkCRM/convex/slackBlocks.ts` | order form |

---

## Build order (7 hours)
0. **(pre)** SF org: enable Quotes, seed Pricebook + 3–4 Products, demo Opportunity/Account; grab access token + instance URL.
1. **(0:00–1:15)** Setup: coordinator + 4 subagent YAMLs, cloud env, Slack vault, account memory store; smoke-test session + Slack post. **Decide at 1:15:** Slack MCP flaky → relay-side Slack fallback; multiagent slow → collapse to single coordinator (sequential, same rubric); Quotes blocked → `OpportunityLineItem` fallback.
2. **(1:15–2:30)** Relay core + stream consumer: webhook, KV, session+memory creation, transcript batching, idle gate + dedupe.
3. **(2:30–4:00)** `salesforce_op`: SOQL pricebook → map options→SKUs → create `Quote` + `QuoteLineItem`s vs the sandbox; verify records appear in SF UI.
4. **(4:00–5:15)** Outcome + swarm + HTML deck: `define_outcome` + rubric; Deck agent HTML → relay hosts at `/api/deck/[id]`; quote pages at `/api/quote/[id]`; order form + deck URL to Slack; memory write. Iterate rubric to reliable `satisfied`.
5. **(5:15–6:30)** `/api/recall/replay` (scripted multi-option call) + `scripts/e2e.ts`; `/api/slack/interactivity` Confirm; deploy to Vercel; run e2e 3×. **(6:30–7:00)** public repo, README, backup recording.

**Mock for reliability:** the whole Recall meeting (replay). **Never mock** the grader, the SF Quote records, or the deck.

---

## Verification (done verified by the model, not a human)
1. Vercel URL + deck URL respond; `npm run e2e` / replay kicks the flow.
2. Slack thread shows live coaching nudges during replay.
3. **`span.outcome_evaluation_end` → `satisfied`** with per-criterion explanation (model grading itself vs `pitch-rubric.md`); verdict posted in thread.
4. **`scripts/e2e.ts` exits 0** — independent assertion of the same end state (the "test suite").
5. Open Salesforce live: a **`Quote` with `QuoteLineItem`s** the agent created, SKUs/prices from the pricebook.
6. Open the **HTML deck URL**: section per option, recommended highlighted, each linking to a resolving quote page.
7. Order-form message with real `ts`; Confirm advances the Quote/Opportunity live; account memory updated (call #2 starts informed).

Pitch line: *"The rep just talks options. The swarm reads the real catalog, builds real Salesforce quote line items, ships a clickable deck, and won't call it done until its own grader and our e2e test both pass — on any transcript."*

---

## Risks
| Risk | Mitigation |
|---|---|
| **Live demo on a real Recall meeting** (biggest) | `/api/recall/replay` drives the identical path from a scripted multi-option call — build first-class |
| **Quotes not enabled / Pricebook unseeded** | Step 0 prerequisite; `OpportunityLineItem` fallback if Quotes blocked |
| Wrong SKU mapping / hallucinated prices | Agent must SOQL the pricebook and use real `PricebookEntryId`/`UnitPrice`; rubric + e2e assert catalog membership |
| Multiagent setup time | Single-coordinator sequential path first; promote to swarm once green |
| Slack MCP OAuth/vault setup | Relay-side `slack.ts` fallback; decide at 1:15 |
| Vercel timeout kills multi-minute Outcome stream | Stream consumer = dedicated background worker |
| `files.list` index lag empty | Retry 1–3× |
