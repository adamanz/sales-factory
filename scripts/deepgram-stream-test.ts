// Streams a short local recording to Deepgram. The socket opens only after
// the recording announcement is delivered.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { consentModeFromEnv, runCoachingTranscription } from "../lib/coaching/consent";
import { parseWavPcm16, transcribeLinear16 } from "../lib/coaching/deepgram";
import { formatSecretLocation, readSecret, redactSecrets } from "../lib/secrets";

const execFileAsync = promisify(execFile);
const PHRASE = "Life moves pretty fast. Follow up Tuesday.";
const held: string[] = [];

async function main(): Promise<number> {
  const mode = consentModeFromEnv(process.env);
  console.log(`consent mode: ${mode}`);
  const secret = mode === "off" ? null : await readSecret("DEEPGRAM_API_KEY");
  if (mode !== "off" && !secret) {
    console.error("DEEPGRAM BLOCKED");
    console.error("reason: DEEPGRAM_API_KEY was not found");
    console.error("url: https://console.deepgram.com/");
    return 2;
  }
  if (secret) {
    held.push(secret.value);
    console.log(`DEEPGRAM_API_KEY from ${formatSecretLocation(secret.location)}`);
  }

  const outcome = await runCoachingTranscription({
    mode,
    announce: async (announcement) => {
      console.log(`ANNOUNCEMENT: ${announcement}`);
    },
    transcribe: async (permit) => {
      if (!secret) throw new Error("Transcription refused: consent mode is off");
      const dir = await mkdtemp(join(tmpdir(), "coaching-sample-"));
      const aiff = join(dir, "sample.aiff");
      const wav = join(dir, "sample.wav");
      try {
        await execFileAsync("say", ["-o", aiff, PHRASE]);
        await execFileAsync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav]);
        const parsed = parseWavPcm16(await readFile(wav));
        if (parsed.sampleRate !== 16000 || parsed.channels !== 1) {
          throw new Error(`Expected 16 kHz mono WAV, got ${parsed.sampleRate} Hz ${parsed.channels} ch`);
        }
        const seconds = parsed.pcm.length / (parsed.sampleRate * parsed.channels * 2);
        console.log(`sample: ${seconds.toFixed(1)}s 16 kHz mono`);
        console.log("opening Deepgram socket");
        return transcribeLinear16({
          apiKey: secret.value,
          pcm: parsed.pcm,
          sampleRate: parsed.sampleRate,
          channels: parsed.channels,
          permit,
          timeoutMs: 60_000,
        });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  });

  if (outcome.status === "refused") {
    console.error("Transcription refused because consent mode is off.");
    return 2;
  }
  const transcript = outcome.value;
  console.log(`transcript: ${transcript}`);
  const heard = transcript.toLowerCase();
  const missing = ["life", "fast", "tuesday"].filter((word) => !heard.includes(word));
  if (missing.length > 0) throw new Error(`Transcript missing ${missing.join(", ")}`);
  console.log("Deepgram streaming transcription passed");
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Deepgram test failed";
    console.error(redactSecrets(message, held));
    process.exitCode = 1;
  });
