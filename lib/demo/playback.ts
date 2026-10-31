import type { DemoCall } from "./types";

/** Compressed call length. The full Acme transcript fits in under a minute. */
export const PLAYBACK_MS = 50_000;

export type CallView = {
  second: number;
  quotesReady: boolean;
};

export function callSecond(elapsedMs: number, durationSec: number): number {
  const clamped = Math.min(PLAYBACK_MS, Math.max(0, elapsedMs));
  return (clamped / PLAYBACK_MS) * durationSec;
}

export function viewAt(call: DemoCall, elapsedMs: number): CallView {
  const second = callSecond(elapsedMs, call.durationSec);
  return {
    second,
    quotesReady: call.quotes.length > 0 && second >= call.quoteAtSec,
  };
}

export function isVisibleAt(atSec: number, second: number): boolean {
  return atSec <= second + 0.001;
}
