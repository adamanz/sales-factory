// After-call package CLI. Preview only — no Salesforce writes, no email sends.
//   npm run after-call -- scripts/fixtures/scorecard/synthetic-acme-pilot.json --no-llm
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { generateAfterCallPackage, toPackageMarkdown } from "../lib/after-call";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    rep: { type: "string", multiple: true },
    account: { type: "string" },
    format: { type: "string", default: "both" },
    "no-llm": { type: "boolean", default: false },
    "generated-at": { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

const USAGE = `usage: npm run after-call -- <transcript.json|.txt|-> [--rep NAME]... [--account NAME]
       [--format json|md|both] [--no-llm] [--generated-at ISO]`;

async function main() {
  const file = positionals[0];
  if (values.help || !file) {
    console.log(USAGE);
    process.exit(file ? 0 : 1);
  }
  const raw = file === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(file, "utf8");
  const pkg = await generateAfterCallPackage(raw, {
    judge: values["no-llm"] ? null : undefined,
    enricher: null, // deterministic package path; enricher reserved for future LLM drafts
    rep: values.rep,
    account: values.account,
    generatedAt: values["generated-at"],
  });
  if (!values["no-llm"] && !pkg.llm.used) {
    console.error(pkg.llm.error ? `LLM path failed, used heuristics: ${pkg.llm.error}` : "ANTHROPIC_API_KEY not set, used deterministic package.");
  }
  const md = toPackageMarkdown(pkg);
  if (values.format === "json") console.log(JSON.stringify(pkg, null, 2));
  else if (values.format === "md") console.log(md);
  else console.log(JSON.stringify({ package: pkg, markdown: md }, null, 2));
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
