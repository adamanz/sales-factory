// SSE stream consumer: executes the agent's custom tools host-side and returns results.
// Without this the session idles forever and no Quote/deck/Slack post happens.
import { anthropic, sendCustomToolResult } from "./anthropic";
import * as sf from "./salesforce";
import { postMessage } from "./slack";
import { artifacts } from "./artifacts";
import { offers } from "./offers";
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

// Post the call's root Slack message and pin it as the one thread all later posts reply into.
// Call once per call (from the replay/webhook entry points) before the agent starts posting.
export async function openCallThread(botId: string, headline: string) {
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!channel) return { ok: false, error: "SLACK_CHANNEL_ID not set", ts: null };
  const r = await postMessage({ channel, text: headline });
  if (r.ok) store.patch(botId, { slackThreadTs: r.ts!, channelId: r.channel });
  return r;
}

async function slackPost(input: any, sessionId: string) {
  const state = store.bySession(sessionId);
  // Pin to the call's thread: every agent post (coordinator or subagent) replies into the same
  // root. state.slackThreadTs wins over any thread_ts the agent supplies so it can't start a 2nd thread.
  const r = await postMessage({
    channel: state?.channelId || input.channel || process.env.SLACK_CHANNEL_ID!,
    text: input.text, blocks: input.blocks, thread_ts: state?.slackThreadTs || input.thread_ts,
  });
  // Fallback: if no root was opened, the first post becomes the thread root.
  if (r.ok && state && !state.slackThreadTs) store.patch(state.botId, { slackThreadTs: r.ts!, channelId: r.channel });
  return r;
}

function publishArtifact(input: any) {
  const kind = input.kind === "quote" ? "quote" : "deck";
  const id = input.id || `${kind}-${++artifactSeq}-${Date.now().toString(36)}`;
  artifacts.put(`${kind}:${id}`, String(input.html || ""));
  return { url: `${process.env.PUBLIC_BASE_URL || "http://localhost:3000"}/api/${kind}/${id}`, id };
}

function createOffer(input: any) {
  const id = input.id || `of-${++artifactSeq}-${Date.now().toString(36)}`;
  offers.put(id, { headline: input.headline, account: input.account, notes: input.notes, options: input.options || [] });
  return { url: `${process.env.PUBLIC_BASE_URL || "http://localhost:3000"}/api/of/${id}`, id };
}

export async function runConsumer(sessionId: string) {
  // Stay alive through the whole call: handle every custom tool, and only stop once
  // the outcome has actually completed (or the session terminates). Do NOT break on
  // transient idles — the session idles repeatedly between transcript batches and
  // between subagent delegations, often with a null stop_reason.
  let outcomeDone = false;
  const TERMINAL = new Set(["satisfied", "failed", "max_iterations_reached"]);
  try {
    const stream: any = await (anthropic as any).beta.sessions.events.stream(sessionId);
    for await (const ev of stream) {
      if (ev.type === "agent.custom_tool_use") {
        let result: any;
        try {
          if (ev.name === "salesforce_op") result = await salesforceOp(ev.input);
          else if (ev.name === "slack_post") result = await slackPost(ev.input, sessionId);
          else if (ev.name === "publish_artifact") result = publishArtifact(ev.input);
          else if (ev.name === "create_offer") result = createOffer(ev.input);
          else result = { error: `unknown tool ${ev.name}` };
        } catch (e: any) { result = { error: String(e?.message || e) }; }
        await sendCustomToolResult(sessionId, ev.id, result, ev.session_thread_id);
        console.log(`[consumer] ${ev.name} ->`, JSON.stringify(result).slice(0, 200));
      } else if (ev.type === "span.outcome_evaluation_end") {
        if (TERMINAL.has(ev.result)) outcomeDone = true;
        console.log(`[consumer] outcome: ${ev.result} — ${String(ev.explanation || "").slice(0, 160)}`);
      } else if (ev.type === "session.status_terminated") {
        break;
      } else if (ev.type === "session.status_idle") {
        // Only stop once the outcome is done and the agent is genuinely waiting (not mid-tool).
        if (outcomeDone && ev.stop_reason?.type !== "requires_action") break;
      }
    }
  } catch (e) { console.error("[consumer] error", e); }
}
