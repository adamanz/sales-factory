// Managed Agents helpers: create session, send events, drive the post-call outcome.
// NOTE: beta API surface — verify method names against the installed SDK version.
import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MA_BETA = "managed-agents-2026-04-01";

export async function createCallSession(opts: { memoryStoreId?: string }) {
  const session = await anthropic.beta.sessions.create({
    agent: process.env.SALES_FACTORY_AGENT_ID!,
    environment_id: process.env.SALES_FACTORY_ENV_ID!,
    vault_ids: process.env.SLACK_VAULT_ID ? [process.env.SLACK_VAULT_ID] : [],
    resources: opts.memoryStoreId
      ? [{ type: "memory_store", memory_store_id: opts.memoryStoreId, access: "read_write",
           instructions: "Account history: prior objections, options/SKUs quoted, promises, stage." }]
      : [],
  } as any);
  return session;
}

export async function sendUserMessage(sessionId: string, text: string) {
  // During the live phase the agent emits custom tools (e.g. slack_post coaching), which puts the
  // session in requires_action — only a tool result may be sent until the consumer responds. A paced
  // transcript can race that window, so retry the user.message until the consumer clears it.
  for (let attempt = 0; ; attempt++) {
    try {
      await anthropic.beta.sessions.events.send(sessionId, {
        events: [{ type: "user.message", content: [{ type: "text", text }] }],
      } as any);
      return;
    } catch (e: any) {
      const msg = String(e?.message || e);
      const blocked = msg.includes("waiting on responses") || msg.includes("user.tool_confirmation");
      if (blocked && attempt < 30) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      throw e;
    }
  }
}

export async function defineOutcome(sessionId: string, description: string, rubricMd: string) {
  await anthropic.beta.sessions.events.send(sessionId, {
    events: [{ type: "user.define_outcome", description, rubric: { type: "text", content: rubricMd }, max_iterations: 5 }],
  } as any);
}

export async function sendCustomToolResult(sessionId: string, customToolUseId: string, result: unknown, sessionThreadId?: string | null) {
  await anthropic.beta.sessions.events.send(sessionId, {
    events: [{
      type: "user.custom_tool_result",
      custom_tool_use_id: customToolUseId,
      content: [{ type: "text", text: JSON.stringify(result) }],
      ...(sessionThreadId ? { session_thread_id: sessionThreadId } : {}),
    }],
  } as any);
}

export { MA_BETA };
