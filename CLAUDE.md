# CLAUDE.md — Sales Factory

Guidance for Claude Code working in this repo. Read this first.

## What this is
A "sales factory" built for Claude Build Day on **Anthropic Managed Agents** (`claude-opus-4-8`).
A Recall.ai bot joins a sales call → a coordinator agent posts **live coaching** to Slack →
post-call, a **swarm** (quote / deck / order / research) creates real **Salesforce Quote line
items** (modern AI pricing: discounted seats + usage pool + FDE + premium support), a clickable
**HTML deck**, and a Slack **order form** — then self-verifies against `agents/pitch-rubric.md`.

Full brief: `PLAN.md`. Setup/demo: `README.md`.

## Architecture (one screen)
- **Relay** (this Next.js repo) is the ONLY self-hosted piece. It drives Managed Agents sessions,
  executes the Salesforce custom tool host-side, and hosts generated HTML artifacts at live URLs.
- **Managed Agents** runs the coordinator + 4 subagents (created ONCE; sessions per call). The
  agent does ALL Slack via the **Slack MCP** tool. Slack creds live in an Anthropic **vault**
  (`SLACK_VAULT_ID`), attached per session via `vault_ids`.
- **Salesforce** creds stay host-side (`.env.local`); the agent calls the `salesforce_op` custom
  tool and the relay executes it via `lib/salesforce.ts`. The container NEVER sees SF creds.

```
Recall.ai ─webhooks→ relay ─sessions/events→ Managed Agents (coordinator + swarm)
                       │ salesforce_op (host-side) → Salesforce REST
                       │ publish_artifact → hosts /api/deck|quote/[id]  ──URL──▶ agent posts via Slack MCP
```

## Status — ✅ END-TO-END WORKING
A single `POST /api/recall/replay` (scripted Acme call) produced, no human in the loop:
- **Live coaching** posted to Slack during the call (`slack_post`, bot token).
- **Two real Salesforce Quotes** the prospect asked for: *Lean* **$100k** (free seats + usage pool)
  and *Full* **$185k** (free seats + $100k usage + $60k FDE + $25k Premium Support), catalog-grounded,
  100%-seat-discount applied automatically.
- Provisioned + verified: SF org, Managed Agents (coordinator + quote/deck/order/research), the
  relay **consumer** (`salesforce_op` / `slack_post` / `publish_artifact` / `create_offer`).

Notes / fixed gotchas:
- Slack is via **bot token** through the relay (`SLACK_BOT_TOKEN`, `slack_post` tool) — NOT MCP
  (Slack MCP needed an OAuth token we couldn't mint in time; the vault path is parked).
- Consumer idle-gate: do NOT break on transient idles (null stop_reason between batches/subagent
  delegations) — only stop after a terminal `span.outcome_evaluation_end` or `session.status_terminated`.
- `user.custom_tool_result` field is `custom_tool_use_id` (not `tool_use_id`); echo `session_thread_id`
  for multiagent subagent tool calls.
- The dev server (background) can get reaped between steps — run the full test cycle as ONE background
  task (start server → replay → poll) rather than relying on a long-lived server across turns.

## Remaining work (polish)
1. **Offer page (`/api/of/[id]`)** — server-rendered HTML order form, **live from Salesforce** Quote
   data, recommended option highlighted, **Accept** button writes `Quote.Status=Accepted`. Agent calls
   `create_offer([quoteIds], recommended)` → link → `slack_post`. (Building now.)
2. Deck visuals pass; finish `e2e.ts` outcome-polling (second model-verifiable "done").
3. Record the 1-min demo video; optional Vercel deploy (replay is the demo spine).

## Key files
| Path | Role |
|---|---|
| `lib/salesforce.ts` | ★ org-verified REST + `createQuote`/`getCatalog`. Backs `salesforce_op`. |
| `lib/anthropic.ts` | Managed Agents session/event helpers (beta API — verify against installed SDK). |
| `lib/store.ts` · `transcript.ts` · `artifacts.ts` | per-bot state, transcript batching, HTML hosting. |
| `app/api/recall/replay/route.ts` | ★ demo spine — drives the full flow from a scripted call. |
| `app/api/recall/webhook/route.ts` | real Recall path (has TODOs: Slack thread/memory, start consumer). |
| `agents/sales-factory.agent.yaml` | coordinator: `salesforce_op` tool, Slack MCP, multiagent roster. |
| `agents/pitch-rubric.md` | ★ the model-graded definition of "done". |
| `scripts/fixtures/call-acme.json` | scripted multi-option demo call. |
| `scripts/e2e.ts` | the rerunnable "test suite" (needs outcome-polling finished). |

## Conventions & gotchas (don't relearn these the hard way)
- **Model is `claude-opus-4-8`** everywhere. Adaptive thinking only — never `budget_tokens`,
  `temperature`, `top_p`, or assistant prefills (all 400 on this model).
- **Slack is MCP-only.** The relay must NOT call the Slack Web API. The agent posts coaching,
  the order form, and the deck URL itself via the `slack` MCP tool. Don't reintroduce a bot token.
- **Salesforce token expires.** If SF calls 401, run `npm run refresh:sf` (rewrites the token in
  `.env.local` from the `sf` CLI session — org alias `a@simple.company.partner`).
- **SKU → PricebookEntry** mapping uses `SF_PBE_SEAT/USAGE/FDE/PREMIUM` from `.env.local`
  (or `get_catalog`). Never invent SKUs/prices — the rubric + e2e assert catalog membership.
- **The AI pricing motion:** seats get a `QuoteLineItem.Discount` (often 100 → $0); the usage
  pool (qty = $k blocks) drives the total. Verified: free seats + $120k usage → $120k Quote.
- **Managed Agents flow:** agents are created ONCE (`scripts/setup-agents.sh`); per call you only
  `sessions.create`. Open the event stream BEFORE sending the first message. Break the stream loop
  only on terminal `stop_reason` (not `requires_action`); dedupe via `events.list` on reconnect.
- **Demo spine is `/api/recall/replay`** — never let a live demo depend on a real meeting.
- **"Done" = grader `satisfied` AND `npm run e2e` green.** Both must pass.

## Commands
```bash
npm run dev                                            # relay on :3000
curl -XPOST localhost:3000/api/recall/replay -d '{"fixture":"call-acme"}'
npm run e2e                                            # assert real Quote + grounding
npm run refresh:sf                                     # refresh expired SF token
npm run setup:agents                                   # (re)create env + agents (writes IDs to .env.local)
```

## Never
- Commit `.env.local` or `slack-cred.json` (gitignored — keep it that way).
- Put Salesforce credentials in a vault or agent config (host-side custom tool only).
