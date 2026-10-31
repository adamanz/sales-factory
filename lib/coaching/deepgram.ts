// Deepgram streaming transcription. The socket is created only after an
// AnnouncementPermit has been issued, which happens after the recording
// announcement resolves.
import { setTimeout as delay } from "node:timers/promises";
import { AnnouncementPermit } from "./consent";
import { redactSecrets } from "../secrets";

export type DeepgramParse =
  | { type: "transcript"; text: string; isFinal: boolean; speechFinal: boolean }
  | { type: "error"; message: string }
  | { type: "ignore" };

export type DeepgramSocketEvent = {
  data?: unknown;
  message?: string;
  code?: number;
  reason?: string;
};

export interface DeepgramSocket {
  send(data: string | Buffer): void;
  close(): void;
  addEventListener(
    type: "open" | "message" | "error" | "close",
    listener: (event: DeepgramSocketEvent) => void,
  ): void;
}

export type WavPcm16 = {
  sampleRate: number;
  channels: number;
  pcm: Buffer;
};

const REFUSAL = "Refusing to open Deepgram: recording announcement has not been delivered";

export function buildListenUrl(sampleRate: number, channels: number): string {
  const url = new URL("wss://api.deepgram.com/v1/listen");
  url.searchParams.set("model", "nova-3");
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("sample_rate", String(sampleRate));
  url.searchParams.set("channels", String(channels));
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("interim_results", "false");
  return url.toString();
}

export function parseDeepgramMessage(raw: string): DeepgramParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { type: "ignore" };
  }
  if (!isRecord(parsed)) return { type: "ignore" };
  const kind = parsed.type;
  if (kind === "Error" || kind === "error") {
    return { type: "error", message: firstString(parsed, ["description", "message", "error"]) ?? "Deepgram error" };
  }
  if (kind !== "Results") return { type: "ignore" };
  const channel = parsed.channel;
  if (!isRecord(channel) || !Array.isArray(channel.alternatives)) return { type: "ignore" };
  const first = channel.alternatives[0];
  if (!isRecord(first) || typeof first.transcript !== "string") return { type: "ignore" };
  return {
    type: "transcript",
    text: first.transcript,
    isFinal: parsed.is_final === true,
    speechFinal: parsed.speech_final === true,
  };
}

export function parseWavPcm16(buf: Buffer): WavPcm16 {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Not a WAV file");
  }
  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let pcm: Buffer | null = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buf.length) throw new Error("WAV chunk extends past the file");
    if (id === "fmt ") {
      if (size < 16) throw new Error("WAV fmt chunk is too small");
      audioFormat = buf.readUInt16LE(start);
      channels = buf.readUInt16LE(start + 2);
      sampleRate = buf.readUInt32LE(start + 4);
      bitsPerSample = buf.readUInt16LE(start + 14);
    } else if (id === "data") {
      pcm = buf.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (audioFormat !== 1) throw new Error(`WAV must be PCM, got format ${audioFormat}`);
  if (bitsPerSample !== 16) throw new Error(`WAV must be 16-bit, got ${bitsPerSample}`);
  if (channels < 1) throw new Error("WAV has no channels");
  if (!pcm) throw new Error("WAV data chunk missing");
  return { sampleRate, channels, pcm };
}

export async function transcribeLinear16(opts: {
  apiKey: string;
  pcm: Buffer;
  sampleRate: number;
  channels: number;
  permit: AnnouncementPermit;
  paceMs?: number;
  timeoutMs?: number;
  websocketFactory?: (url: string, headers: Record<string, string>) => DeepgramSocket;
}): Promise<string> {
  if (!(opts.permit instanceof AnnouncementPermit)) throw new Error(REFUSAL);
  opts.permit.assertOpen();
  if (!opts.apiKey) throw new Error("DEEPGRAM_API_KEY is empty");
  if (opts.pcm.length === 0) throw new Error("WAV has no audio");
  if (!Number.isInteger(opts.sampleRate) || opts.sampleRate < 8000) throw new Error("Invalid sample rate");
  if (!Number.isInteger(opts.channels) || opts.channels < 1) throw new Error("Invalid channel count");

  const url = buildListenUrl(opts.sampleRate, opts.channels);
  const headers = { Authorization: `Token ${opts.apiKey}` };
  const factory = opts.websocketFactory ?? nodeWebSocket;
  const socket = factory(url, headers);
  const paceMs = opts.paceMs ?? 100;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  try {
    return await runSession(socket, opts.pcm, opts.sampleRate, opts.channels, paceMs, timeoutMs, opts.apiKey);
  } finally {
    socket.close();
  }
}

async function runSession(
  socket: DeepgramSocket,
  pcm: Buffer,
  sampleRate: number,
  channels: number,
  paceMs: number,
  timeoutMs: number,
  apiKey: string,
): Promise<string> {
  const parts: string[] = [];
  let failure: Error | null = null;
  let settled = false;

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      finish(new Error("Deepgram timed out"));
    }, timeoutMs);

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(parts.join(" ").replace(/\s+/g, " ").trim());
    };

    const handleRaw = (raw: string) => {
      const message = parseDeepgramMessage(raw);
      switch (message.type) {
        case "transcript": {
          const text = message.text.trim();
          if (text && (message.isFinal || message.speechFinal) && parts[parts.length - 1] !== text) {
            parts.push(text);
          }
          break;
        }
        case "error":
          failure = new Error(redactSecrets(message.message, [apiKey]));
          socket.close();
          break;
        case "ignore":
          break;
        default: {
          const neverMessage: never = message;
          failure = new Error(`Unknown Deepgram message ${JSON.stringify(neverMessage)}`);
          socket.close();
        }
      }
    };

    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        handleRaw(event.data);
        return;
      }
      void payloadText(event.data).then(handleRaw).catch((error: unknown) => {
        failure = error instanceof Error ? error : new Error("Deepgram message failed");
        socket.close();
      });
    });
    socket.addEventListener("error", (event) => {
      const message = redactSecrets(event.message ?? "Deepgram socket error", [apiKey]);
      failure = new Error(message);
    });
    socket.addEventListener("close", () => {
      if (failure && parts.length === 0) finish(failure);
      else if (parts.length === 0) finish(new Error("Deepgram returned an empty transcript"));
      else finish();
    });
    socket.addEventListener("open", () => {
      void sendAudio().catch((error: unknown) => {
        finish(error instanceof Error ? error : new Error("Deepgram send failed"));
      });
    });

    async function sendAudio(): Promise<void> {
      const bytesPerChunk = Math.max(2, Math.floor((sampleRate * channels * 2) / 10));
      let offset = 0;
      while (offset < pcm.length) {
        if (settled) return;
        const end = Math.min(offset + bytesPerChunk, pcm.length);
        socket.send(pcm.subarray(offset, end));
        offset = end;
        if (offset < pcm.length) await delay(paceMs);
      }
      socket.send(JSON.stringify({ type: "CloseStream" }));
    }
  });
}

function nodeWebSocket(url: string, headers: Record<string, string>): DeepgramSocket {
  const Ctor = globalThis.WebSocket as unknown as new (
    url: string,
    options?: { headers?: Record<string, string> },
  ) => WebSocket;
  const ws = new Ctor(url, { headers });
  return {
    send(data: string | Buffer) {
      ws.send(typeof data === "string" ? data : Uint8Array.from(data));
    },
    close() {
      ws.close();
    },
    addEventListener(type, listener) {
      if (type === "message") {
        ws.addEventListener("message", (event) => listener({ data: event.data }));
        return;
      }
      if (type === "error") {
        ws.addEventListener("error", (event) => {
          const message = "message" in event && typeof event.message === "string" ? event.message : "Deepgram socket error";
          listener({ message });
        });
        return;
      }
      if (type === "close") {
        ws.addEventListener("close", (event) => listener({ code: event.code, reason: event.reason }));
        return;
      }
      ws.addEventListener("open", () => listener({}));
    },
  };
}

async function payloadText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.text();
  return "";
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
