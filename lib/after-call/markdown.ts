import type { AfterCallPackage } from "./types";
import { UNKNOWN } from "./types";
import { toSlackMarkdown } from "../scorecard";

const esc = (s: string) => s.replace(/\|/g, "\\|");

export function toPackageMarkdown(pkg: AfterCallPackage): string {
  const lines: string[] = [];
  lines.push(`# After-call package${pkg.account ? `: ${pkg.account}` : ""}`);
  if (pkg.synthetic) lines.push("");
  if (pkg.synthetic) lines.push("> **SYNTHETIC — not a real customer.** Demo / fixture output only.");
  lines.push("");
  lines.push(`Generated: \`${pkg.generatedAt}\` · Rep: ${pkg.rep.join(", ") || UNKNOWN}`);
  lines.push("");
  lines.push("## Outbound guarantees");
  lines.push("");
  lines.push("- Salesforce writes: **none** (preview diff only)");
  lines.push("- Email sends: **none** (draft text only)");
  lines.push("- External fetches: **none**");
  lines.push("");

  lines.push("## Scorecard");
  lines.push("");
  lines.push("```");
  lines.push(toSlackMarkdown(pkg.scorecard));
  lines.push("```");
  lines.push("");

  lines.push("## Proposed Salesforce updates (preview — do not apply automatically)");
  lines.push("");
  lines.push("| Object | Field | Current | Proposed | Rationale |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const c of pkg.salesforcePreview.changes) {
    lines.push(
      `| ${c.object} | \`${c.field}\` | ${esc(String(c.current))} | ${esc(String(c.proposed))} | ${esc(c.rationale)} |`,
    );
  }
  lines.push("");

  lines.push("## Follow-up email (preview — not sent)");
  lines.push("");
  lines.push(`- **To:** ${pkg.followUpEmail.to}`);
  lines.push(`- **Cc:** ${pkg.followUpEmail.cc}`);
  lines.push(`- **Subject:** ${pkg.followUpEmail.subject}`);
  lines.push("");
  lines.push("```");
  lines.push(pkg.followUpEmail.body);
  lines.push("```");
  lines.push("");

  lines.push("## Next steps");
  lines.push("");
  lines.push("| Action | Owner | Due | Evidence |");
  lines.push("| --- | --- | --- | --- |");
  for (const n of pkg.nextSteps) {
    lines.push(
      `| ${esc(n.action)} | ${esc(String(n.owner))} | ${esc(String(n.dueDate))} | ${n.evidenceQuote ? esc(n.evidenceQuote) : "—"} |`,
    );
  }
  lines.push("");
  lines.push(`_LLM used: ${pkg.llm.used ? `yes (${pkg.llm.model})` : "no (deterministic)"}_`);
  return lines.join("\n");
}
