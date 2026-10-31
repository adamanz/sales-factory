# Rep Coaching Scorecard Rubric

Used by `lib/scorecard` to grade a finished sales call. Two parts:

1. The **config block** below is parsed by code. It sets weights, targets, and keyword lists for the
   deterministic metrics (talk ratio, question counts, objection/competitor/pricing detection).
2. Everything else in this file is sent to the LLM as grading guidance for the qualitative calls only:
   question quality, objection handling, whether a next step was really agreed, call craft, and the
   top two coaching fixes. The LLM never computes counts or the overall score; code does.

Edit freely. Change a weight or add a competitor in the JSON, or reword the guidance below, and the
next run picks it up. No code change needed. Keyword lists are case-insensitive literal phrases,
except `timeAnchors` and `repSpeakerPattern`, which are regexes. Objection categories are checked in
the order listed; the first match wins. `handlingCues` only drive the no-LLM fallback.

## Config

```json scorecard-config
{
  "weights": {
    "talkBalance": 15,
    "discovery": 25,
    "objectionHandling": 20,
    "nextStep": 20,
    "callCraft": 20
  },
  "talkRatio": { "repIdealMinPct": 30, "repIdealMaxPct": 55, "pointsPerPctOutside": 3 },
  "discovery": { "targetQuestions": 6 },
  "noObjectionsScore": 80,
  "craftCriteria": ["value_articulation", "active_listening", "call_structure"],
  "repSpeakerPattern": "\\b(rep|ae|seller|sales|account exec(utive)?)\\b",
  "competitors": [
    "Glean", "Gong", "Chorus", "Clari", "Outreach", "Salesloft", "HubSpot",
    "Microsoft Copilot", "Copilot", "ChatGPT", "OpenAI", "Gemini", "Zendesk", "Intercom"
  ],
  "competitorCues": ["evaluating", "looking at", "compared to", "versus", "vs.", "alternative", "other vendors", "a couple others"],
  "pricingTerms": ["price", "pricing", "cost", "budget", "discount", "per-seat", "per seat", "quote", "contract", "license", "fee", "invoice", "spend"],
  "objectionPatterns": {
    "price": ["price", "expensive", "too much", "can't justify", "cannot justify", "costly", "pricey", "tight", "no budget", "over budget"],
    "status_quo": ["already use", "already have", "happy with", "works fine", "it does the job"],
    "timing": ["not a priority", "not until", "bad time", "not right now", "too busy", "revisit later"],
    "authority": ["run it by", "need approval", "not my call", "check with my"],
    "need": ["not sure we need", "don't need", "don't see the need", "nice to have"],
    "risk": ["security", "compliance", "worried", "worry", "concern", "risk", "skeptical", "legal", "procurement"]
  },
  "handlingCues": {
    "acknowledge": ["fair", "understand", "makes sense", "good question", "great question", "thanks for", "hear you", "that's painful"],
    "confirm": ["does that address", "does that answer", "does that help", "is there more", "did that cover"],
    "pivot": ["anyway", "moving on", "the other cool thing", "but first", "everyone asks that"]
  },
  "nextStepPatterns": [
    "next step", "follow up", "follow-up", "send you", "send over", "send me", "schedule", "calendar",
    "invite", "book", "meet again", "demo", "trial", "pilot", "loop in", "intro", "get you"
  ],
  "timeAnchors": [
    "monday", "tuesday", "wednesday", "thursday", "friday", "tomorrow", "today", "next week",
    "this week", "end of", "eod", "by the", "on the \\d", "\\d{1,2}(:\\d{2})?\\s?(am|pm)"
  ]
}
```

## Grading guidance (sent to the LLM)

You are a sales coach grading one finished call. Code already found the candidates below and gives
each an id. Judge only what you are asked. Every quote you return must be copied **verbatim** from the
transcript; code checks this and drops any quote it can't find.

### Question quality (rate each discovery question 1-5)
- **5**: Open, specific, uncovers pain, impact, process, or decision criteria ("Walk me through how
  tickets get escalated today").
- **3**: Relevant but closed or generic ("Do you use a CRM?").
- **1**: Leading, a pitch dressed as a question, or a check-in ("Wouldn't it be great if…?",
  "Make sense?").

### Objection handling (for each candidate objection)
- First decide if it's a real objection (concern, pushback, or blocker). Mark `isObjection: false` for
  false positives like "no concerns there".
- `handling`: `addressed` (acknowledged, clarified, responded with substance, ideally confirmed it
  landed), `partial` (responded but skipped clarifying or confirming), `ignored` (talked past it,
  argued, or changed subject).
- Rate 1-5. A 5 means the rep acknowledged it, asked a clarifying question, answered with evidence or
  options, and checked that the prospect was satisfied.

### Next step
- `agreed: true` only when the **prospect** accepted a concrete action. "I'll send something over"
  from the rep with no buy-in from the prospect is not agreed.
- Return the single best verbatim quote, the owner, and the date or time if one was set.

### Call craft criteria (rate each 1-5)
- `value_articulation`: tied capabilities to the prospect's stated pain, not a feature tour.
- `active_listening`: built on what the prospect said, paraphrased, didn't interrupt with a pitch.
- `call_structure`: clear agenda, logical flow, kept to time, recapped before closing.

### Top 2 coaching fixes
- Pick the two changes that would most improve **this** rep's next call. Be concrete.
- Each fix needs 1-2 verbatim evidence quotes and a "try instead" line the rep could actually say.
- Prefer fixes tied to the lowest-scoring areas. No generic advice ("build more rapport").
