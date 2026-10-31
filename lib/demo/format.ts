import type { NudgeTrigger, PeerSource, QuoteLine } from "./types";

export function lineTotal(line: QuoteLine): number {
  const gross = line.quantity * line.unitPrice;
  return Math.round(gross * (1 - line.discount / 100));
}

export function quoteTotal(lines: QuoteLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

export function money(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function triggerLabel(trigger: NudgeTrigger): string {
  switch (trigger) {
    case "PRICING":
      return "Pricing";
    case "COMPETITOR":
      return "Competitor";
    case "BUYING_SIGNAL":
      return "Buying signal";
    case "OBJECTION":
      return "Objection";
    case "NEXT_STEP":
      return "Next step";
    default: {
      const neverTrigger: never = trigger;
      return neverTrigger;
    }
  }
}

export function formatSlotRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(startDate);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
  return `${day}, ${time.format(startDate)} to ${time.format(endDate)} PT`;
}

export function sourceBanner(sources: PeerSource[]): string {
  const loaded = sources.filter((source) => source.mode === "peer-file");
  const samples = sources.filter((source) => source.mode === "sample");
  if (loaded.length === 0) {
    return "Coaching tips, nudges, and meeting times are samples. Deepgram, the nudge engine, and Slot Finder are not connected in this build.";
  }
  if (samples.length === 0) {
    return "Coaching tips, nudges, and meeting times are loaded from peer files in this build.";
  }
  const loadedLabels = loaded.map((source) => source.label).join(", ");
  const sampleLabels = samples.map((source) => source.label).join(", ");
  return `${loadedLabels} loaded from a peer file. Still on samples: ${sampleLabels}.`;
}
