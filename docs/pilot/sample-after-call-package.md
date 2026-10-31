# After-call package: Acme Pilot Co (synthetic)

> **SYNTHETIC — not a real customer.** Demo / fixture output only.

Generated: `2026-10-31T00:00:00.000Z` · Rep: Jordan (AE)

## Outbound guarantees

- Salesforce writes: **none** (preview diff only)
- Email sends: **none** (draft text only)
- External fetches: **none**

## Scorecard

```
*Call scorecard: Acme Pilot Co (synthetic)*  |  *78/100*

*Talk ratio* (words): Jordan (AE) 57% · Priya (Prospect) 43%  _(rep target 30-55%)_
*Discovery*: 4 questions (2 open)
*Objections*: 3 raised
• _risk_: "My VP, Marcus, wants a security review before anything goes live." → *addressed* (4/5)
• _price_: "Budget is tight this half." → *addressed* (4/5)
• _risk_: "Marcus will still want the security packet." → *partial* (3/5)
*Competitors*: Zendesk (1 mention)  ·  *Pricing mentions*: 4
*Next step agreed*: Yes (owner Priya (Prospect), when Friday)
> "Friday at 10am works. Send the invite to both of us."

*Top coaching fixes*
1. *Ask more open discovery questions*: 4 discovery question(s), 2 open; target is 6, mostly open, on pain, impact, and process.
> "Does funding from overtime address the budget concern for now?" (Jordan (AE))
   _Try:_ "Walk me through what happens today when that goes wrong, and who feels it most?"
2. *Clarify the risk objection before answering*: The rep answered, but didn't acknowledge and clarify the concern first.
> "Marcus will still want the security packet." (Priya (Prospect))
> "Then let's get him that. Can we book thirty minutes Friday at 10am with you and Marcus to review a pilot plan and the security…" (Jordan (AE))
   _Try:_ Acknowledge, ask, then answer: "That's fair. When you say that, what's driving it? ... Does that address it?"

_Components: talk 94 · discovery 58 · objections 67 · next step 100 · LLM off (heuristic judgments)_
```

## Proposed Salesforce updates (preview — do not apply automatically)

| Object | Field | Current | Proposed | Rationale |
| --- | --- | --- | --- | --- |
| Task | `Subject` | UNKNOWN | Call notes — Acme Pilot Co (synthetic) | Log a completed call activity from the transcript. |
| Task | `Description` | UNKNOWN | Next step: Friday at 10am works. Send the invite to both of us.
Objections: risk, price, risk | Capture call summary and agreed next step for CRM history. |
| Task | `Status` | UNKNOWN | Completed | Call already happened; activity should be closed. |
| Task | `ActivityDate` | UNKNOWN | UNKNOWN | Call date not present in transcript — leave for human review. |
| Task | `WhoId` | UNKNOWN | UNKNOWN | Contact Id requires a Salesforce lookup; never invent record IDs. |
| Task | `WhatId` | UNKNOWN | UNKNOWN | Opportunity Id requires a Salesforce lookup; never invent record IDs. |
| Opportunity | `StageName` | UNKNOWN | Qualification | Dated next step agreed on call — propose advancing into Qualification (human must confirm). |
| Opportunity | `NextStep` | UNKNOWN | Friday at 10am works. Send the invite to both of us. | Mirror the on-call next-step commitment into Opportunity.NextStep. |
| Opportunity | `CloseDate` | UNKNOWN | UNKNOWN | Close date was not stated on the call. |
| OpportunityContactRole | `Role` | UNKNOWN | Economic Buyer (proposed) | Prospect speaker "Priya (Prospect)" participated; role is a proposal only until verified in CRM. |
| OpportunityContactRole | `ContactId` | UNKNOWN | UNKNOWN | Contact Id requires Salesforce; never invent. |

## Follow-up email (preview — not sent)

- **To:** UNKNOWN
- **Cc:** UNKNOWN
- **Subject:** Follow-up: Acme Pilot Co (synthetic)

```
Hi —

Thanks for the conversation about Acme Pilot Co (synthetic).
As discussed, next step: Friday at 10am works. Send the invite to both of us.
(Internal note for rep — not for send: Ask more open discovery questions)

Best,
Jordan (AE)
```

## Next steps

| Action | Owner | Due | Evidence |
| --- | --- | --- | --- |
| Friday at 10am works. Send the invite to both of us. | Priya (Prospect) | Friday | Friday at 10am works. Send the invite to both of us. |

_LLM used: no (deterministic)_
