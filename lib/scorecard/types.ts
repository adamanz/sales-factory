import type { Turn } from "../recall";

export type { Turn };

export type ObjectionCategory = "price" | "status_quo" | "timing" | "authority" | "need" | "risk";
export type Handling = "addressed" | "partial" | "ignored";
export type Source = "llm" | "heuristic";

export type ScorecardConfig = {
  weights: Record<ComponentKey, number>;
  talkRatio: { repIdealMinPct: number; repIdealMaxPct: number; pointsPerPctOutside: number };
  discovery: { targetQuestions: number };
  noObjectionsScore: number;
  craftCriteria: string[];
  repSpeakerPattern: string;
  competitors: string[];
  competitorCues: string[];
  pricingTerms: string[];
  objectionPatterns: Record<ObjectionCategory, string[]>;
  handlingCues: { acknowledge: string[]; confirm: string[]; pivot: string[] };
  nextStepPatterns: string[];
  timeAnchors: string[];
};

export type Rubric = { config: ScorecardConfig; guidance: string };

export type ComponentKey = "talkBalance" | "discovery" | "objectionHandling" | "nextStep" | "callCraft";

export type SpeakerStats = {
  speaker: string;
  role: "rep" | "prospect";
  words: number;
  turns: number;
  sharePct: number;
  seconds?: number;
  longestTurnWords: number;
  questions: number;
};

export type Question = { id: string; turn: number; text: string; open: boolean };

export type ObjectionCandidate = {
  id: string;
  turn: number;
  speaker: string;
  quote: string;
  category: ObjectionCategory;
  repResponse: string | null;
};

export type Mention = { turn: number; speaker: string; term: string; quote: string };

export type NextStepCandidate = { id: string; turn: number; speaker: string; quote: string; timeAnchored: boolean; when: string | null };

export type Metrics = {
  totalWords: number;
  basis: "words" | "seconds";
  repSpeakers: string[];
  speakers: SpeakerStats[];
  repTalkPct: number;
  repQuestions: Question[];
  discoveryQuestions: Question[];
  objections: ObjectionCandidate[];
  competitorMentions: Mention[];
  pricingMentions: Mention[];
  nextStepCandidates: NextStepCandidate[];
  longestRepMonologue: { turn: number; words: number; quote: string } | null;
};

export type Evidence = { quote: string; speaker?: string };

export type CoachingFix = { title: string; why: string; tryInstead: string; evidence: Evidence[]; source: Source };

export type JudgeInput = { transcript: string; metrics: Metrics; rubric: Rubric; account?: string };

// Raw LLM verdicts, keyed by the candidate ids code assigned. Validated before use.
export type JudgeOutput = {
  questionRatings: { id: string; rating: number; note?: string }[];
  objections: { id: string; isObjection: boolean; handling: Handling; rating: number; note?: string }[];
  nextStep: { agreed: boolean; quote: string | null; owner?: string | null; when?: string | null };
  craft: { id: string; rating: number; note?: string }[];
  fixes: { title: string; why: string; tryInstead: string; evidence: Evidence[] }[];
  summary?: string;
};

export type Judge = (input: JudgeInput) => Promise<JudgeOutput>;

export type Scorecard = {
  account: string | null;
  rep: string[];
  overallScore: number;
  components: Record<ComponentKey, number | null>;
  talk: { basis: Metrics["basis"]; repTalkPct: number; idealBandPct: [number, number]; speakers: SpeakerStats[]; longestRepMonologue: Metrics["longestRepMonologue"] };
  discovery: {
    count: number;
    openCount: number;
    avgQuality: number | null;
    qualitySource: Source;
    questions: (Question & { rating: number | null; note?: string })[];
  };
  objections: {
    count: number;
    items: (ObjectionCandidate & { handling: Handling; rating: number; note?: string; source: Source })[];
  };
  mentions: { competitors: string[]; competitorMentions: Mention[]; pricingMentions: Mention[] };
  nextStep: { agreed: boolean; quote: string | null; owner: string | null; when: string | null; source: Source };
  callCraft: { id: string; rating: number; note?: string }[] | null;
  coachingFixes: CoachingFix[];
  summary: string | null;
  llm: { used: boolean; model: string | null; error?: string; droppedQuotes: number };
};
