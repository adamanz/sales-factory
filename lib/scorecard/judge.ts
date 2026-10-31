import Anthropic from "@anthropic-ai/sdk";
import type { Judge, JudgeInput, JudgeOutput, Turn } from "./types";

export const DEFAULT_MODEL = "claude-opus-4-8";
export const scorecardModel = () => process.env.SCORECARD_MODEL || DEFAULT_MODEL;

const TOOL_NAME = "submit_scorecard";

const rating = { type: "integer", minimum: 1, maximum: 5 };
const evidence = {
  type: "array", minItems: 1, maxItems: 2,
  items: { type: "object", properties: { quote: { type: "string" }, speaker: { type: "string" } }, required: ["quote"] },
};

export function judgeToolSchema(craftCriteria: string[]) {
  return {
    type: "object" as const,
    properties: {
      questionRatings: {
        type: "array",
        items: { type: "object", properties: { id: { type: "string" }, rating, note: { type: "string" } }, required: ["id", "rating"] },
      },
      objections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" }, isObjection: { type: "boolean" },
            handling: { type: "string", enum: ["addressed", "partial", "ignored"] }, rating, note: { type: "string" },
          },
          required: ["id", "isObjection", "handling", "rating"],
        },
      },
      nextStep: {
        type: "object",
        properties: {
          agreed: { type: "boolean" }, quote: { type: ["string", "null"] },
          owner: { type: ["string", "null"] }, when: { type: ["string", "null"] },
        },
        required: ["agreed", "quote"],
      },
      craft: {
        type: "array",
        items: { type: "object", properties: { id: { type: "string", enum: craftCriteria }, rating, note: { type: "string" } }, required: ["id", "rating"] },
      },
      fixes: {
        type: "array", minItems: 2, maxItems: 2,
        items: {
          type: "object",
          properties: { title: { type: "string" }, why: { type: "string" }, tryInstead: { type: "string" }, evidence },
          required: ["title", "why", "tryInstead", "evidence"],
        },
      },
      summary: { type: "string", description: "One or two sentences on how the call went." },
    },
    required: ["questionRatings", "objections", "nextStep", "craft", "fixes"],
  };
}

export const formatTranscript = (turns: Turn[]) => turns.map((t, i) => `[T${i}] ${t.speaker}: ${t.text}`).join("\n");

export function buildJudgePrompt({ transcript, metrics, rubric, account }: JudgeInput): { system: string; user: string } {
  const list = <T,>(items: T[], fmt: (x: T) => string) => (items.length ? items.map(fmt).join("\n") : "(none)");
  const user = [
    account ? `Account: ${account}` : null,
    `Rep speaker(s): ${metrics.repSpeakers.join(", ")}`,
    `Rep talk share: ${metrics.repTalkPct}% (by ${metrics.basis})`,
    "",
    "## Transcript",
    transcript,
    "",
    "## Discovery questions to rate",
    list(metrics.discoveryQuestions, (q) => `${q.id} [T${q.turn}] ${q.text}`),
    "",
    "## Candidate objections to judge",
    list(metrics.objections, (o) => `${o.id} [T${o.turn}] (${o.category}) ${o.speaker}: "${o.quote}"\n   Rep reply: ${o.repResponse ? `"${o.repResponse}"` : "(none)"}`),
    "",
    "## Next-step candidates",
    list(metrics.nextStepCandidates, (n) => `${n.id} [T${n.turn}] ${n.speaker}: "${n.quote}"`),
    "",
    `## Call craft criteria to rate: ${rubric.config.craftCriteria.join(", ")}`,
    "",
    `Call the ${TOOL_NAME} tool once with your verdicts. Quotes must be verbatim from the transcript (without the [T#] prefix).`,
  ].filter((l) => l !== null).join("\n");
  return { system: rubric.guidance, user };
}

type MessagesClient = { messages: { create: (body: any) => Promise<any> } };

export function anthropicJudge(opts: { client?: MessagesClient; model?: string } = {}): Judge {
  return async (input) => {
    const client = opts.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { system, user } = buildJudgePrompt(input);
    const res = await client.messages.create({
      model: opts.model ?? scorecardModel(),
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
      tools: [{ name: TOOL_NAME, description: "Submit qualitative scorecard verdicts.", input_schema: judgeToolSchema(input.rubric.config.craftCriteria) }],
      tool_choice: { type: "tool", name: TOOL_NAME },
    });
    const block = (res?.content ?? []).find((b: any) => b.type === "tool_use" && b.name === TOOL_NAME);
    if (!block) throw new Error(`judge returned no ${TOOL_NAME} call (stop_reason=${res?.stop_reason})`);
    return block.input as JudgeOutput;
  };
}
