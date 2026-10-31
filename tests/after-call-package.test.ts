import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  generateAfterCallPackage,
  toPackageMarkdown,
  UNKNOWN,
  type PackageEnricher,
} from "../lib/after-call";

const fixture = (f: string) => fs.readFileSync(path.join(process.cwd(), "scripts", "fixtures", f), "utf8");
const SYNTHETIC = fixture("scorecard/synthetic-acme-pilot.json");
const NORTHWIND = fixture("scorecard/northwind-discovery.json");
const BRIGHTLINE = fixture("scorecard/brightline-pitch.txt");

describe("generateAfterCallPackage (deterministic)", () => {
  test("marks fixture as synthetic and never invents CRM ids or close date", async () => {
    const pkg = await generateAfterCallPackage(SYNTHETIC, { judge: null, enricher: null, generatedAt: "2026-10-31T00:00:00.000Z" });
    assert.equal(pkg.synthetic, true);
    assert.equal(pkg.outbound.salesforceWrites, false);
    assert.equal(pkg.outbound.emailSends, false);
    assert.equal(pkg.outbound.externalFetches, false);
    assert.equal(pkg.salesforcePreview.writes, false);
    assert.equal(pkg.salesforcePreview.apiCalls, false);
    assert.equal(pkg.followUpEmail.sends, false);

    const byField = Object.fromEntries(pkg.salesforcePreview.changes.map((c) => [`${c.object}.${c.field}`, c]));
    assert.equal(byField["Task.WhoId"].proposed, UNKNOWN);
    assert.equal(byField["Task.WhatId"].proposed, UNKNOWN);
    assert.equal(byField["Task.ActivityDate"].proposed, UNKNOWN);
    assert.equal(byField["Opportunity.CloseDate"].proposed, UNKNOWN);
    assert.equal(byField["OpportunityContactRole.ContactId"].proposed, UNKNOWN);
    assert.notEqual(byField["Opportunity.NextStep"].proposed, UNKNOWN);
    assert.match(String(byField["Opportunity.NextStep"].proposed), /Friday at 10am/);
  });

  test("next steps mark missing absolute dates as UNKNOWN but keep spoken time anchors", async () => {
    const pkg = await generateAfterCallPackage(SYNTHETIC, { judge: null, enricher: null });
    assert.ok(pkg.nextSteps.length >= 1);
    const step = pkg.nextSteps[0];
    assert.match(step.action, /Friday at 10am/);
    // "Friday at 10am" is a relative/weekday anchor from the transcript — accepted as dueDate.
    assert.notEqual(step.dueDate, UNKNOWN);
    assert.match(String(step.dueDate), /Friday|10am/i);
  });

  test("weak call with no dated commitment yields UNKNOWN dueDate", async () => {
    const pkg = await generateAfterCallPackage(BRIGHTLINE, { judge: null, enricher: null });
    assert.ok(pkg.nextSteps.every((n) => n.dueDate === UNKNOWN));
    const stage = pkg.salesforcePreview.changes.find((c) => c.object === "Opportunity" && c.field === "StageName");
    assert.equal(stage?.proposed, UNKNOWN);
  });

  test("email draft is preview text with UNKNOWN recipients when none provided", async () => {
    const pkg = await generateAfterCallPackage(NORTHWIND, { judge: null, enricher: null });
    assert.equal(pkg.followUpEmail.to, UNKNOWN);
    assert.equal(pkg.followUpEmail.cc, UNKNOWN);
    assert.equal(pkg.followUpEmail.sends, false);
    assert.ok(pkg.followUpEmail.body.length > 20);
    assert.ok(pkg.followUpEmail.subject.includes("Northwind") || pkg.followUpEmail.subject.includes("Follow-up"));
  });

  test("scorecard evidence quotes appear in the transcript", async () => {
    const pkg = await generateAfterCallPackage(SYNTHETIC, { judge: null, enricher: null });
    const text = JSON.parse(SYNTHETIC).turns.map((t: { text: string }) => t.text).join(" ");
    for (const f of pkg.scorecard.coachingFixes) {
      for (const e of f.evidence) {
        assert.ok(text.includes(e.quote.replace(/…$/, "")), `missing quote: ${e.quote}`);
      }
    }
  });
});

describe("generateAfterCallPackage (mocked enricher)", () => {
  test("uses enricher fields, drops fabricated evidence quotes, marks blank owner/date UNKNOWN", async () => {
    const enricher: PackageEnricher = async () => ({
      email: {
        to: "priya@example.com",
        cc: null,
        subject: "Pilot follow-up",
        body: "Thanks Priya — see you Friday.",
        evidenceQuotes: ["Friday at 10am works. Send the invite to both of us.", "We will gift you a yacht."],
      },
      nextSteps: [
        { action: "Send security overview", owner: "Jordan (AE)", dueDate: "today", evidenceQuote: "I'll send the invite today with a one-page pilot outline and our security overview link." },
        { action: "Invented owner step", owner: "", dueDate: "someday maybe", evidenceQuote: null },
      ],
      salesforce: [
        { object: "Opportunity", field: "Description", proposed: "Pilot interest", rationale: "From call", evidenceQuote: "Funding from overtime could work if the pilot actually halves triage." },
      ],
    });
    const pkg = await generateAfterCallPackage(SYNTHETIC, { judge: null, enricher });
    assert.equal(pkg.followUpEmail.to, "priya@example.com");
    assert.equal(pkg.followUpEmail.cc, UNKNOWN);
    assert.equal(pkg.followUpEmail.subject, "Pilot follow-up");
    assert.deepEqual(pkg.followUpEmail.evidenceQuotes, ["Friday at 10am works. Send the invite to both of us."]);
    assert.equal(pkg.nextSteps[0].owner, "Jordan (AE)");
    assert.equal(pkg.nextSteps[0].dueDate, "today");
    assert.equal(pkg.nextSteps[1].owner, UNKNOWN);
    assert.equal(pkg.nextSteps[1].dueDate, UNKNOWN);
    assert.ok(pkg.salesforcePreview.changes.some((c) => c.field === "Description" && c.proposed === "Pilot interest"));
    assert.equal(pkg.llm.used, true);
  });
});

describe("no-outbound guarantees", () => {
  test("generateAfterCallPackage does not call fetch", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = mock.fn(async () => {
      calls += 1;
      throw new Error("fetch must not be called");
    }) as typeof fetch;
    try {
      await generateAfterCallPackage(SYNTHETIC, { judge: null, enricher: null });
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("markdown labels preview-only Salesforce and email", async () => {
    const md = toPackageMarkdown(await generateAfterCallPackage(SYNTHETIC, { judge: null, enricher: null, generatedAt: "2026-10-31T00:00:00.000Z" }));
    assert.match(md, /SYNTHETIC/);
    assert.match(md, /Salesforce writes: \*\*none\*\*/);
    assert.match(md, /Email sends: \*\*none\*\*/);
    assert.match(md, /Proposed Salesforce updates \(preview/);
    assert.match(md, /Follow-up email \(preview — not sent\)/);
  });
});
