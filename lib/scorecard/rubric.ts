import fs from "node:fs";
import path from "node:path";
import type { Rubric, ScorecardConfig } from "./types";

export const DEFAULT_RUBRIC_PATH = path.join(process.cwd(), "agents", "scorecard-rubric.md");

const CONFIG_BLOCK = /```json scorecard-config\n([\s\S]*?)```/;

export function parseRubric(markdown: string): Rubric {
  const m = markdown.match(CONFIG_BLOCK);
  if (!m) throw new Error("scorecard rubric is missing its ```json scorecard-config block");
  const config = JSON.parse(m[1]) as ScorecardConfig;
  const guidanceStart = markdown.indexOf("## Grading guidance");
  const guidance = (guidanceStart >= 0 ? markdown.slice(guidanceStart) : markdown.replace(CONFIG_BLOCK, "")).trim();
  return { config, guidance };
}

export function loadRubric(file = process.env.SCORECARD_RUBRIC_PATH || DEFAULT_RUBRIC_PATH): Rubric {
  return parseRubric(fs.readFileSync(file, "utf8"));
}
