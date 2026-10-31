import type { Scorecard } from "./types";

// Slack mrkdwn (not CommonMark): *bold*, _italic_, > quotes, • bullets. Safe to paste or pass to
// chat.postMessage as `text`. This module only builds the string; nothing is sent.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const q = (s: string) => `> "${esc(s)}"`;

export function toSlackMarkdown(card: Scorecard): string {
  const lines: string[] = [];
  const title = card.account ? `Call scorecard: ${esc(card.account)}` : "Call scorecard";
  lines.push(`*${title}*  |  *${card.overallScore}/100*`);
  if (card.summary) lines.push(`_${esc(card.summary)}_`);
  lines.push("");

  const [lo, hi] = card.talk.idealBandPct;
  const split = card.talk.speakers.map((s) => `${esc(s.speaker)} ${Math.round(s.sharePct)}%`).join(" · ");
  lines.push(`*Talk ratio* (${card.talk.basis}): ${split}  _(rep target ${lo}-${hi}%)_`);

  const d = card.discovery;
  const quality = d.avgQuality === null ? "" : ` · quality ${d.avgQuality}/5`;
  lines.push(`*Discovery*: ${d.count} question${d.count === 1 ? "" : "s"} (${d.openCount} open)${quality}`);

  if (card.objections.count) {
    lines.push(`*Objections*: ${card.objections.count} raised`);
    for (const o of card.objections.items) {
      lines.push(`• _${o.category.replace("_", " ")}_: "${esc(o.quote)}" → *${o.handling}* (${o.rating}/5)`);
    }
  } else {
    lines.push("*Objections*: none raised");
  }

  const comps = card.mentions.competitors.length ? card.mentions.competitors.map(esc).join(", ") : "none named";
  lines.push(`*Competitors*: ${comps} (${card.mentions.competitorMentions.length} mention${card.mentions.competitorMentions.length === 1 ? "" : "s"})  ·  *Pricing mentions*: ${card.mentions.pricingMentions.length}`);

  const ns = card.nextStep;
  const nsMeta = [ns.owner && `owner ${esc(ns.owner)}`, ns.when && `when ${esc(ns.when)}`].filter(Boolean).join(", ");
  lines.push(`*Next step agreed*: ${ns.agreed ? "Yes" : "No"}${nsMeta ? ` (${nsMeta})` : ""}`);
  if (ns.quote) lines.push(q(ns.quote));
  lines.push("");

  lines.push("*Top coaching fixes*");
  card.coachingFixes.forEach((f, i) => {
    lines.push(`${i + 1}. *${esc(f.title)}*: ${esc(f.why)}`);
    for (const e of f.evidence) lines.push(`${q(e.quote)}${e.speaker ? ` (${esc(e.speaker)})` : ""}`);
    lines.push(`   _Try:_ ${esc(f.tryInstead)}`);
  });

  const c = card.components;
  const parts = [`talk ${c.talkBalance}`, `discovery ${c.discovery}`, `objections ${c.objectionHandling}`, `next step ${c.nextStep}`];
  if (c.callCraft !== null) parts.push(`craft ${c.callCraft}`);
  lines.push("");
  lines.push(`_Components: ${parts.join(" · ")}${card.llm.used ? "" : " · LLM off (heuristic judgments)"}_`);
  return lines.join("\n");
}
