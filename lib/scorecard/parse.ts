import { segmentsToTurns } from "../recall";
import type { Turn } from "./types";

export type ParsedTranscript = { turns: Turn[]; account?: string; rep?: string[] };

// Accepts the formats we already see in this repo:
// - { account?, rep?, turns: [{ speaker, text }] }   (scripts/fixtures/call-acme.json)
// - Recall post-call segments, bare or under { segments } (lib/recall.ts)
// - plain text, one turn per line: "Speaker: text", "[Speaker] text", optional "[00:01:23]" prefix
export function parseTranscript(input: unknown): ParsedTranscript {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[{")) {
      try { return parseTranscript(JSON.parse(trimmed)); } catch { /* fall through to text */ }
    }
    return { turns: mergeTurns(parseText(trimmed)) };
  }
  if (Array.isArray(input)) return { turns: mergeTurns(arrayToTurns(input)) };
  if (input && typeof input === "object") {
    const o = input as Record<string, any>;
    const body = o.turns ?? o.segments ?? o.transcript ?? o.data?.segments;
    const parsed = body === undefined ? { turns: [] } : parseTranscript(body);
    const rep = typeof o.rep === "string" ? [o.rep] : Array.isArray(o.rep) ? o.rep.map(String) : undefined;
    return { ...parsed, account: typeof o.account === "string" ? o.account : undefined, rep };
  }
  return { turns: [] };
}

function arrayToTurns(arr: any[]): Turn[] {
  const isRecall = arr.some((s) => Array.isArray(s?.words) || s?.participant);
  if (isRecall) return segmentsToTurns(arr);
  return arr
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .map((t) => {
      const turn: Turn = { speaker: String(t.speaker ?? "Unknown").trim(), text: t.text.trim() };
      if (typeof t.start === "number" && typeof t.end === "number") Object.assign(turn, { start: t.start, end: t.end });
      return turn;
    });
}

const TIMESTAMP = /^\[?\(?\d{1,2}:\d{2}(:\d{2})?\]?\)?\s*/;
const BRACKET = /^\[([^\]]{1,40})\]\s*(.+)$/;
const COLON = /^([A-Za-z][\w .'()-]{0,39}?):\s+(.+)$/;

function parseText(text: string): Turn[] {
  const turns: Turn[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(TIMESTAMP, "");
    if (!line || line.startsWith("#")) continue;
    const m = line.match(BRACKET) ?? line.match(COLON);
    if (m) turns.push({ speaker: m[1].trim(), text: m[2].trim() });
    else if (turns.length) turns[turns.length - 1].text += ` ${line}`;
  }
  return turns;
}

// Captions often split one speaker's turn into several segments; scoring is per turn.
function mergeTurns(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of turns) {
    const prev = out[out.length - 1];
    if (prev && prev.speaker === t.speaker) {
      prev.text = `${prev.text} ${t.text}`;
      if (prev.end !== undefined && t.end !== undefined) prev.end = t.end;
      else { delete prev.start; delete prev.end; }
    } else out.push({ ...t });
  }
  return out;
}
