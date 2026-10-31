import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  AnnouncementPermit,
  RECORDING_ANNOUNCEMENT,
  consentModeFromEnv,
  resolveConsentMode,
  runCoachingTranscription,
} from "../lib/coaching/consent";

test("defaults to announce recording", () => {
  assert.equal(resolveConsentMode(undefined), "announce recording");
  assert.equal(resolveConsentMode(null), "announce recording");
  assert.equal(resolveConsentMode("   "), "announce recording");
  assert.equal(consentModeFromEnv({}), "announce recording");
  assert.equal(resolveConsentMode(" announce recording "), "announce recording");
});

test("off is the only other consent mode and unknown values throw", () => {
  assert.equal(resolveConsentMode("off"), "off");
  assert.equal(consentModeFromEnv({ COACHING_CONSENT_MODE: " off " }), "off");
  assert.throws(() => resolveConsentMode("always"), /Unknown coaching consent mode: always/);
});

test("off refuses transcription and does not announce", async () => {
  let announced = false;
  let transcribed = false;
  const result = await runCoachingTranscription({
    mode: "off",
    announce: async () => {
      announced = true;
    },
    transcribe: async () => {
      transcribed = true;
      return "nope";
    },
  });
  assert.deepEqual(result, { status: "refused" });
  assert.equal(announced, false);
  assert.equal(transcribed, false);
});

test("does not transcribe until the announcement is delivered", async () => {
  let opened = false;
  let delivered = false;
  const pending = runCoachingTranscription({
    mode: "announce recording",
    announce: async (text) => {
      assert.equal(text, RECORDING_ANNOUNCEMENT);
      assert.equal(opened, false);
      await delay(20);
      delivered = true;
    },
    transcribe: async (permit) => {
      permit.assertOpen();
      assert.equal(delivered, true);
      opened = true;
      return "ok";
    },
  });
  await delay(5);
  assert.equal(opened, false);
  assert.deepEqual(await pending, { status: "transcribed", value: "ok" });
});

test("a failed announcement does not issue a permit", async () => {
  let transcribed = false;
  await assert.rejects(
    () =>
      runCoachingTranscription({
        mode: "announce recording",
        announce: async () => {
          throw new Error("delivery failed");
        },
        transcribe: async () => {
          transcribed = true;
          return "ok";
        },
      }),
    /delivery failed/,
  );
  assert.equal(transcribed, false);
  const permit = await AnnouncementPermit.issue("announce recording", async (text) => {
    assert.equal(text, RECORDING_ANNOUNCEMENT);
  });
  assert.ok(permit);
  permit.assertOpen();
});
