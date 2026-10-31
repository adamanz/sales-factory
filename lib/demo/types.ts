export type Speaker = "Rep" | "Prospect";

export type TipKind = "pricing" | "competitor" | "discovery" | "objection" | "next_step" | "monologue";

export type NudgeTrigger = "PRICING" | "COMPETITOR" | "BUYING_SIGNAL" | "OBJECTION" | "NEXT_STEP";

export type PeerId = "deepgram" | "nudges" | "slots";

export type PeerMode = "sample" | "peer-file";

export type CoachingTip = {
  id: string;
  callId: string;
  atSec: number;
  startMs: number;
  endMs: number;
  speaker: Speaker;
  quote: string;
  tip: string;
  kind: TipKind;
};

export type Nudge = {
  id: string;
  callId: string;
  atSec: number;
  trigger: NudgeTrigger;
  text: string;
  evidence: string;
};

export type QuoteLine = {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  note: string;
};

export type DemoQuote = {
  id: string;
  name: string;
  total: number;
  recommended: boolean;
  summary: string;
  lines: QuoteLine[];
};

export type Slot = {
  id: string;
  callId: string;
  start: string;
  end: string;
  withWhom: string;
};

export type TranscriptTurn = {
  id: string;
  atSec: number;
  speaker: Speaker;
  text: string;
};

export type DemoCall = {
  id: string;
  account: string;
  opportunity: string;
  prospect: string;
  prospectTitle: string;
  rep: string;
  whenLabel: string;
  durationLabel: string;
  durationSec: number;
  quoteAtSec: number;
  outcome: string;
  turns: TranscriptTurn[];
  tips: CoachingTip[];
  nudges: Nudge[];
  quotes: DemoQuote[];
  slots: Slot[];
};

export type PeerSource = {
  id: PeerId;
  label: string;
  mode: PeerMode;
  modulePresent: boolean;
  note: string;
};

export type DemoWorkspace = {
  id: string;
  name: string;
  sendsEnabled: false;
  calls: DemoCall[];
  sources: PeerSource[];
};

export type DemoActionResult = {
  ok: true;
  delivered: false;
  channel: "browser";
  message: string;
};
