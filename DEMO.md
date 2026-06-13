# DEMO.md — Sales Factory live demo runbook

**Demo spine:** `POST /api/recall/replay` (the scripted Acme Robotics call). Never depend on a real meeting.
**Marquee proof:** two real Salesforce Quotes + the live-from-Salesforce offer page at `/api/of/demo` with a Recommended badge and an Accept button that writes `Quote.Status=Accepted` back to Salesforce — no human in the loop.

---
## 0. Pre-flight (do ALL of these, in order, right before recording/demoing)

```bash
# A. Dev server up and healthy (localhost is the source of truth)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health     # expect 200
#    if not 200:  npm run dev   (then re-check)

# B. Freeze the public URL. SIMPLEST for a screen-recorded demo: localhost.
#    Set PUBLIC_BASE_URL=http://localhost:3000 in .env.local so agent-posted links resolve.
#    (The trycloudflare quick tunnel is currently DEAD/530 — do not rely on it.)
grep PUBLIC_BASE_URL .env.local

# C. Refresh Salesforce token (it expires; a lapse 401s every quote/offer/Accept)
npm run refresh:sf

# D. Confirm the offer page renders LIVE from Salesforce (the centerpiece)
curl -s http://localhost:3000/api/of/demo | grep -c "Recommended"            # expect 1+
curl -s http://localhost:3000/api/of/demo | grep -o 'Accept [^<]*' | head -2 # expect 2 Accept CTAs

# E. Confirm the Slack bot can post (live-coaching segment depends on this)
npm run slack:test      # should post a message into #sales-bot
#    if it fails with not_in_channel: open #sales-bot in Slack and /invite the bot, retest.
```

If A–E all pass, you are go. The two clean quotes already on the Opportunity are:
- **Full (Land + Expand) — $185,000** (`0Q0am000002hzThCAI`) → gets the Recommended ribbon
- **Lean (Land) — $100,000** (`0Q0am000002hzS5CAI`)

---
## 1. Show the transcript + kick off the run (≈10s)

Have two browser tabs ready: **(T1)** Slack `#sales-bot`, **(T2)** `http://localhost:3000/api/of/demo`.

```bash
# Paced so coaching visibly tracks the conversation (NOT 120 — that floods in 1s)
curl -XPOST localhost:3000/api/recall/replay \
  -H 'content-type: application/json' \
  -d '{"fixture":"call-acme","speedMs":3500}'
```
The response returns a `sessionId` and a `console` link (platform.claude.com session viewer).

**Say:** "A Recall.ai bot is on a live sales call. Our coordinator agent — Opus 4.8 — is listening."

**FALLBACK:** If you don't want any live latency on stage, skip the POST entirely and go straight to Step 4 (`/api/of/demo` is already populated from the last clean run and rebuilds live from Salesforce).

---
## 2. Live coaching in Slack (≈15s) — Tab T1

Watch the `#sales-bot` thread: as the prospect raises the budget objection, the competitor (Glean), and the two-option request, the coordinator posts spaced coaching nudges in-thread.

**Say:** "It's coaching the rep in real time — catching the pricing objection, the Glean mention, the buying signal."

**FALLBACK:** If Slack posts are slow or the bot isn't in the channel, scroll to the PRIOR run's coaching thread already in `#sales-bot` (the messages persist). The demo does not depend on this run's posts landing.

---
## 3. The Salesforce Quotes (≈15s) — Salesforce tab (optional)

Open the Opportunity's Quotes, or the Lightning record for the Full quote:
`https://simpleco.my.salesforce.com/lightning/r/0Q0am000002hzThCAI/view`

Point at: **two** Quotes (Lean + Full), the **QuoteLineItems** — seats at **100% discount → $0**, **usage pool** as the dollar driver, plus **FDE** and **Premium Support** on the Full option.

**Say:** "Post-call, a swarm of subagents wrote REAL Salesforce quote line items — modern AI pricing: seats are free, usage drives the deal."

**FALLBACK:** Skip Salesforce and let the offer page (Step 4) tell the same story — it renders the exact line items live from those Quotes.

---
## 4. The offer page — the close (≈15s) — Tab T2

Refresh `http://localhost:3000/api/of/demo`. Show: two cards rendered **live from Salesforce**, the **$185,000 Full** option with the **Recommended** ribbon, seats shown as **$0**, and the **Accept** button.

Click **Accept** on the Full option. The page reloads with the green "🎉 locked in" banner.

**Say:** "This page is rendered live from Salesforce. The prospect clicks Accept — and that writes Quote.Status = Accepted straight back into Salesforce. The loop is closed."

**VERIFY (optional, for judges):** refresh the Salesforce quote — Status is now `Accepted`.

**FALLBACK:** If Accept 500s (token lapsed), run `npm run refresh:sf` in your spare terminal and refresh. If the page itself 404/500s, the env is stale — re-run pre-flight C+D. Worst case, show the Salesforce Quote records directly (Step 3) which are durable.

---
## 5. Done is model-verifiable (≈5s)

Show the grader verdict in the session console link from Step 1 (`satisfied`), and/or the test suite:

```bash
npm run e2e     # polls the session to outcome, asserts real Quote + lines + grounding + offer page; exit 0 = pass
```

**Say:** "Done isn't my opinion — the agent grades itself against a rubric, and a test suite asserts the real Salesforce records. Both must pass."

---
## Rerun on YOUR OWN call

Drop a transcript JSON in `scripts/fixtures/<name>.json` (same shape as `call-acme.json`), then:
```bash
curl -XPOST localhost:3000/api/recall/replay -d '{"fixture":"<name>","speedMs":3500}'
npm run e2e     # (parameterized form: npm run e2e -- <name>)
```
The rubric grades the agent's deliverables; e2e asserts the grounded Salesforce records. Another team can clone, set `.env.local` (SALESFORCE_*, SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, ANTHROPIC_API_KEY, SALES_FACTORY_AGENT_ID/ENV_ID, SF_PBE_*), and rerun.

---
## Failure-mode cheat sheet
| Symptom | Cause | Fix |
|---|---|---|
| Slack posts never appear | bot not in #sales-bot | `/invite` the bot, retest `npm run slack:test` |
| /api/of/demo 500 or "Offer not found" | SF token expired | `npm run refresh:sf`, refresh |
| Accept click does nothing | SF token expired (catch is silent) | `npm run refresh:sf`, re-click |
| Wrong/duplicate quotes on offer page | a partial replay re-run added orphans | don't re-run before demo; use the clean latest-2 ($185k + $100k) |
| Public link 404/530 | trycloudflare quick tunnel dead | use localhost for the demo, or re-freeze PUBLIC_BASE_URL |