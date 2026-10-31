import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { stageAccept, stageHold } from "../lib/demo/actions";
import { assembleWorkspace, findCall } from "../lib/demo/assemble";
import { lineTotal, quoteTotal, sourceBanner, wordCount } from "../lib/demo/format";
import { ONBOARDING_STEPS } from "../lib/demo/onboarding";
import { isVisibleAt, PLAYBACK_MS, viewAt } from "../lib/demo/playback";
import { demoCalls } from "../lib/demo/seed";
import { SWARM_NOTE } from "../lib/demo/swarm-note";
import { TOUR_STEPS } from "../lib/demo/tour";

const roots = [
  "lib/demo",
  "components/demo",
  "components/onboarding",
  "components/landing",
  "app/demo",
  "app/start",
  "app/api/demo",
  "app/page.tsx",
  "app/layout.tsx",
];

function filesUnder(rel: string): string[] {
  const full = path.join(process.cwd(), rel);
  const stat = statSync(full);
  if (stat.isFile()) return [full];
  return readdirSync(full, { recursive: true })
    .map((entry) => path.join(full, String(entry)))
    .filter((file) => statSync(file).isFile() && /\.(ts|tsx|css)$/.test(file));
}

test("sample workspace has three calls and sends stay off", () => {
  const workspace = assembleWorkspace();
  assert.equal(workspace.sendsEnabled, false);
  assert.deepEqual(workspace.calls.map((call) => call.id), ["acme", "northwind", "brightline"]);
  assert.equal(workspace.sources.every((source) => source.mode === "sample"), true);
});

test("Acme quotes match the catalog motion", () => {
  const acme = demoCalls[0];
  const lean = acme.quotes.find((quote) => quote.id === "sample-lean");
  const full = acme.quotes.find((quote) => quote.id === "sample-full");
  assert.ok(lean && full);
  assert.equal(lean.recommended, false);
  assert.equal(full.recommended, true);
  assert.equal(lean.total, 100_000);
  assert.equal(full.total, 185_000);
  assert.equal(quoteTotal(lean.lines), lean.total);
  assert.equal(quoteTotal(full.lines), full.total);
  const seats = full.lines.find((line) => line.sku === "SKU-SEAT");
  assert.ok(seats);
  assert.equal(seats.discount, 100);
  assert.equal(lineTotal(seats), 0);
  assert.equal(full.lines.every((line) => line.sku.startsWith("SKU-")), true);
});

test("coaching quotes and nudge evidence are lines from the call", () => {
  for (const call of demoCalls) {
    const transcript = call.turns.map((turn) => turn.text).join("\n");
    assert.ok(call.tips.length > 0);
    assert.ok(call.nudges.length > 0);
    for (const tip of call.tips) {
      assert.equal(tip.callId, call.id);
      assert.ok(transcript.includes(tip.quote), tip.quote);
      assert.ok(tip.atSec <= call.durationSec);
    }
    for (const nudge of call.nudges) {
      assert.equal(nudge.callId, call.id);
      assert.ok(transcript.includes(nudge.evidence), nudge.evidence);
      assert.ok(wordCount(nudge.text) <= 40, nudge.text);
      assert.ok(wordCount(nudge.text) > 0);
    }
    for (const slot of call.slots) {
      assert.equal(slot.callId, call.id);
      assert.ok(Date.parse(slot.end) > Date.parse(slot.start));
    }
  }
});

test("playback reveals the Acme quote only at the end", () => {
  const acme = demoCalls[0];
  const brightline = demoCalls[2];
  const start = viewAt(acme, 0);
  const end = viewAt(acme, PLAYBACK_MS);
  assert.equal(start.quotesReady, false);
  assert.equal(end.quotesReady, true);
  assert.equal(viewAt(brightline, PLAYBACK_MS).quotesReady, false);
  assert.equal(isVisibleAt(0, start.second), true);
  assert.equal(isVisibleAt(acme.durationSec, start.second), false);
  const earlyTurns = acme.turns.filter((turn) => isVisibleAt(turn.atSec, start.second));
  const lateTurns = acme.turns.filter((turn) => isVisibleAt(turn.atSec, end.second));
  assert.ok(lateTurns.length > earlyTurns.length);
  assert.equal(lateTurns.length, acme.turns.length);
});

test("peer files replace samples per call and bad files are ignored", () => {
  const replaced = assembleWorkspace({
    tips: {
      tips: [
        {
          id: "peer-tip",
          callId: "acme",
          atSec: 12,
          speaker: "Prospect",
          quote: "peer quote",
          tip: "peer tip",
          kind: "pricing",
        },
      ],
    },
  });
  const acme = findCall(replaced, "acme");
  const northwind = findCall(replaced, "northwind");
  assert.deepEqual(acme.tips.map((tip) => tip.id), ["peer-tip"]);
  assert.equal(acme.tips[0].startMs, 12000);
  assert.ok(northwind.tips.length > 1);
  assert.equal(replaced.sources.find((source) => source.id === "deepgram")?.mode, "peer-file");

  const ignored = assembleWorkspace({ tips: { tips: [{ id: "nope" }] } });
  assert.equal(findCall(ignored, "acme").tips[0].id, "acme-tip-1");
  assert.match(ignored.sources.find((source) => source.id === "deepgram")?.note ?? "", /ignored/);
});

test("a present module does not replace the sample by itself", () => {
  const workspace = assembleWorkspace({ modules: { deepgram: true, nudges: true, slots: true } });
  assert.equal(workspace.sources.every((source) => source.mode === "sample" && source.modulePresent), true);
  assert.match(sourceBanner(workspace.sources), /not connected/);
  assert.match(workspace.sources[0].note, /data\/peers\/deepgram\.json/);
});

test("swarm note names the demo path and stays off the wire", () => {
  assert.equal(SWARM_NOTE.sendsEnabled, false);
  assert.match(SWARM_NOTE.summary, /\$185,000/);
  assert.equal(SWARM_NOTE.peerFiles.deepgram, "data/peers/deepgram.json");
});

test("demo actions never deliver", () => {
  const accepted = stageAccept("Full");
  const held = stageHold("Tue, Nov 3, 10:30 AM PT");
  assert.equal(accepted.delivered, false);
  assert.equal(held.delivered, false);
  assert.match(accepted.message, /Salesforce was not updated/);
  assert.match(held.message, /No invite was sent/);
});

test("tour and onboarding cover the walkthrough without asking for an email", () => {
  assert.equal(new Set(TOUR_STEPS.map((step) => step.id)).size, TOUR_STEPS.length);
  assert.equal(ONBOARDING_STEPS.length, 3);
  const copy = [...TOUR_STEPS, ...ONBOARDING_STEPS].map((step) => `${step.title} ${step.body}`).join("\n");
  assert.match(copy, /\$185,000/);
  assert.match(copy, /does not send anything/);
  assert.equal(/email address|your email|work email/i.test(copy), false);
});

test("demo UI code does not call Slack, email, or Salesforce", () => {
  const banned = [/chat\.postMessage/, /SLACK_BOT/, /mailto:/, /resend/i, /salesforce_op/, /SALESFORCE_/];
  const hits: string[] = [];
  for (const rel of roots) {
    for (const file of filesUnder(rel)) {
      const text = readFileSync(file, "utf8");
      for (const pattern of banned) {
        if (pattern.test(text)) hits.push(`${path.relative(process.cwd(), file)} ${pattern}`);
      }
    }
  }
  assert.deepEqual(hits, []);
});
