// Recall.ai helpers — post-call transcript fetch (NO public tunnel needed).
// Verified shapes (see scripts/recall-test.ts): GET /bot/{id}/ -> recordings[].media_shortcuts
// .transcript.data.download_url (signed S3) -> { segments: [{ speaker|participant, words[].text | text }] }.
const KEY = () => process.env.RECALL_API_KEY!;
const REGION = () => process.env.RECALL_REGION || "us-east-1";
const BASE = () => `https://${REGION()}.recall.ai/api/v1`;

export async function getBot(botId: string) {
  const res = await fetch(`${BASE()}/bot/${botId}/`, { headers: { Authorization: `Token ${KEY()}` } });
  if (!res.ok) throw new Error(`Recall getBot ${res.status}: ${await res.text()}`);
  return res.json();
}

export function botStatus(bot: any): string {
  return bot?.status_changes?.at?.(-1)?.code || bot?.status?.code || bot?.recordings?.at?.(-1)?.status?.code || "unknown";
}

// start/end are seconds from call start, present only when the source carries word timestamps.
export type Turn = { speaker: string; text: string; start?: number; end?: number };

export async function getTranscript(botId: string): Promise<Turn[]> {
  const bot = await getBot(botId);
  let url: string | undefined;
  for (const rec of bot?.recordings || []) url = rec?.media_shortcuts?.transcript?.data?.download_url || url;
  if (!url) return [];
  const data = await (await fetch(url)).json().catch(() => null); // signed S3 URL — no auth header
  const segs = Array.isArray(data) ? data : data?.segments || data?.data?.segments || data?.transcript || [];
  return segmentsToTurns(segs);
}

const wordTime = (t: any): number | undefined => {
  const v = typeof t === "number" ? t : t?.relative;
  return typeof v === "number" ? v : undefined;
};

export function segmentsToTurns(segs: any[]): Turn[] {
  return segs
    .map((s) => {
      const words = Array.isArray(s.words) ? s.words : null;
      const turn: Turn = {
        speaker: s.speaker || s.participant?.name || `Speaker ${s.speaker_id ?? ""}`.trim(),
        text: words ? words.map((w: any) => w.text).join(" ") : s.text || "",
      };
      const start = words ? wordTime(words[0]?.start_timestamp) : wordTime(s.start);
      const end = words ? wordTime(words.at(-1)?.end_timestamp) : wordTime(s.end);
      if (start !== undefined && end !== undefined) Object.assign(turn, { start, end });
      return turn;
    })
    .filter((t) => t.text);
}
