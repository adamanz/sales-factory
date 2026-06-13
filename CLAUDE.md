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
  agent does ALL Slack via the host-side `slack_post` custom tool (bot token — see Conventions).
  The original Slack-MCP-over-vault (`SLACK_VAULT_ID`) path is parked: no OAuth token to mint.
- **Salesforce** creds stay host-side (`.env.local`); the agent calls the `salesforce_op` custom
  tool and the relay executes it via `lib/salesforce.ts`. The container NEVER sees SF creds.

```
Recall.ai ─webhooks→ relay ─sessions/events→ Managed Agents (coordinator + swarm)
                       │ salesforce_op    (host-side) → Salesforce REST
                       │ slack_post       (host-side) → Slack chat.postMessage (one thread / call)
                       │ publish_artifact → hosts /api/deck|quote/[id]  ──URL──▶ agent posts via slack_post
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

### Recall transcript — ✅ VERIFIED LIVE (2026-06-13)
Tested against a real Google Meet bot, full lifecycle: create bot → `in_waiting_room` → admit →
`in_call_recording` → `done` → **post-call transcript pulled** and printed real captions.
Tool: `npm run recall:test "<meetingUrl>"` (also `… transcript <botId>` / `… status <botId>`).
- **Recall API uses the new `recording_config` schema** (region `us-east-1`). The old
  `transcription_options` / `real_time_transcription` fields now return **400 "not allowed"**.
  Bot create body: `recording_config.transcript.provider.meeting_captions` +
  `recording_config.realtime_endpoints[{type:"webhook", url, events:["transcript.data","transcript.partial_data"]}]`.
- **Real-time events** are `transcript.data` (final) / `transcript.partial_data` (partial); speaker at
  `data.data.participant.name`, words at `data.data.words[].text`. `webhook/route.ts` parses these.
- **Post-call transcript** = GET `/api/v1/bot/{id}/` → `recordings[].media_shortcuts.transcript.data.download_url`
  (signed S3 URL, fetch without auth header) → `data.segments[]`.
- ⚠️ Real-time delivery to our webhook is **not yet verified** — it needs a live public tunnel
  (`PUBLIC_BASE_URL`); the trycloudflare quick-tunnel hostname goes stale on reconnect. Post-call path
  needs no tunnel. `meeting_captions` diarization is weak for a single speaker.

## Remaining work (polish)
1. **Offer page (`/api/of/[id]`)** — server-rendered HTML order form, **live from Salesforce** Quote
   data, recommended option highlighted, **Accept** button writes `Quote.Status=Accepted`. Agent calls
   `create_offer([quoteIds], recommended)` → link → `slack_post`. (Building now.)
2. Deck visuals pass; finish `e2e.ts` outcome-polling (second model-verifiable "done").
3. Record the 1-min demo video; deploy to Railway (see **Production / deploy**) — replay is the demo spine.

## Key files
| Path | Role |
|---|---|
| `lib/salesforce.ts` | ★ org-verified REST + `createQuote`/`getCatalog`. Backs `salesforce_op`. |
| `lib/anthropic.ts` | Managed Agents session/event helpers (beta API — verify against installed SDK). |
| `lib/store.ts` · `transcript.ts` · `artifacts.ts` | per-bot state, transcript batching, HTML hosting. |
| `lib/slack.ts` | `postMessage` → Slack `chat.postMessage` (bot token). Backs `slack_post`. |
| `lib/consumer.ts` | SSE consumer: runs `salesforce_op`/`slack_post`/`publish_artifact`/`create_offer`; `openCallThread` + `slackPost` enforce one thread/call. |
| `app/api/recall/replay/route.ts` | ★ demo spine — drives the full flow from a scripted call. |
| `app/api/recall/webhook/route.ts` | real Recall path (opens Slack thread + starts consumer; TODO: memory store). |
| `agents/sales-factory.agent.yaml` | coordinator: `salesforce_op` + `slack_post` tools, multiagent roster. |
| `agents/pitch-rubric.md` | ★ the model-graded definition of "done". |
| `scripts/fixtures/call-acme.json` | scripted multi-option demo call. |
| `scripts/e2e.ts` | the rerunnable "test suite" (needs outcome-polling finished). |
| `scripts/slack-test.ts` | `npm run slack:test` — Slack auth + one-thread post smoke test. |

## Conventions & gotchas (don't relearn these the hard way)
- **Model is `claude-opus-4-8`** everywhere. Adaptive thinking only — never `budget_tokens`,
  `temperature`, `top_p`, or assistant prefills (all 400 on this model).
- **Slack works — bot token via the relay, NOT MCP.** ✅ Verified. The agent calls the `slack_post`
  custom tool; the relay runs it in `lib/slack.ts` (`chat.postMessage`) with `SLACK_BOT_TOKEN`
  (`chat:write`, bot invited to `SLACK_CHANNEL_ID`). The MCP/vault path is parked (no OAuth token).
  Smoke-test the path standalone: `npm run slack:test` (auth.test + a real root + threaded replies).
- **One Slack thread per call.** Entry routes (`replay`/`webhook`) call `openCallThread(botId, …)`
  to post the call's root message and pin its `ts` in `store`. `slackPost` then forces
  `state.slackThreadTs` over any agent-supplied `thread_ts`, so the coordinator + every subagent
  reply into that one thread and can't start a second root. Thread `ts` lives in the in-memory
  `store` (per dev-server process) — swap `store` for KV if the relay ever runs multi-instance.
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
npm run slack:test                                     # Slack auth.test + a real one-thread post
npm run refresh:sf                                     # refresh expired SF token
npm run setup:agents                                   # (re)create env + agents (writes IDs to .env.local)
```

## Production / deploy (Railway)
**Host = Railway (persistent container).** This app is a **stateful, long-running server**: the
relay opens an SSE stream to Anthropic (`runConsumer`) that lives for *minutes* per call, and
`store`/`artifacts`/`offers` are **in-memory Maps** that the `/api/deck|quote|of/[id]` routes serve.
That rules out serverless: on **Vercel/Cloudflare** the consumer is frozen after the HTTP response
and in-memory artifacts aren't shared across instances (`/api/deck/[id]` returns empty) — they'd
need KV/Blob + a durable worker (hours of rework). Railway runs `next start` as one persistent
process, so it "just works" with zero code changes. **Single instance only** (`replicas=1`) — the
in-memory state can't shard; **state resets on every redeploy/restart**, so re-run a replay after deploy.

Build is verified clean: `npm run build` → Next 16 (Turbopack), TS passes, all routes present.

### Deploy steps
```bash
# 0. one-time: install/update the Railway CLI, then authenticate (interactive browser).
#    Installed via npm here (~/.npm-global/bin/railway). Verified on v5.12.1 (2026-06-13).
npm install -g @railway/cli@latest        # update; check with `railway --version`
railway login

# 1. create project + service (run from repo root)
railway init -n sales-factory

# 2. push env vars (Railway stores secrets — .env.local is NOT in the image/repo).
#    Set every server-side var from .env.local. Easiest: loop non-empty, non-comment lines:
while IFS= read -r l; do case "$l" in ''|\#*) ;; *) railway variables --set "$l";; esac; done < .env.local
#    NOTE: leave PUBLIC_BASE_URL out / set it AFTER step 4 (we don't know the domain yet).

# 3. deploy (uploads working dir, builds + starts remotely)
railway up

# 4. generate a public HTTPS domain
railway domain                       # prints https://<name>.up.railway.app

# 5. point the app at its own URL, then redeploy so it takes effect
railway variables --set "PUBLIC_BASE_URL=https://<name>.up.railway.app"
railway up

# 6. smoke-test the live URL
curl https://<name>.up.railway.app/api/health
curl -XPOST https://<name>.up.railway.app/api/recall/replay -d '{"fixture":"call-acme"}'
```

### After deploy — repoint the external webhooks at the Railway URL
- **Recall**: bot create sends `realtime_endpoints[].url = $PUBLIC_BASE_URL/api/recall/webhook`, so it
  follows `PUBLIC_BASE_URL` automatically — no dashboard change needed (kills the cloudflared tunnel).
- **Slack**: set the app's **Interactivity request URL** to `https://<name>.up.railway.app/api/slack/interactivity`
  (api.slack.com/apps → your app → Interactivity & Shortcuts) so the **Confirm/Accept** button works.

### Prod gotchas
- `next start` listens on `$PORT` (Railway injects it) — no `-p` flag needed.
- **SF token still expires** in prod — `salesforce_op` 401s mean the token in Railway vars is stale;
  refresh locally (`npm run refresh:sf`) and `railway variables --set "SALESFORCE_ACCESS_TOKEN=…"`.
- Agents are created ONCE and live in Anthropic (IDs in env) — deploying does NOT recreate them.
- A redeploy wipes in-memory `store`/`artifacts`/`offers`; old deck/quote/offer URLs 404 after a restart.

## Never
- Commit `.env.local` or `slack-cred.json` (gitignored — keep it that way).
- Put Salesforce credentials in a vault or agent config (host-side custom tool only).
