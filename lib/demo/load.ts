import fs from "node:fs";
import path from "node:path";
import { assembleWorkspace, PEER_FILES, type AssembleInput } from "./assemble";
import type { DemoWorkspace, PeerId } from "./types";

// Sibling agents own Deepgram coaching, the nudge engine, and Slot Finder.
// This file does not import those modules. If they drop JSON at the paths in
// PEER_FILES, the matching call ids replace the sample. Anything else stays a sample.

const MODULE_CANDIDATES: Record<PeerId, string[]> = {
  deepgram: ["lib/coaching/deepgram.ts", "lib/coaching/index.ts", "lib/deepgram.ts"],
  nudges: ["lib/nudges/index.ts", "lib/nudges/engine.ts", "lib/nudge-engine.ts"],
  slots: ["lib/slots/finder.ts", "lib/slots/index.ts", "lib/slot-finder.ts"],
};

function fromRoot(rel: string): string {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), rel);
}

function modulePresent(id: PeerId): boolean {
  return MODULE_CANDIDATES[id].some((rel) => fs.existsSync(fromRoot(rel)));
}

function readPeer(id: PeerId): { value?: unknown; note?: string } {
  const rel = PEER_FILES[id];
  const full = fromRoot(rel);
  if (!fs.existsSync(full)) return {};
  try {
    return { value: JSON.parse(fs.readFileSync(full, "utf8")) as unknown };
  } catch {
    return { note: `${rel} did not parse, so the sample is still in use.` };
  }
}

export function loadDemoWorkspace(): DemoWorkspace {
  const tipsFile = readPeer("deepgram");
  const nudgeFile = readPeer("nudges");
  const slotFile = readPeer("slots");
  const input: AssembleInput = {
    modules: {
      deepgram: modulePresent("deepgram"),
      nudges: modulePresent("nudges"),
      slots: modulePresent("slots"),
    },
    fileNotes: {
      deepgram: tipsFile.note,
      nudges: nudgeFile.note,
      slots: slotFile.note,
    },
  };
  if ("value" in tipsFile) input.tips = tipsFile.value;
  if ("value" in nudgeFile) input.nudges = nudgeFile.value;
  if ("value" in slotFile) input.slots = slotFile.value;
  return assembleWorkspace(input);
}
