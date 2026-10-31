import type { Scorecard } from "../scorecard";

/** Sentinel for values not found in the transcript. Never invent owners/dates/IDs. */
export const UNKNOWN = "UNKNOWN" as const;
export type Unknown = typeof UNKNOWN;

export type Source = "llm" | "heuristic";

export type FieldChange = {
  object: "Task" | "Opportunity" | "OpportunityContactRole";
  /** Salesforce API field name (shape only — no live org write). */
  field: string;
  /** Always UNKNOWN in preview mode; we never read Salesforce in this path. */
  current: Unknown;
  proposed: string | Unknown;
  rationale: string;
  evidenceQuote: string | null;
};

export type SalesforcePreviewDiff = {
  mode: "preview_only";
  writes: false;
  apiCalls: false;
  changes: FieldChange[];
};

export type FollowUpEmailDraft = {
  mode: "preview_only";
  sends: false;
  to: string | Unknown;
  cc: string | Unknown;
  subject: string;
  body: string;
  evidenceQuotes: string[];
};

export type NextStepItem = {
  action: string;
  owner: string | Unknown;
  dueDate: string | Unknown;
  evidenceQuote: string | null;
  source: Source;
};

export type AfterCallPackage = {
  kind: "after_call_package";
  synthetic: boolean;
  account: string | null;
  rep: string[];
  generatedAt: string;
  outbound: { salesforceWrites: false; emailSends: false; externalFetches: false };
  scorecard: Scorecard;
  salesforcePreview: SalesforcePreviewDiff;
  followUpEmail: FollowUpEmailDraft;
  nextSteps: NextStepItem[];
  llm: { used: boolean; model: string | null; error?: string };
};

export type PackageEnrichment = {
  email?: { to?: string | null; cc?: string | null; subject?: string; body?: string; evidenceQuotes?: string[] };
  nextSteps?: { action: string; owner?: string | null; dueDate?: string | null; evidenceQuote?: string | null }[];
  salesforce?: { object: FieldChange["object"]; field: string; proposed?: string | null; rationale?: string; evidenceQuote?: string | null }[];
};

export type PackageEnricher = (input: {
  transcript: string;
  scorecard: Scorecard;
  account: string | null;
}) => Promise<PackageEnrichment>;
