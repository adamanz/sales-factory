import { formatTranscript, scorecardModel } from "../scorecard/judge";
import { parseTranscript, quoteVerifier, scoreCall } from "../scorecard";
import type { ScoreOptions, Scorecard } from "../scorecard";
import type {
  AfterCallPackage,
  FieldChange,
  FollowUpEmailDraft,
  NextStepItem,
  PackageEnricher,
  PackageEnrichment,
  SalesforcePreviewDiff,
} from "./types";
import { UNKNOWN } from "./types";

export type PackageOptions = ScoreOptions & {
  /** undefined/null = no enricher (deterministic only). Pass a mock or LLM enricher in tests. */
  enricher?: PackageEnricher | null;
  /** ISO timestamp override for deterministic fixtures. */
  generatedAt?: string;
  synthetic?: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const RELATIVE_DAY = /\b(today|tomorrow|this week|next week|end of (the )?week|eod|eow)\b/i;
const CLOCK = /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i;

function orUnknown(v: string | null | undefined): string | typeof UNKNOWN {
  const s = (v ?? "").trim();
  return s ? s : UNKNOWN;
}

function looksLikeDate(v: string | null | undefined): boolean {
  if (!v) return false;
  return ISO_DATE.test(v) || WEEKDAY.test(v) || RELATIVE_DAY.test(v) || CLOCK.test(v);
}

/** Build proposed CRM field updates from the scorecard. Preview only — never writes or fetches SF. */
export function buildSalesforcePreview(scorecard: Scorecard, enrich?: PackageEnrichment["salesforce"]): SalesforcePreviewDiff {
  const changes: FieldChange[] = [];
  const ns = scorecard.nextStep;
  const account = scorecard.account ?? UNKNOWN;
  const rep = scorecard.rep[0] ?? UNKNOWN;
  const subject = `Call notes — ${account === UNKNOWN ? "UNKNOWN account" : account}`;
  const descriptionBits = [
    scorecard.summary ? `Summary: ${scorecard.summary}` : null,
    ns.agreed && ns.quote ? `Next step: ${ns.quote}` : "Next step: not agreed on call",
    scorecard.objections.count ? `Objections: ${scorecard.objections.items.map((o) => o.category).join(", ")}` : null,
  ].filter(Boolean);

  changes.push({
    object: "Task",
    field: "Subject",
    current: UNKNOWN,
    proposed: subject,
    rationale: "Log a completed call activity from the transcript.",
    evidenceQuote: ns.quote,
  });
  changes.push({
    object: "Task",
    field: "Description",
    current: UNKNOWN,
    proposed: descriptionBits.join("\n") || UNKNOWN,
    rationale: "Capture call summary and agreed next step for CRM history.",
    evidenceQuote: ns.quote,
  });
  changes.push({
    object: "Task",
    field: "Status",
    current: UNKNOWN,
    proposed: "Completed",
    rationale: "Call already happened; activity should be closed.",
    evidenceQuote: null,
  });
  changes.push({
    object: "Task",
    field: "ActivityDate",
    current: UNKNOWN,
    proposed: UNKNOWN, // call date is not in transcript fixtures unless stated
    rationale: "Call date not present in transcript — leave for human review.",
    evidenceQuote: null,
  });
  changes.push({
    object: "Task",
    field: "WhoId",
    current: UNKNOWN,
    proposed: UNKNOWN,
    rationale: "Contact Id requires a Salesforce lookup; never invent record IDs.",
    evidenceQuote: null,
  });
  changes.push({
    object: "Task",
    field: "WhatId",
    current: UNKNOWN,
    proposed: UNKNOWN,
    rationale: "Opportunity Id requires a Salesforce lookup; never invent record IDs.",
    evidenceQuote: null,
  });

  const stage = ns.agreed ? "Qualification" : UNKNOWN;
  changes.push({
    object: "Opportunity",
    field: "StageName",
    current: UNKNOWN,
    proposed: stage,
    rationale: ns.agreed
      ? "Dated next step agreed on call — propose advancing into Qualification (human must confirm)."
      : "No agreed next step on call — stage change left UNKNOWN.",
    evidenceQuote: ns.quote,
  });
  changes.push({
    object: "Opportunity",
    field: "NextStep",
    current: UNKNOWN,
    proposed: orUnknown(ns.quote),
    rationale: "Mirror the on-call next-step commitment into Opportunity.NextStep.",
    evidenceQuote: ns.quote,
  });
  changes.push({
    object: "Opportunity",
    field: "CloseDate",
    current: UNKNOWN,
    proposed: UNKNOWN,
    rationale: "Close date was not stated on the call.",
    evidenceQuote: null,
  });

  const prospect = scorecard.talk.speakers.find((s) => s.role === "prospect")?.speaker ?? null;
  changes.push({
    object: "OpportunityContactRole",
    field: "Role",
    current: UNKNOWN,
    proposed: prospect ? "Economic Buyer (proposed)" : UNKNOWN,
    rationale: prospect
      ? `Prospect speaker "${prospect}" participated; role is a proposal only until verified in CRM.`
      : "No prospect speaker identified.",
    evidenceQuote: null,
  });
  changes.push({
    object: "OpportunityContactRole",
    field: "ContactId",
    current: UNKNOWN,
    proposed: UNKNOWN,
    rationale: "Contact Id requires Salesforce; never invent.",
    evidenceQuote: null,
  });

  for (const e of enrich ?? []) {
    changes.push({
      object: e.object,
      field: e.field,
      current: UNKNOWN,
      proposed: orUnknown(e.proposed),
      rationale: e.rationale?.trim() || "Enricher proposal (preview only).",
      evidenceQuote: e.evidenceQuote ?? null,
    });
  }

  return { mode: "preview_only", writes: false, apiCalls: false, changes };
}

export function buildFollowUpEmail(scorecard: Scorecard, enrich?: PackageEnrichment["email"]): FollowUpEmailDraft {
  const account = scorecard.account ?? "your team";
  const rep = scorecard.rep[0] ?? "the team";
  const ns = scorecard.nextStep;
  const evidenceQuotes = [
    ...(enrich?.evidenceQuotes ?? []),
    ...(ns.quote ? [ns.quote] : []),
  ].filter((q, i, a) => a.indexOf(q) === i).slice(0, 3);

  const defaultBody = [
    `Hi —`,
    "",
    `Thanks for the conversation${scorecard.account ? ` about ${account}` : ""}.`,
    ns.agreed && ns.quote
      ? `As discussed, next step: ${ns.quote}`
      : `I will follow up with materials; we did not lock a dated next step on the call.`,
    scorecard.coachingFixes[0]
      ? `(Internal note for rep — not for send: ${scorecard.coachingFixes[0].title})`
      : null,
    "",
    `Best,`,
    rep,
  ].filter((l) => l !== null).join("\n");

  return {
    mode: "preview_only",
    sends: false,
    to: orUnknown(enrich?.to),
    cc: orUnknown(enrich?.cc),
    subject: enrich?.subject?.trim() || `Follow-up: ${account}`,
    body: enrich?.body?.trim() || defaultBody,
    evidenceQuotes,
  };
}

export function buildNextSteps(scorecard: Scorecard, enrich?: PackageEnrichment["nextSteps"]): NextStepItem[] {
  const items: NextStepItem[] = [];
  if (enrich?.length) {
    for (const e of enrich) {
      items.push({
        action: e.action.trim() || UNKNOWN,
        owner: orUnknown(e.owner),
        dueDate: looksLikeDate(e.dueDate) ? String(e.dueDate).trim() : UNKNOWN,
        evidenceQuote: e.evidenceQuote ?? null,
        source: "llm",
      });
    }
  } else {
    const ns = scorecard.nextStep;
    if (ns.agreed && ns.quote) {
      items.push({
        action: ns.quote,
        owner: orUnknown(ns.owner),
        dueDate: looksLikeDate(ns.when) ? String(ns.when) : UNKNOWN,
        evidenceQuote: ns.quote,
        source: ns.source,
      });
    }
    if (!items.length) {
      items.push({
        action: "Confirm next step with prospect (none agreed on call)",
        owner: orUnknown(scorecard.rep[0]),
        dueDate: UNKNOWN,
        evidenceQuote: null,
        source: "heuristic",
      });
    }
  }
  return items.map((i) => ({
    ...i,
    owner: i.owner && i.owner !== UNKNOWN ? i.owner : UNKNOWN,
    dueDate: i.dueDate && i.dueDate !== UNKNOWN && looksLikeDate(String(i.dueDate)) ? i.dueDate : UNKNOWN,
  }));
}

/**
 * After-call package: scorecard + CRM preview diff + email draft + next steps.
 * Never writes Salesforce, never sends email, never calls external HTTP APIs.
 */
export async function generateAfterCallPackage(input: unknown, opts: PackageOptions = {}): Promise<AfterCallPackage> {
  const parsed = parseTranscript(input);
  const header = typeof input === "string" ? input.slice(0, 200) : JSON.stringify(input).slice(0, 200);
  const synthetic =
    opts.synthetic ??
    (/SYNTHETIC\s*-\s*not a real customer/i.test(header) ||
      /\(synthetic\)/i.test(parsed.account ?? "") ||
      /synthetic/i.test(header));

  const scorecard = await scoreCall(input, {
    rubric: opts.rubric,
    judge: opts.judge,
    rep: opts.rep,
    account: opts.account,
  });

  let enrich: PackageEnrichment | undefined;
  let enrichError: string | undefined;
  let enrichUsed = false;
  if (opts.enricher) {
    try {
      enrich = await opts.enricher({
        transcript: formatTranscript(parsed.turns),
        scorecard,
        account: scorecard.account,
      });
      enrichUsed = true;
    } catch (e: any) {
      enrichError = String(e?.message || e);
    }
  }

  const verifier = quoteVerifier(parsed.turns);
  if (enrich?.email?.evidenceQuotes) {
    enrich.email.evidenceQuotes = enrich.email.evidenceQuotes.filter((q) => verifier(q));
  }
  if (enrich?.nextSteps) {
    enrich.nextSteps = enrich.nextSteps.map((n) => ({
      ...n,
      evidenceQuote: n.evidenceQuote && verifier(n.evidenceQuote) ? n.evidenceQuote : null,
    }));
  }
  if (enrich?.salesforce) {
    enrich.salesforce = enrich.salesforce.map((c) => ({
      ...c,
      evidenceQuote: c.evidenceQuote && verifier(c.evidenceQuote) ? c.evidenceQuote : null,
    }));
  }

  return {
    kind: "after_call_package",
    synthetic,
    account: scorecard.account,
    rep: scorecard.rep,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    outbound: { salesforceWrites: false, emailSends: false, externalFetches: false },
    scorecard,
    salesforcePreview: buildSalesforcePreview(scorecard, enrich?.salesforce),
    followUpEmail: buildFollowUpEmail(scorecard, enrich?.email),
    nextSteps: buildNextSteps(scorecard, enrich?.nextSteps),
    llm: {
      used: scorecard.llm.used || enrichUsed,
      model: scorecard.llm.used || enrichUsed ? scorecardModel() : null,
      ...(scorecard.llm.error || enrichError
        ? { error: [scorecard.llm.error, enrichError].filter(Boolean).join("; ") }
        : {}),
    },
  };
}
