// Call-coaching consent. The default is to announce recording before any
// transcription socket opens. "off" refuses transcription.
export const DEFAULT_CONSENT_MODE = "announce recording";
export const RECORDING_ANNOUNCEMENT = "This call is being recorded for coaching.";

export type ConsentMode = "announce recording" | "off";

type ConsentDecision =
  | { allow: true; announcement: string }
  | { allow: false };

export function resolveConsentMode(value: string | undefined | null): ConsentMode {
  if (value == null || value.trim() === "") return DEFAULT_CONSENT_MODE;
  const trimmed = value.trim();
  switch (trimmed) {
    case "announce recording":
    case "off":
      return trimmed;
    default:
      throw new Error(`Unknown coaching consent mode: ${trimmed}`);
  }
}

export function consentModeFromEnv(env: Record<string, string | undefined> = process.env): ConsentMode {
  return resolveConsentMode(env.COACHING_CONSENT_MODE);
}

export function consentDecision(mode: ConsentMode): ConsentDecision {
  switch (mode) {
    case "announce recording":
      return { allow: true, announcement: RECORDING_ANNOUNCEMENT };
    case "off":
      return { allow: false };
    default: {
      const neverMode: never = mode;
      throw new Error(`Unknown coaching consent mode: ${String(neverMode)}`);
    }
  }
}

export class AnnouncementPermit {
  #open = false;

  private constructor(readonly mode: ConsentMode) {}

  static async issue(
    mode: ConsentMode,
    announce: (announcement: string) => Promise<void>,
  ): Promise<AnnouncementPermit | null> {
    const decision = consentDecision(mode);
    if (!decision.allow) return null;
    const permit = new AnnouncementPermit(mode);
    await announce(decision.announcement);
    permit.#open = true;
    return permit;
  }

  assertOpen(): void {
    if (!this.#open) {
      throw new Error("Refusing to open Deepgram: recording announcement has not been delivered");
    }
  }
}

export async function runCoachingTranscription<T>(opts: {
  mode: ConsentMode;
  announce: (announcement: string) => Promise<void>;
  transcribe: (permit: AnnouncementPermit) => Promise<T>;
}): Promise<{ status: "refused" } | { status: "transcribed"; value: T }> {
  const permit = await AnnouncementPermit.issue(opts.mode, opts.announce);
  if (!permit) return { status: "refused" };
  const value = await opts.transcribe(permit);
  return { status: "transcribed", value };
}
