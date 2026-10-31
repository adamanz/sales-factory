// Post-call rep coaching scorecard. Reads a transcript file (or stdin), prints JSON and/or Slack
// markdown to stdout. Sends nothing anywhere except the optional Anthropic call for judgments.
//   npm run scorecard -- scripts/fixtures/scorecard/northwind-discovery.json
//   npm run scorecard -- call.txt --rep "Maya" --no-llm --format md
//   cat call.json | npm run scorecard -- -
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { scoreCall, toSlackMarkdown, loadRubric } from "../lib/scorecard";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    rep: { type: "string", multiple: true },
    account: { type: "string" },
    rubric: { type: "string" },
    format: { type: "string", default: "both" },
    "no-llm": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const USAGE = `usage: npm run scorecard -- <transcript.json|.txt|-> [--rep NAME]... [--account NAME]
       [--rubric path.md] [--format json|md|both] [--no-llm]`;

async function main() {
  const file = positionals[0];
  if (values.help || !file) {
    console.log(USAGE);
    process.exit(file ? 0 : 1);
  }
  const raw = file === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(file, "utf8");
  const card = await scoreCall(raw, {
    rubric: values.rubric ? loadRubric(values.rubric) : undefined,
    judge: values["no-llm"] ? null : undefined,
    rep: values.rep,
    account: values.account,
  });
  if (!values["no-llm"] && !card.llm.used) {
    console.error(card.llm.error ? `LLM judge failed, used heuristics: ${card.llm.error}` : "ANTHROPIC_API_KEY not set, used heuristics for qualitative judgments.");
  }
  const md = toSlackMarkdown(card);
  if (values.format === "json") console.log(JSON.stringify(card, null, 2));
  else if (values.format === "md") console.log(md);
  else console.log(JSON.stringify({ scorecard: card, markdown: md }, null, 2));
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
