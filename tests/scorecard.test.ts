import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  anthropicJudge, computeMetrics, loadRubric, parseTranscript, scoreCall, toSlackMarkdown,
  type Judge, type JudgeInput, type JudgeOutput,
} from "../lib/scorecard";
import { POST } from "../app/api/scorecard/route";

delete process.env.ANTHROPIC_API_KEY;
delete process.env.SCORECARD_API_TOKEN;

const fixture = (f: string) => fs.readFileSync(path.join(process.cwd(), "scripts", "fixtures", f), "utf8");
const NORTHWIND = fixture("scorecard/northwind-discovery.json");
const BRIGHTLINE = fixture("scorecard/brightline-pitch.txt");
const ACME = fixture("call-acme.json");
const rubric = loadRubric();

// Mock LLM: rates whatever candidates code found, picks real quotes, plus one fabricated quote
// that the scorer must drop.
function mockJudge(over: Partial<JudgeOutput> = {}, seen: JudgeInput[] = []): Judge {
  return async (input) => {
    seen.push(input);
    const m = input.metrics;
    const firstProspect = m.objections[0]?.quote ?? m.speakers.find((s) => s.role === "prospect")!.speaker;
    return {
      questionRatings: m.discoveryQuestions.map((q) => ({ id: q.id, rating: q.open ? 5 : 2 })),
      objections: m.objections.map((o) => ({ id: o.id, isObjection: true, handling: "partial", rating: 3 })),
      nextStep: { agreed: true, quote: m.nextStepCandidates.at(-1)?.quote ?? null, owner: m.repSpeakers[0], when: "Thursday 2pm" },
      craft: rubric.config.craftCriteria.map((id) => ({ id, rating: 4 })),
      fixes: [
        { title: "Confirm the objection is resolved", why: "Skipped the check.", tryInstead: "Ask: does that address it?", evidence: [{ quote: firstProspect }] },
        { title: "Invented fix", why: "x", tryInstead: "y", evidence: [{ quote: "We will give you a free pony with every seat." }] },
      ],
      summary: "Mocked summary.",
      ...over,
    };
  };
}

describe("parseTranscript", () => {
  test("plain text with timestamps and [Speaker] lines", () => {
    const { turns } = parseTranscript("[00:00:01] Rep: Hi there.\n[Prospect] Hello.\ncontinued line\nRep: Bye.");
    assert.deepEqual(turns.map((t) => t.speaker), ["Rep", "Prospect", "Rep"]);
    assert.equal(turns[1].text, "Hello. continued line");
  });

  test("Recall segments keep word timestamps and merge consecutive speaker turns", () => {
    const segs = [
      { participant: { name: "Ana" }, words: [{ text: "Hello", start_timestamp: { relative: 0 }, end_timestamp: { relative: 1 } }] },
      { participant: { name: "Ana" }, words: [{ text: "again", start_timestamp: { relative: 1 }, end_timestamp: { relative: 4 } }] },
      { participant: { name: "Ben" }, words: [{ text: "Hi", start_timestamp: { relative: 4 }, end_timestamp: { relative: 5 } }] },
    ];
    const { turns } = parseTranscript({ segments: segs });
    assert.deepEqual(turns, [
      { speaker: "Ana", text: "Hello again", start: 0, end: 4 },
      { speaker: "Ben", text: "Hi", start: 4, end: 5 },
    ]);
    const m = computeMetrics(turns, rubric.config, ["Ana"]);
    assert.equal(m.basis, "seconds");
    assert.equal(m.repTalkPct, 80);
  });

  test("JSON fixture carries account and rep", () => {
    const p = parseTranscript(NORTHWIND);
    assert.equal(p.account, "Northwind Logistics (synthetic)");
    assert.deepEqual(p.rep, ["Maya (AE)"]);
    assert.equal(p.turns.length, 17);
  });
});

describe("deterministic metrics", () => {
  test("talk shares sum to 100 and rep is detected by name", () => {
    for (const raw of [NORTHWIND, BRIGHTLINE, ACME]) {
      const p = parseTranscript(raw);
      const m = computeMetrics(p.turns, rubric.config, p.rep);
      const sum = m.speakers.reduce((a, s) => a + s.sharePct, 0);
      assert.ok(Math.abs(sum - 100) < 0.2, `shares sum to ${sum}`);
      assert.equal(m.repSpeakers.length, 1);
    }
  });

  test("brightline: rep dominates, closed questions, competitor + pricing found, security objection", () => {
    const p = parseTranscript(BRIGHTLINE);
    const m = computeMetrics(p.turns, rubric.config);
    assert.deepEqual(m.repSpeakers, ["Rep"]);
    assert.ok(m.repTalkPct > 75);
    assert.equal(m.discoveryQuestions.filter((q) => q.open).length, 0);
    assert.ok(m.competitorMentions.some((c) => c.term === "Outreach"));
    assert.ok(m.pricingMentions.some((x) => x.quote.includes("$120")));
    assert.ok(m.objections.some((o) => o.category === "risk" && o.quote.includes("security")));
  });

  test("northwind: check-ins and the closing ask are not discovery questions", () => {
    const p = parseTranscript(NORTHWIND);
    const m = computeMetrics(p.turns, rubric.config, p.rep);
    const texts = m.discoveryQuestions.map((q) => q.text);
    assert.ok(!texts.some((t) => t.includes("Does that work")));
    assert.ok(!texts.some((t) => t.includes("Can we book")));
    assert.ok(texts.some((t) => t.startsWith("Walk me through")));
    assert.ok(m.nextStepCandidates.some((c) => c.timeAnchored && c.quote.includes("Thursday")));
  });
});

describe("scoreCall without an LLM (heuristic judgments)", () => {
  test("strong discovery call outscores the pitch-heavy call", async () => {
    const strong = await scoreCall(NORTHWIND, { judge: null });
    const weak = await scoreCall(BRIGHTLINE, { judge: null });
    assert.equal(strong.llm.used, false);
    assert.equal(strong.components.callCraft, null);
    assert.ok(strong.overallScore >= 75, `strong=${strong.overallScore}`);
    assert.ok(weak.overallScore <= 40, `weak=${weak.overallScore}`);
    assert.equal(strong.nextStep.agreed, true);
    assert.match(strong.nextStep.quote ?? "", /Thursday at 2pm/);
    assert.equal(weak.nextStep.agreed, false);
    const security = weak.objections.items.find((o) => o.quote.includes("security"));
    assert.equal(security?.handling, "ignored");
  });

  test("always returns two fixes with evidence that appears in the transcript", async () => {
    for (const raw of [NORTHWIND, BRIGHTLINE, ACME]) {
      const card = await scoreCall(raw, { judge: null });
      assert.equal(card.coachingFixes.length, 2);
      const text = parseTranscript(raw).turns.map((t) => t.text).join(" ");
      for (const f of card.coachingFixes) {
        assert.ok(f.evidence.length >= 1);
        for (const e of f.evidence) assert.ok(text.includes(e.quote.replace(/…$/, "")), `quote not in transcript: ${e.quote}`);
      }
    }
  });
});

describe("scoreCall with a mocked LLM", () => {
  test("uses LLM verdicts, computes the overall score in code, drops fabricated quotes", async () => {
    const seen: JudgeInput[] = [];
    const card = await scoreCall(NORTHWIND, { judge: mockJudge({}, seen) });
    assert.equal(seen.length, 1);
    assert.match(seen[0].transcript, /^\[T0\] Maya \(AE\): /);
    assert.equal(card.llm.used, true);
    assert.equal(card.llm.droppedQuotes, 1);
    assert.equal(card.discovery.qualitySource, "llm");
    assert.equal(card.components.callCraft, 75);
    assert.ok(card.objections.items.every((o) => o.source === "llm" && o.handling === "partial"));
    assert.equal(card.objections.items.length > 0 && card.components.objectionHandling, 50);
    assert.equal(card.coachingFixes[0].title, "Confirm the objection is resolved");
    assert.equal(card.coachingFixes[0].source, "llm");
    assert.ok(!card.coachingFixes.some((f) => f.title === "Invented fix"));
    assert.equal(card.coachingFixes[1].source, "heuristic");
    const { weights } = rubric.config;
    const c = card.components;
    const expected = Math.round(
      (c.talkBalance! * weights.talkBalance + c.discovery! * weights.discovery + c.objectionHandling! * weights.objectionHandling +
        c.nextStep! * weights.nextStep + c.callCraft! * weights.callCraft) /
        (weights.talkBalance + weights.discovery + weights.objectionHandling + weights.nextStep + weights.callCraft),
    );
    assert.equal(card.overallScore, expected);
    assert.equal(card.summary, "Mocked summary.");
  });

  test("LLM can reject a false-positive objection and clamps out-of-range ratings", async () => {
    const p = parseTranscript(BRIGHTLINE);
    const m = computeMetrics(p.turns, rubric.config);
    const dropId = m.objections.find((o) => o.quote === "It does the job.")!.id;
    const card = await scoreCall(BRIGHTLINE, {
      judge: async (input) => ({
        ...(await mockJudge()(input)),
        objections: input.metrics.objections.map((o) => ({ id: o.id, isObjection: o.id !== dropId, handling: "ignored", rating: 99 })),
      }),
    });
    assert.ok(!card.objections.items.some((o) => o.id === dropId));
    assert.ok(card.objections.items.every((o) => o.rating === 5));
  });

  test("judge failure falls back to heuristics and reports the error", async () => {
    const card = await scoreCall(ACME, { judge: async () => { throw new Error("rate limited"); } });
    assert.equal(card.llm.used, false);
    assert.equal(card.llm.error, "rate limited");
    assert.equal(card.coachingFixes.length, 2);
  });

  test("rubric weight edits change the overall score", async () => {
    const heavyTalk = { ...rubric, config: { ...rubric.config, weights: { talkBalance: 100, discovery: 0, objectionHandling: 0, nextStep: 0, callCraft: 0 } } };
    const card = await scoreCall(BRIGHTLINE, { judge: null, rubric: heavyTalk });
    assert.equal(card.overallScore, card.components.talkBalance);
  });
});

test("anthropicJudge sends a forced tool call and parses tool_use input", async () => {
  const calls: any[] = [];
  const verdict = { questionRatings: [], objections: [], nextStep: { agreed: false, quote: null }, craft: [], fixes: [] };
  const client = { messages: { create: async (body: any) => { calls.push(body); return { content: [{ type: "tool_use", name: "submit_scorecard", input: verdict }] }; } } };
  const card = await scoreCall(ACME, { judge: anthropicJudge({ client, model: "test-model" }) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "test-model");
  assert.deepEqual(calls[0].tool_choice, { type: "tool", name: "submit_scorecard" });
  assert.equal(calls[0].temperature, undefined);
  assert.match(calls[0].system, /Grading guidance/);
  assert.match(calls[0].messages[0].content, /Candidate objections to judge/);
  assert.equal(card.llm.used, true);
  assert.equal(card.nextStep.agreed, false);
});

test("Slack markdown has every section", async () => {
  const md = toSlackMarkdown(await scoreCall(NORTHWIND, { judge: mockJudge() }));
  for (const s of ["*Call scorecard: Northwind", "/100*", "*Talk ratio*", "*Discovery*", "*Objections*", "*Competitors*", "*Next step agreed*: Yes", "*Top coaching fixes*", "1. *", "2. *"]) {
    assert.ok(md.includes(s), `missing ${s}`);
  }
});

describe("POST /api/scorecard", () => {
  const req = (body: string, type: string, url = "http://localhost/api/scorecard", headers: Record<string, string> = {}) =>
    new NextRequest(url, { method: "POST", body, headers: { "content-type": type, ...headers } });

  test("JSON body returns scorecard + markdown", async () => {
    const res = await POST(req(JSON.stringify({ transcript: JSON.parse(NORTHWIND), llm: false }), "application/json"));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.scorecard.account, "Northwind Logistics (synthetic)");
    assert.match(json.markdown, /\*Top coaching fixes\*/);
  });

  test("text/plain body with query params", async () => {
    const res = await POST(req(BRIGHTLINE, "text/plain", "http://localhost/api/scorecard?llm=false&account=Brightline"));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.scorecard.account, "Brightline");
    assert.equal(json.scorecard.llm.used, false);
  });

  test("rejects empty transcripts and enforces SCORECARD_API_TOKEN when set", async () => {
    assert.equal((await POST(req("{}", "application/json"))).status, 400);
    process.env.SCORECARD_API_TOKEN = "secret";
    try {
      assert.equal((await POST(req(BRIGHTLINE, "text/plain"))).status, 401);
      const ok = await POST(req(BRIGHTLINE, "text/plain", "http://localhost/api/scorecard?llm=false", { authorization: "Bearer secret" }));
      assert.equal(ok.status, 200);
    } finally {
      delete process.env.SCORECARD_API_TOKEN;
    }
  });
});
