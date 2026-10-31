import { demoCalls } from "./seed";
import type {
  CoachingTip,
  DemoCall,
  DemoWorkspace,
  Nudge,
  NudgeTrigger,
  PeerId,
  PeerSource,
  Slot,
  Speaker,
  TipKind,
} from "./types";

export const PEER_FILES: Record<PeerId, string> = {
  deepgram: "data/peers/deepgram.json",
  nudges: "data/peers/nudges.json",
  slots: "data/peers/slots.json",
};

const TRIGGERS = new Set<NudgeTrigger>(["PRICING", "COMPETITOR", "BUYING_SIGNAL", "OBJECTION", "NEXT_STEP"]);
const KINDS = new Set<TipKind>(["pricing", "competitor", "discovery", "objection", "next_step", "monologue"]);
const SPEAKERS = new Set<Speaker>(["Rep", "Prospect"]);

const PEER_META: Record<PeerId, { label: string; sampleNote: string }> = {
  deepgram: {
    label: "Coaching tips",
    sampleNote: "Sample tips in the Deepgram coaching shape. No coaching module is read from here.",
  },
  nudges: {
    label: "Nudges",
    sampleNote: "Sample nudges. The nudge engine is not called.",
  },
  slots: {
    label: "Meeting times",
    sampleNote: "Sample times. Slot Finder is not called.",
  },
};

export type AssembleInput = {
  tips?: unknown;
  nudges?: unknown;
  slots?: unknown;
  modules?: Partial<Record<PeerId, boolean>>;
  fileNotes?: Partial<Record<PeerId, string>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function listFrom(value: unknown, key: string): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  const inner = value[key];
  return Array.isArray(inner) ? inner : null;
}

function callIds(): Set<string> {
  return new Set(demoCalls.map((call) => call.id));
}

function parseTips(value: unknown): CoachingTip[] | null {
  const list = listFrom(value, "tips");
  if (!list) return null;
  const ids = callIds();
  const tips: CoachingTip[] = [];
  for (const item of list) {
    if (!isRecord(item)) return null;
    const { id, callId, atSec, quote, tip, kind, speaker, startMs, endMs } = item;
    if (typeof id !== "string" || typeof callId !== "string" || !ids.has(callId)) return null;
    if (typeof atSec !== "number" || typeof quote !== "string" || typeof tip !== "string") return null;
    if (typeof kind !== "string" || !KINDS.has(kind as TipKind)) return null;
    if (typeof speaker !== "string" || !SPEAKERS.has(speaker as Speaker)) return null;
    const start = typeof startMs === "number" ? startMs : Math.round(atSec * 1000);
    const end = typeof endMs === "number" ? endMs : start + 8000;
    tips.push({
      id,
      callId,
      atSec,
      startMs: start,
      endMs: end,
      speaker: speaker as Speaker,
      quote,
      tip,
      kind: kind as TipKind,
    });
  }
  return tips;
}

function parseNudges(value: unknown): Nudge[] | null {
  const list = listFrom(value, "nudges");
  if (!list) return null;
  const ids = callIds();
  const nudges: Nudge[] = [];
  for (const item of list) {
    if (!isRecord(item)) return null;
    const { id, callId, atSec, trigger, text, evidence } = item;
    if (typeof id !== "string" || typeof callId !== "string" || !ids.has(callId)) return null;
    if (typeof atSec !== "number" || typeof text !== "string" || typeof evidence !== "string") return null;
    if (typeof trigger !== "string" || !TRIGGERS.has(trigger as NudgeTrigger)) return null;
    nudges.push({ id, callId, atSec, trigger: trigger as NudgeTrigger, text, evidence });
  }
  return nudges;
}

function parseSlots(value: unknown): Slot[] | null {
  const list = listFrom(value, "slots");
  if (!list) return null;
  const ids = callIds();
  const slots: Slot[] = [];
  for (const item of list) {
    if (!isRecord(item)) return null;
    const { id, callId, start, end, withWhom } = item;
    if (typeof id !== "string" || typeof callId !== "string" || !ids.has(callId)) return null;
    if (typeof start !== "string" || typeof end !== "string" || typeof withWhom !== "string") return null;
    if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return null;
    slots.push({ id, callId, start, end, withWhom });
  }
  return slots;
}

function applyByCall<T extends { callId: string }>(calls: DemoCall[], items: T[], key: "tips" | "nudges" | "slots"): DemoCall[] {
  const touched = new Set(items.map((item) => item.callId));
  return calls.map((call) => {
    if (!touched.has(call.id)) return call;
    return { ...call, [key]: items.filter((item) => item.callId === call.id) };
  });
}

function sourceFor(id: PeerId, mode: PeerSource["mode"], modules: AssembleInput["modules"], fileNote: string | undefined): PeerSource {
  const meta = PEER_META[id];
  const modulePresent = modules?.[id] === true;
  let note = mode === "peer-file" ? `Loaded from ${PEER_FILES[id]}.` : meta.sampleNote;
  if (fileNote) note = fileNote;
  if (modulePresent && mode === "sample" && !fileNote) {
    note = `${meta.sampleNote} A module file is in the repo. Add ${PEER_FILES[id]} to use its output. This loader does not import that module.`;
  }
  return { id, label: meta.label, mode, modulePresent, note };
}

export function assembleWorkspace(input: AssembleInput = {}): DemoWorkspace {
  let calls = demoCalls.map((call) => ({
    ...call,
    turns: [...call.turns],
    tips: [...call.tips],
    nudges: [...call.nudges],
    quotes: call.quotes.map((item) => ({ ...item, lines: item.lines.map((line) => ({ ...line })) })),
    slots: [...call.slots],
  }));

  const tips = input.tips === undefined ? null : parseTips(input.tips);
  const nudges = input.nudges === undefined ? null : parseNudges(input.nudges);
  const slots = input.slots === undefined ? null : parseSlots(input.slots);

  const notes: Partial<Record<PeerId, string>> = { ...input.fileNotes };
  if (input.tips !== undefined && !tips) notes.deepgram = `${PEER_FILES.deepgram} was ignored. The sample tips are still in use.`;
  if (input.nudges !== undefined && !nudges) notes.nudges = `${PEER_FILES.nudges} was ignored. The sample nudges are still in use.`;
  if (input.slots !== undefined && !slots) notes.slots = `${PEER_FILES.slots} was ignored. The sample times are still in use.`;

  const useTips = !!tips && tips.length > 0;
  const useNudges = !!nudges && nudges.length > 0;
  const useSlots = !!slots && slots.length > 0;
  if (useTips && tips) calls = applyByCall(calls, tips, "tips");
  if (useNudges && nudges) calls = applyByCall(calls, nudges, "nudges");
  if (useSlots && slots) calls = applyByCall(calls, slots, "slots");

  return {
    id: "sample",
    name: "Sample workspace",
    sendsEnabled: false,
    calls,
    sources: [
      sourceFor("deepgram", useTips ? "peer-file" : "sample", input.modules, notes.deepgram),
      sourceFor("nudges", useNudges ? "peer-file" : "sample", input.modules, notes.nudges),
      sourceFor("slots", useSlots ? "peer-file" : "sample", input.modules, notes.slots),
    ],
  };
}

export function findCall(workspace: DemoWorkspace, callId: string | undefined): DemoCall {
  return workspace.calls.find((call) => call.id === callId) ?? workspace.calls[0];
}
