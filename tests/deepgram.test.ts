import assert from "node:assert/strict";
import test from "node:test";
import { AnnouncementPermit } from "../lib/coaching/consent";
import {
  buildListenUrl,
  parseDeepgramMessage,
  parseWavPcm16,
  transcribeLinear16,
  type DeepgramSocket,
  type DeepgramSocketEvent,
} from "../lib/coaching/deepgram";

test("parses Deepgram final transcripts and errors", () => {
  const finalMessage = parseDeepgramMessage(JSON.stringify({
    type: "Results",
    is_final: true,
    speech_final: true,
    channel: { alternatives: [{ transcript: "life moves pretty fast" }] },
  }));
  assert.deepEqual(finalMessage, {
    type: "transcript",
    text: "life moves pretty fast",
    isFinal: true,
    speechFinal: true,
  });

  const interim = parseDeepgramMessage(JSON.stringify({
    type: "Results",
    is_final: false,
    speech_final: false,
    channel: { alternatives: [{ transcript: "life" }] },
  }));
  assert.equal(interim.type, "transcript");
  if (interim.type === "transcript") assert.equal(interim.isFinal, false);

  assert.deepEqual(parseDeepgramMessage(JSON.stringify({ type: "Error", description: "bad audio" })), {
    type: "error",
    message: "bad audio",
  });
  assert.deepEqual(parseDeepgramMessage("not-json"), { type: "ignore" });
  assert.deepEqual(parseDeepgramMessage(JSON.stringify({ type: "Metadata" })), { type: "ignore" });
  assert.deepEqual(parseDeepgramMessage(JSON.stringify({ type: "Results", channel: {} })), { type: "ignore" });
});

test("parses 16-bit PCM WAV and skips unknown chunks", () => {
  const pcm = Buffer.alloc(4);
  pcm.writeInt16LE(1, 0);
  pcm.writeInt16LE(-2, 2);
  const parsed = parseWavPcm16(buildWav(pcm, true));
  assert.equal(parsed.sampleRate, 16000);
  assert.equal(parsed.channels, 1);
  assert.equal(parsed.pcm.readInt16LE(0), 1);
  assert.equal(parsed.pcm.readInt16LE(2), -2);
  assert.throws(() => parseWavPcm16(buildWav(pcm, false, 3)), /WAV must be PCM/);
  assert.throws(() => parseWavPcm16(buildWav(pcm, false, 1, 8)), /WAV must be 16-bit/);
});

test("listen url uses nova-3 linear16", () => {
  const url = new URL(buildListenUrl(16000, 1));
  assert.equal(url.searchParams.get("model"), "nova-3");
  assert.equal(url.searchParams.get("encoding"), "linear16");
  assert.equal(url.searchParams.get("sample_rate"), "16000");
  assert.equal(url.searchParams.get("channels"), "1");
});

test("does not construct a socket without a delivered announcement", async () => {
  let constructed = false;
  await assert.rejects(
    () =>
      transcribeLinear16({
        apiKey: "test-key",
        pcm: Buffer.alloc(2),
        sampleRate: 16000,
        channels: 1,
        permit: {} as AnnouncementPermit,
        websocketFactory: () => {
          constructed = true;
          throw new Error("should not construct");
        },
      }),
    /recording announcement has not been delivered/,
  );
  assert.equal(constructed, false);
});

test("streams audio after the permit and joins final transcripts", async () => {
  const permit = await AnnouncementPermit.issue("announce recording", async () => {});
  assert.ok(permit);
  const captured: { socket?: FakeSocket } = {};
  const text = await transcribeLinear16({
    apiKey: "test-key",
    pcm: Buffer.alloc(4),
    sampleRate: 16000,
    channels: 1,
    permit,
    paceMs: 0,
    timeoutMs: 2_000,
    websocketFactory: (url, headers) => {
      const socket = new FakeSocket(url, headers);
      captured.socket = socket;
      return socket;
    },
  });
  const fake = captured.socket;
  assert.ok(fake);
  assert.equal(fake.headers.Authorization, "Token test-key");
  const listen = new URL(fake.url);
  assert.equal(listen.searchParams.get("model"), "nova-3");
  assert.equal(listen.searchParams.get("encoding"), "linear16");
  assert.equal(text, "life moves pretty fast Follow up Tuesday");
  assert.equal(fake.sent.some((chunk) => typeof chunk === "string" && chunk.includes("CloseStream")), true);
});

class FakeSocket implements DeepgramSocket {
  readonly sent: Array<string | Buffer> = [];
  private opened = false;
  private readonly listeners: Record<"open" | "message" | "error" | "close", Array<(event: DeepgramSocketEvent) => void>> = {
    open: [],
    message: [],
    error: [],
    close: [],
  };

  constructor(
    readonly url: string,
    readonly headers: Record<string, string>,
  ) {}

  addEventListener(
    type: "open" | "message" | "error" | "close",
    listener: (event: DeepgramSocketEvent) => void,
  ): void {
    this.listeners[type].push(listener);
    if (type === "open" && !this.opened) {
      this.opened = true;
      queueMicrotask(() => this.emit("open", {}));
    }
  }

  send(data: string | Buffer): void {
    this.sent.push(data);
    if (typeof data === "string" && data.includes("CloseStream")) {
      this.emit("message", {
        data: JSON.stringify({
          type: "Results",
          is_final: true,
          speech_final: true,
          channel: { alternatives: [{ transcript: "life moves pretty fast" }] },
        }),
      });
      this.emit("message", {
        data: JSON.stringify({
          type: "Results",
          is_final: true,
          speech_final: false,
          channel: { alternatives: [{ transcript: "Follow up Tuesday" }] },
        }),
      });
      this.emit("close", { code: 1000 });
    }
  }

  close(): void {
    this.emit("close", { code: 1000 });
  }

  private emit(type: "open" | "message" | "error" | "close", event: DeepgramSocketEvent): void {
    for (const listener of this.listeners[type]) listener(event);
  }
}

function buildWav(data: Buffer, withFact = false, audioFormat = 1, bitsPerSample = 16): Buffer {
  const channels = 1;
  const sampleRate = 16000;
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(audioFormat, 0);
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  const blockAlign = channels * (bitsPerSample / 8);
  fmt.writeUInt32LE(sampleRate * blockAlign, 8);
  fmt.writeUInt16LE(blockAlign, 12);
  fmt.writeUInt16LE(bitsPerSample, 14);
  const chunks = [chunk("fmt ", fmt)];
  if (withFact) chunks.push(chunk("fact", Buffer.from([0, 0, 0, 0])));
  chunks.push(chunk("data", data));
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0);
  header.writeUInt32LE(4 + body.length, 4);
  header.write("WAVE", 8);
  return Buffer.concat([header, body]);
}

function chunk(id: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(id, 0);
  head.writeUInt32LE(data.length, 4);
  const pad = data.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
  return Buffer.concat([head, data, pad]);
}
