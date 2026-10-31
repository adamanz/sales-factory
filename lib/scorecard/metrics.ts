import type {
  Handling, Mention, Metrics, NextStepCandidate, ObjectionCandidate, ObjectionCategory, Question, ScorecardConfig, SpeakerStats, Turn,
} from "./types";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Literal phrase match that respects word edges even for terms like "vs." or "per-seat".
const literal = (terms: string[]) => new RegExp(`(?<![\\w])(${terms.map(escape).join("|")})(?![\\w])`, "i");
const pattern = (sources: string[]) => new RegExp(`(${sources.join("|")})`, "i");

const MONEY = /(\$\s?\d[\d,.]*\s?[km]?\b|\b\d[\d,.]*\s?(k|thousand|million)\b|\b(thousand|million) (dollars|a year|per year)\b)/i;
// Imperative prompts ("Walk me through...") are discovery questions even without a "?".
const PROMPT_START = /^(tell me|walk me|describe|explain|help me understand|talk me through)\b/i;
const OPEN_START = /^(what|how|why|which|tell me|walk me|describe|explain|help me understand|talk me through|in what way)\b/i;
const FILLER = /^(so|and|but|okay|ok|well|great|now|then|curious|totally fair|got it|right)[,\s]+/i;
const CHECK_IN = /\b(make sense|sounds? good|does that (work|address|answer|help)|any questions|you know what i mean)\b|\b(right|okay|ok|yeah)\?$/i;
const NEGATED_CONCERN = /\bno (real )?(concerns?|worries|issues|problems)\b/i;
const AFFIRM = /\b(yes|yeah|sure|works|sounds good|perfect|great|let's do|okay|ok|deal|send (it|me)|book it)\b/i;

export const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
export const sentences = (s: string) => s.split(/(?<=[.?!])\s+/).map((x) => x.trim()).filter(Boolean);
export function snippet(s: string, maxWords = 30) {
  const w = s.split(/\s+/).filter(Boolean);
  return w.length <= maxWords ? s.trim() : `${w.slice(0, maxWords).join(" ")}…`;
}

export function detectRepSpeakers(turns: Turn[], config: ScorecardConfig, explicit?: string[]): string[] {
  const names = [...new Set(turns.map((t) => t.speaker))];
  if (explicit?.length) {
    const want = new Set(explicit.map((n) => n.toLowerCase()));
    const hit = names.filter((n) => want.has(n.toLowerCase()));
    if (hit.length) return hit;
  }
  const re = new RegExp(config.repSpeakerPattern, "i");
  const byName = names.filter((n) => re.test(n));
  if (byName.length) return byName;
  return names.length ? [names[0]] : [];
}

const isQuestion = (s: string) => s.endsWith("?") || PROMPT_START.test(s);

export function isOpenQuestion(q: string): boolean {
  return q.split(/[—–;,]|\s-\s/).some((clause) => {
    let c = clause.trim();
    while (FILLER.test(c)) c = c.replace(FILLER, "");
    return OPEN_START.test(c);
  });
}

export function computeMetrics(turns: Turn[], config: ScorecardConfig, repOverride?: string[]): Metrics {
  const repSpeakers = detectRepSpeakers(turns, config, repOverride);
  const isRep = (s: string) => repSpeakers.includes(s);
  const timed = turns.length > 0 && turns.every((t) => t.start !== undefined && t.end !== undefined);

  const stats = new Map<string, SpeakerStats>();
  for (const t of turns) {
    const s = stats.get(t.speaker) ?? {
      speaker: t.speaker, role: isRep(t.speaker) ? "rep" : "prospect", words: 0, turns: 0, sharePct: 0, longestTurnWords: 0, questions: 0,
      ...(timed ? { seconds: 0 } : {}),
    } as SpeakerStats;
    const w = words(t.text);
    s.words += w;
    s.turns += 1;
    s.longestTurnWords = Math.max(s.longestTurnWords, w);
    s.questions += sentences(t.text).filter(isQuestion).length;
    if (timed) s.seconds = round1((s.seconds ?? 0) + Math.max(0, t.end! - t.start!));
    stats.set(t.speaker, s);
  }
  const speakers = [...stats.values()];
  const totalWords = speakers.reduce((a, s) => a + s.words, 0);
  const measure = (s: SpeakerStats) => (timed ? s.seconds ?? 0 : s.words);
  const total = speakers.reduce((a, s) => a + measure(s), 0);
  for (const s of speakers) s.sharePct = total ? round1((measure(s) / total) * 100) : 0;
  const repTalkPct = round1(speakers.filter((s) => s.role === "rep").reduce((a, s) => a + s.sharePct, 0));

  const repQuestions: Question[] = [];
  turns.forEach((t, i) => {
    if (!isRep(t.speaker)) return;
    for (const s of sentences(t.text)) {
      if (isQuestion(s)) repQuestions.push({ id: `Q${repQuestions.length + 1}`, turn: i, text: s, open: isOpenQuestion(s) });
    }
  });
  const nextRe = literal(config.nextStepPatterns);
  // Check-ins ("Does that work?") and closing asks ("Can we book Thursday?") aren't discovery.
  const discoveryQuestions = repQuestions.filter((q) => !CHECK_IN.test(q.text) && !nextRe.test(q.text));

  const objRes = (Object.entries(config.objectionPatterns) as [ObjectionCategory, string[]][]).map(([cat, terms]) => [cat, literal(terms)] as const);
  const objections: ObjectionCandidate[] = [];
  turns.forEach((t, i) => {
    if (isRep(t.speaker)) return;
    const seen = new Set<ObjectionCategory>();
    for (const s of sentences(t.text)) {
      if (NEGATED_CONCERN.test(s)) continue;
      const hit = objRes.find(([cat, re]) => !seen.has(cat) && re.test(s));
      if (!hit) continue;
      seen.add(hit[0]);
      const reply = turns.slice(i + 1, i + 3).find((r) => isRep(r.speaker));
      objections.push({ id: `O${objections.length + 1}`, turn: i, speaker: t.speaker, quote: s, category: hit[0], repResponse: reply?.text ?? null });
    }
  });

  const namedRe = literal(config.competitors);
  const cueRe = literal(config.competitorCues);
  const pricingRe = literal(config.pricingTerms);
  const competitorMentions: Mention[] = [];
  const pricingMentions: Mention[] = [];
  turns.forEach((t, i) => {
    for (const s of sentences(t.text)) {
      const named = s.match(namedRe) ?? s.match(cueRe);
      if (named) competitorMentions.push({ turn: i, speaker: t.speaker, term: named[1], quote: s });
      const price = s.match(MONEY) ?? s.match(pricingRe);
      if (price) pricingMentions.push({ turn: i, speaker: t.speaker, term: price[1], quote: s });
    }
  });

  // Turn-level so an acceptance like "Yes, Thursday at 2pm works. Send the invite." stays one quote.
  const timeRe = pattern(config.timeAnchors);
  const nextStepCandidates: NextStepCandidate[] = [];
  turns.forEach((t, i) => {
    const hits = sentences(t.text).filter((s) => nextRe.test(s));
    if (!hits.length) return;
    const when = t.text.match(timeRe)?.[0] ?? null;
    const quote = words(t.text) <= 40 ? t.text.trim() : hits.find((s) => timeRe.test(s)) ?? hits[0];
    nextStepCandidates.push({ id: `N${nextStepCandidates.length + 1}`, turn: i, speaker: t.speaker, quote, timeAnchored: when !== null, when });
  });

  let longestRepMonologue: Metrics["longestRepMonologue"] = null;
  turns.forEach((t, i) => {
    const w = words(t.text);
    if (isRep(t.speaker) && (!longestRepMonologue || w > longestRepMonologue.words)) longestRepMonologue = { turn: i, words: w, quote: snippet(t.text) };
  });

  return {
    totalWords, basis: timed ? "seconds" : "words", repSpeakers, speakers, repTalkPct,
    repQuestions, discoveryQuestions, objections, competitorMentions, pricingMentions, nextStepCandidates, longestRepMonologue,
  };
}

// Used when no LLM verdict is available: an anchored ask late in the call, with prospect buy-in.
export function heuristicNextStep(turns: Turn[], metrics: Metrics) {
  const tailStart = Math.floor(turns.length * 0.6);
  const isRep = (s: string) => metrics.repSpeakers.includes(s);
  const tail = metrics.nextStepCandidates.filter((c) => c.turn >= tailStart);
  const anchoredLatestFirst = [...tail].reverse().filter((c) => c.timeAnchored);
  const anchored = anchoredLatestFirst.find((c) => !isRep(c.speaker)) ?? anchoredLatestFirst[0];
  const prospectBuyIn = turns.some((t, i) => i >= tailStart && !isRep(t.speaker) && (AFFIRM.test(t.text) || tail.some((c) => c.turn === i)));
  const agreed = Boolean(anchored && (prospectBuyIn || !isRep(anchored.speaker)));
  const best = anchored ?? tail.at(-1) ?? null;
  return { agreed, quote: best?.quote ?? null, owner: best?.speaker ?? null, when: best?.when ?? null };
}

// No-LLM fallback for objection handling, driven by the rubric's handlingCues.
export function heuristicHandling(o: ObjectionCandidate, turns: Turn[], metrics: Metrics, config: ScorecardConfig): { handling: Handling; rating: number } {
  if (!o.repResponse) return { handling: "ignored", rating: 1 };
  const cues = config.handlingCues;
  if (literal(cues.pivot).test(o.repResponse)) return { handling: "ignored", rating: 1 };
  const acknowledged = literal(cues.acknowledge).test(o.repResponse);
  const clarified = o.repResponse.includes("?");
  if (!acknowledged || !clarified) return { handling: "partial", rating: acknowledged || clarified ? 3 : 2 };
  const later = turns.slice(o.turn + 1, o.turn + 5).filter((t) => metrics.repSpeakers.includes(t.speaker));
  const confirmed = later.some((t) => literal(cues.confirm).test(t.text));
  return { handling: "addressed", rating: confirmed ? 5 : 4 };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
