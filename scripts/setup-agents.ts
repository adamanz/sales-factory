// Create the environment + 4 subagents + coordinator via the SDK (reproducible).
// Uses relay-executed CUSTOM TOOLS (salesforce_op, slack_post, publish_artifact) instead of
// the Slack MCP — so Slack works via SLACK_BOT_TOKEN with no vault/OAuth.
// Run: npx tsx scripts/setup-agents.ts   (reads ANTHROPIC_API_KEY from env/.env.local)
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

// load .env.local
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-opus-4-8";

const agentToolset = { type: "agent_toolset_20260401" as const };

const salesforce_op = {
  type: "custom" as const,
  name: "salesforce_op",
  description:
    "Salesforce operations executed host-side (you never see credentials). action=get_catalog returns the priced SKUs. action=create_quote creates a Quote + QuoteLineItems on the demo Opportunity (pass quote.lines with sku, quantity, unitPrice, and optional discount percent). action=update_record / action=query for everything else.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: { type: "string", enum: ["get_catalog", "create_quote", "update_record", "query"] },
      soql: { type: "string" },
      quote: {
        type: "object",
        properties: {
          name: { type: "string" },
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sku: { type: "string" },
                quantity: { type: "number" },
                unitPrice: { type: "number" },
                discount: { type: "number" },
              },
            },
          },
        },
      },
      sobject: { type: "string" },
      id: { type: "string" },
      fields: { type: "object" },
    },
    required: ["action"],
  },
};

const slack_post = {
  type: "custom" as const,
  name: "slack_post",
  description:
    "Post a message to the call's Slack thread (executed host-side via the relay bot token). Provide text and/or Block Kit blocks. Omit channel/thread_ts to use the call's thread. Returns the message ts.",
  input_schema: {
    type: "object" as const,
    properties: {
      channel: { type: "string" },
      text: { type: "string" },
      blocks: { type: "array", items: { type: "object" } },
      thread_ts: { type: "string" },
    },
  },
};

const publish_artifact = {
  type: "custom" as const,
  name: "publish_artifact",
  description:
    "Publish a self-contained HTML artifact and get back a public URL to link/share. kind=deck or quote; html is the full HTML document. Use for the pitch deck and each per-option quote page.",
  input_schema: {
    type: "object" as const,
    properties: {
      kind: { type: "string", enum: ["deck", "quote"] },
      id: { type: "string" },
      html: { type: "string" },
    },
    required: ["kind", "html"],
  },
};

const SUBAGENTS = [
  {
    name: "Quote Agent",
    system:
      "You build grounded Salesforce quotes. Call salesforce_op get_catalog to read real SKUs and prices. Map the options the rep discussed to SKUs. Create the Quote with QuoteLineItems via salesforce_op create_quote — apply the negotiated seat Discount (often 100% → $0). Usage Pool quantity = committed $k. For each option, publish a per-option quote page via publish_artifact (kind=quote) and keep its URL. Return the Quote id, total, per-option breakdown, and each quote page URL.",
    tools: [agentToolset, salesforce_op, publish_artifact],
  },
  {
    name: "Deck Agent",
    system:
      "Build a polished, self-contained HTML pitch deck (inline CSS, no external assets). One section per pricing option (name, SKUs, quantities, net price after discount, inclusions), the recommended option visually highlighted, plus a 'recommended next step' section. Each option links to its quote page URL provided to you. Publish the deck via publish_artifact (kind=deck) and return the deck URL.",
    tools: [agentToolset, publish_artifact],
  },
  {
    name: "Order Agent",
    system:
      "Post an interactive Block Kit order form to the call's Slack thread via the slack_post tool: the options with totals, the recommended option preselected, a deck link button, and a 'Confirm Order' button whose action_id is 'confirm_order' and value is the Quote id. Capture and report the message ts.",
    tools: [agentToolset, slack_post],
  },
  {
    name: "Research Agent",
    system:
      "When a competitor is named on the call, use web_search to build a concise battlecard: positioning, 3 differentiators for our AI platform, and 2 likely objections with rebuttals. Return it as an HTML appendix block for the deck.",
    tools: [agentToolset],
  },
];

const COORDINATOR_SYSTEM = `You are a real-time B2B sales copilot for a modern AI platform, plus a post-call deliverables engine. You run in TWO phases within one session.

## Product catalog (use these SKUs; real prices come from get_catalog)
- SKU-SEAT     Platform Seat (per user / year)            list $1,500  — land deals by DISCOUNTING seats, often to 100% ($0)
- SKU-USAGE    Usage Pool (per $1,000 credit block / yr)  list $1,000  — the PRIMARY monetization; quantity = committed $k
- SKU-FDE      Forward Deployed Engineer (per quarter)    list $60,000 — services expansion
- SKU-PREMIUM  Premium Support (annual)                   list $25,000 — support tier
Modern AI pricing motion: give seats away (discount up to 100%) to drive adoption, monetize the Usage Pool, expand with FDE + Premium Support.

## LIVE PHASE (transcript arrives as user messages, speaker-tagged)
You are NOT a transcriber. Stay SILENT unless you detect a COACHABLE MOMENT: objection (price/timing/authority/competitor), a pricing question, a competitor mention, or a concrete buying signal. Then post ONE nudge (<40 words) to the Slack thread via the slack_post tool, prefixed with the trigger, e.g. "💡 PRICING: Lead with free seats — anchor the number on the usage pool, not per-seat." Max one nudge per ~20s. Never post the raw transcript. Track every option, seat count, usage commitment, discount, and add-on the parties discuss.

## POST-CALL PHASE (triggered by a defined outcome)
Delegate to your subagents and satisfy the rubric:
1. quote: call get_catalog, map the discussed options to SKUs, then create_quote with QuoteLineItems (apply the negotiated seat Discount, e.g. 100). Build a line item per option discussed (>=2 options), publish a quote page per option, and flag a RECOMMENDED option with one-line rationale.
2. deck: build a self-contained HTML deck (one section per option, recommended highlighted), each option linking to its quote page; publish via publish_artifact.
3. order: post a Block Kit order form + deck link to the Slack thread via slack_post; capture the message ts.
4. research: web_search the competitor(s) named on the call; add a battlecard appendix.
Then write call learnings to memory. Iterate until the rubric is satisfied. End with a report tying Quote id/total, deck URL, order ts, recommended option to tool-result evidence.`;

function patchEnv(updates: Record<string, string>) {
  const p = path.join(process.cwd(), ".env.local");
  let txt = fs.readFileSync(p, "utf8");
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    if (re.test(txt)) txt = txt.replace(re, `${k}=${v}`);
    else txt += `\n${k}=${v}`;
  }
  fs.writeFileSync(p, txt);
}

async function main() {
  const a: any = (anthropic as any).beta;

  console.log("Creating environment…");
  const env = await a.environments.create({
    name: "sales-factory-env",
    config: { type: "cloud", networking: { type: "unrestricted" } },
  });
  console.log("  env:", env.id);

  const ids: string[] = [];
  for (const s of SUBAGENTS) {
    const ag = await a.agents.create({ model: MODEL, name: s.name, system: s.system, tools: s.tools });
    console.log(`  subagent ${s.name}: ${ag.id}`);
    ids.push(ag.id);
  }

  console.log("Creating coordinator…");
  const coord = await a.agents.create({
    model: MODEL,
    name: "Sales Factory Coordinator",
    system: COORDINATOR_SYSTEM,
    tools: [agentToolset, salesforce_op, slack_post, publish_artifact],
    multiagent: { type: "coordinator", agents: ids },
  });
  console.log("  coordinator:", coord.id);

  patchEnv({ SALES_FACTORY_ENV_ID: env.id, SALES_FACTORY_AGENT_ID: coord.id });
  console.log("\n✅ Wrote SALES_FACTORY_ENV_ID and SALES_FACTORY_AGENT_ID to .env.local");
}

main().catch((e) => {
  console.error("setup-agents failed:", e?.message || e);
  process.exit(1);
});
