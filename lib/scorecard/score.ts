import { anthropicJudge, formatTranscript, scorecardModel } from "./judge";
import { computeMetrics, heuristicHandling, heuristicNextStep, snippet } from "./metrics";
import { parseTranscript } from "./parse";
import { loadRubric } from "./rubric";
import type {
  CoachingFix, ComponentKey, Evidence, Handling, Judge, JudgeOutput, Metrics, Rubric, Scorecard, ScorecardConfig, Source, Turn,
} from "./types";

export type ScoreOptions = {
  rubric?: Rubric;
  /** undefined = use Anthropic when ANTHROPIC_API_KEY is set; null = deterministic only. */
  judge?: Judge | null;
  rep?: string[];
  account?: string;
};

export function defaultJudge(): Judge | null {
  return process.env.ANTHROPIC_API_KEY ? anthropicJudge() : null;
}

export async function scoreCall(input: unknown, opts: ScoreOptions = {}): Promise<Scorecard> {
  const parsed = parseTranscript(input);
  const { turns } = parsed;
  if (!turns.length) throw new Error("transcript has no speaker turns");
  if (new Set(turns.map((t) => t.speaker)).size < 2) throw new Error("transcript needs at least two speakers");

  const rubric = opts.rubric ?? loadRubric();
  const account = opts.account ?? parsed.account ?? null;
  const metrics = computeMetrics(turns, rubric.config, opts.rep ?? parsed.rep);
  const judge = opts.judge === undefined ? defaultJudge() : opts.judge;

  let verdict: JudgeOutput | null = null;
  let llmError: string | undefined;
  if (judge) {
    try {
      verdict = await judge({ transcript: formatTranscript(turns), metrics, rubric, account: account ?? undefined });
    } catch (e: any) {
      llmError = String(e?.message || e);
    }
  }

  const verifier = quoteVerifier(turns);
  return assemble({ turns, metrics, rubric, verdict, verifier, account, llmError, judged: Boolean(judge) });
}

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/…$/, "").replace(/[^a-z0-9']+/g, " ").trim();

export function quoteVerifier(turns: Turn[]) {
  const haystack = ` ${norm(turns.map((t) => t.text).join(" "))} `;
  return (quote: string | null | undefined) => {
    const q = quote ? norm(quote) : "";
    return q.length >= 3 && haystack.includes(` ${q} `);
  };
}

const clampRating = (n: unknown) => Math.min(5, Math.max(1, Math.round(Number(n) || 1)));
const toPct = (avg1to5: number) => Math.round(((avg1to5 - 1) / 4) * 100);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const HANDLING = new Set<Handling>(["addressed", "partial", "ignored"]);
const YES_NO = /^(do|does|did|is|are|was|were|can|could|would|will|have|has|should)\b/i;

type AssembleArgs = {
  turns: Turn[]; metrics: Metrics; rubric: Rubric; verdict: JudgeOutput | null; verifier: (q: string | null | undefined) => boolean;
  account: string | null; llmError?: string; judged: boolean;
};

function assemble({ turns, metrics, rubric, verdict, verifier, account, llmError, judged }: AssembleArgs): Scorecard {
  const cfg = rubric.config;
  let droppedQuotes = 0;

  const qRatings = new Map((verdict?.questionRatings ?? []).map((r) => [r.id, r]));
  const questions = metrics.discoveryQuestions.map((q) => {
    const r = qRatings.get(q.id);
    return { ...q, rating: r ? clampRating(r.rating) : null, ...(r?.note ? { note: r.note } : {}) };
  });
  const rated = questions.flatMap((q) => (q.rating === null ? [] : [q.rating]));
  const llmQuality = rated.length ? mean(rated) : null;
  const openCount = questions.filter((q) => q.open).length;
  const qualitySource: Source = llmQuality !== null ? "llm" : "heuristic";
  const qualityPct = llmQuality !== null ? toPct(llmQuality) : questions.length ? Math.round((openCount / questions.length) * 100) : 0;
  const countPct = Math.min(1, questions.length / cfg.discovery.targetQuestions) * 100;
  const discovery = questions.length ? Math.round(0.5 * countPct + 0.5 * qualityPct) : 0;

  const oVerdicts = new Map((verdict?.objections ?? []).map((v) => [v.id, v]));
  const objectionItems = metrics.objections.flatMap((o) => {
    const v = oVerdicts.get(o.id);
    if (v && v.isObjection === false) return [];
    if (v && HANDLING.has(v.handling)) {
      return [{ ...o, handling: v.handling, rating: clampRating(v.rating), ...(v.note ? { note: v.note } : {}), source: "llm" as Source }];
    }
    return [{ ...o, ...heuristicHandling(o, turns, metrics, cfg), source: "heuristic" as Source }];
  });
  const objAvg = mean(objectionItems.map((o) => o.rating));
  const objectionHandling = objAvg === null ? cfg.noObjectionsScore : toPct(objAvg);

  const fallbackNext = heuristicNextStep(turns, metrics);
  let nextStep: Scorecard["nextStep"];
  if (verdict?.nextStep) {
    const ok = verifier(verdict.nextStep.quote);
    if (verdict.nextStep.quote && !ok) droppedQuotes++;
    nextStep = {
      agreed: Boolean(verdict.nextStep.agreed),
      quote: ok ? verdict.nextStep.quote : fallbackNext.quote,
      owner: verdict.nextStep.owner ?? null,
      when: verdict.nextStep.when ?? null,
      source: "llm",
    };
  } else {
    nextStep = { ...fallbackNext, source: "heuristic" };
  }
  const anchored = Boolean(nextStep.when) || metrics.nextStepCandidates.some((c) => c.quote === nextStep.quote && c.timeAnchored);
  const nextStepScore = nextStep.agreed ? (anchored ? 100 : 60) : metrics.nextStepCandidates.length ? 20 : 0;

  const { repIdealMinPct: lo, repIdealMaxPct: hi, pointsPerPctOutside } = cfg.talkRatio;
  const outside = metrics.repTalkPct > hi ? metrics.repTalkPct - hi : metrics.repTalkPct < lo ? lo - metrics.repTalkPct : 0;
  const talkBalance = Math.max(0, Math.round(100 - outside * pointsPerPctOutside));

  const craftIds = new Set(cfg.craftCriteria);
  const craft = verdict?.craft?.filter((c) => craftIds.has(c.id)).map((c) => ({ ...c, rating: clampRating(c.rating) })) ?? null;
  const craftAvg = craft?.length ? mean(craft.map((c) => c.rating)) : null;
  const callCraft = craftAvg === null ? null : toPct(craftAvg);

  const components: Record<ComponentKey, number | null> = {
    talkBalance, discovery, objectionHandling, nextStep: nextStepScore, callCraft,
  };
  const overallScore = weightedScore(components, cfg.weights);

  const llmFixes: CoachingFix[] = [];
  for (const f of verdict?.fixes ?? []) {
    const ev = (f.evidence ?? []).filter((e) => {
      const ok = verifier(e.quote);
      if (!ok) droppedQuotes++;
      return ok;
    });
    if (ev.length && f.title && f.tryInstead) llmFixes.push({ title: f.title, why: f.why, tryInstead: f.tryInstead, evidence: ev, source: "llm" });
  }
  const coachingFixes = [...llmFixes, ...heuristicFixes(components, cfg, metrics, objectionItems, turns)]
    .filter((f, i, all) => all.findIndex((g) => g.title === f.title) === i)
    .slice(0, 2);

  return {
    account,
    rep: metrics.repSpeakers,
    overallScore,
    components,
    talk: { basis: metrics.basis, repTalkPct: metrics.repTalkPct, idealBandPct: [lo, hi], speakers: metrics.speakers, longestRepMonologue: metrics.longestRepMonologue },
    discovery: { count: questions.length, openCount, avgQuality: llmQuality === null ? null : Math.round(llmQuality * 10) / 10, qualitySource, questions },
    objections: { count: objectionItems.length, items: objectionItems },
    mentions: {
      competitors: [...new Set(metrics.competitorMentions.map((m) => m.term).filter((t) => cfg.competitors.some((c) => c.toLowerCase() === t.toLowerCase())))],
      competitorMentions: metrics.competitorMentions,
      pricingMentions: metrics.pricingMentions,
    },
    nextStep,
    callCraft: craft,
    coachingFixes,
    summary: verdict?.summary ?? null,
    llm: { used: Boolean(verdict), model: judged ? scorecardModel() : null, ...(llmError ? { error: llmError } : {}), droppedQuotes },
  };
}

export function weightedScore(components: Record<ComponentKey, number | null>, weights: Record<ComponentKey, number>): number {
  let num = 0;
  let den = 0;
  for (const key of Object.keys(weights) as ComponentKey[]) {
    const v = components[key];
    if (v === null || v === undefined) continue;
    num += v * weights[key];
    den += weights[key];
  }
  return den ? Math.round(num / den) : 0;
}

function heuristicFixes(
  components: Record<ComponentKey, number | null>,
  cfg: ScorecardConfig,
  metrics: Metrics,
  objections: Scorecard["objections"]["items"],
  turns: Turn[],
): CoachingFix[] {
  const { weights, talkRatio: band } = cfg;
  const fixes: { gap: number; fix: CoachingFix }[] = [];
  const add = (key: ComponentKey, fix: Omit<CoachingFix, "source"> | null) => {
    const score = components[key];
    if (fix && score !== null && score < 100 && fix.evidence.length) fixes.push({ gap: (100 - score) * weights[key], fix: { ...fix, source: "heuristic" } });
  };
  const repEvidence = (t: { quote: string } | null): Evidence[] => (t ? [{ quote: t.quote, speaker: metrics.repSpeakers[0] }] : []);

  const tooMuch = metrics.repTalkPct > band.repIdealMaxPct;
  add("talkBalance", {
    title: tooMuch ? "Talk less, ask more" : "Take more control of the conversation",
    why: `Rep talked ${metrics.repTalkPct}% of the call; the target band is ${band.repIdealMinPct}-${band.repIdealMaxPct}%.`,
    tryInstead: tooMuch
      ? "Cap each turn at about three sentences, then hand it back: \"What would that change for your team?\""
      : "Recap what you heard and steer: \"So the blocker is X. Can I show you how teams handle that?\"",
    evidence: repEvidence(metrics.longestRepMonologue),
  });

  const closed = metrics.discoveryQuestions.find((q) => !q.open && YES_NO.test(q.text));
  add("discovery", {
    title: "Ask more open discovery questions",
    why: `${metrics.discoveryQuestions.length} discovery question(s), ${metrics.discoveryQuestions.filter((q) => q.open).length} open; target is ${cfg.discovery.targetQuestions}, mostly open, on pain, impact, and process.`,
    tryInstead: "\"Walk me through what happens today when that goes wrong, and who feels it most?\"",
    evidence: repEvidence(closed ? { quote: closed.text } : metrics.longestRepMonologue),
  });

  const worst = [...objections].sort((a, b) => a.rating - b.rating)[0];
  const handlingWhy: Record<Handling, string> = {
    ignored: "The rep moved past the concern without responding to it.",
    partial: "The rep answered, but didn't acknowledge and clarify the concern first.",
    addressed: "Handled, but the rep never confirmed the concern was resolved.",
  };
  if (worst && worst.rating <= 4) {
    const ev: Evidence[] = [{ quote: worst.quote, speaker: worst.speaker }];
    if (worst.repResponse) ev.push({ quote: snippet(worst.repResponse, 25), speaker: metrics.repSpeakers[0] });
    add("objectionHandling", {
      title: `Clarify the ${worst.category.replace("_", " ")} objection before answering`,
      why: handlingWhy[worst.handling],
      tryInstead: "Acknowledge, ask, then answer: \"That's fair. When you say that, what's driving it? ... Does that address it?\"",
      evidence: ev,
    });
  }

  const lastRep = [...turns].reverse().find((t) => metrics.repSpeakers.includes(t.speaker));
  add("nextStep", {
    title: "Close on a dated next step",
    why: "The call ended without the prospect committing to a specific action and time.",
    tryInstead: "\"Can we put 30 minutes on Thursday to walk your VP through it? I'll send the invite now.\"",
    evidence: repEvidence(lastRep ? { quote: snippet(lastRep.text, 25) } : null),
  });

  return fixes.sort((a, b) => b.gap - a.gap).map((f) => f.fix);
}
