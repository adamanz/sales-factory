// SSE stream consumer: executes the agent's custom tools host-side and returns results.
// Without this the session idles forever and no Quote/deck/Slack post happens.
import { anthropic, sendCustomToolResult } from "./anthropic";
import * as sf from "./salesforce";
import { postMessage } from "./slack";
import { artifacts } from "./artifacts";
import { store } from "./store";

const PBE: Record<string, string | undefined> = {
  "SKU-SEAT": process.env.SF_PBE_SEAT, "SKU-USAGE": process.env.SF_PBE_USAGE,
  "SKU-FDE": process.env.SF_PBE_FDE, "SKU-PREMIUM": process.env.SF_PBE_PREMIUM,
};
let artifactSeq = 0;

async function salesforceOp(input: any) {
  switch (input.action) {
    case "get_catalog": return await sf.getCatalog();
    case "query": return await sf.query(input.soql);
    case "update_record": await sf.update(input.sobject, input.id, input.fields || {}); return { ok: true };
    case "create_quote": {
      const q = input.quote || {};
      const lines = (q.lines || []).map((l: any) => {
        const pbe = PBE[l.sku];
        if (!pbe) throw new Error(`unknown sku ${l.sku} (use SKU-SEAT/USAGE/FDE/PREMIUM)`);
        return { pricebookEntryId: pbe, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount };
      });
      return await sf.createQuote({
        opportunityId: process.env.SF_OPPORTUNITY_ID!, pricebookId: process.env.SF_PRICEBOOK_ID!,
        name: q.name || "Sales Factory Quote", lines,
      });
    }
    default: throw new Error(`unknown salesforce_op action: ${input.action}`);
  }
}

async function slackPost(input: any, sessionId: string) {
  const state = store.bySession(sessionId);
  const r = await postMessage({
    channel: input.channel || state?.channelId || process.env.SLACK_CHANNEL_ID!,
    text: input.text, blocks: input.blocks, thread_ts: input.thread_ts || state?.slackThreadTs,
  });
  if (r.ok && state && !state.slackThreadTs) store.patch(state.botId, { slackThreadTs: r.ts!, channelId: r.channel });
  return r;
}

function publishArtifact(input: any) {
  const kind = input.kind === "quote" ? "quote" : "deck";
  const id = input.id || `${kind}-${++artifactSeq}-${Date.now().toString(36)}`;
  artifacts.put(`${kind}:${id}`, String(input.html || ""));
  return { url: `${process.env.PUBLIC_BASE_URL || "http://localhost:3000"}/api/${kind}/${id}`, id };
}

export async function runConsumer(sessionId: string) {
  try {
    const stream: any = await (anthropic as any).beta.sessions.events.stream(sessionId);
    for await (const ev of stream) {
      if (ev.type === "agent.custom_tool_use") {
        let result: any;
        try {
          if (ev.name === "salesforce_op") result = await salesforceOp(ev.input);
          else if (ev.name === "slack_post") result = await slackPost(ev.input, sessionId);
          else if (ev.name === "publish_artifact") result = publishArtifact(ev.input);
          else result = { error: `unknown tool ${ev.name}` };
        } catch (e: any) { result = { error: String(e?.message || e) }; }
        await sendCustomToolResult(sessionId, ev.id, result, ev.session_thread_id);
        console.log(`[consumer] ${ev.name} ->`, JSON.stringify(result).slice(0, 200));
      } else if (ev.type === "span.outcome_evaluation_end") {
        console.log(`[consumer] outcome: ${ev.result} — ${String(ev.explanation || "").slice(0, 160)}`);
      } else if (ev.type === "session.status_terminated") {
        break;
      } else if (ev.type === "session.status_idle") {
        if (ev.stop_reason?.type !== "requires_action") break;
      }
    }
  } catch (e) { console.error("[consumer] error", e); }
}
