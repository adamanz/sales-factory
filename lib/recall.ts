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

export type Turn = { speaker: string; text: string };

export async function getTranscript(botId: string): Promise<Turn[]> {
  const bot = await getBot(botId);
  let url: string | undefined;
  for (const rec of bot?.recordings || []) url = rec?.media_shortcuts?.transcript?.data?.download_url || url;
  if (!url) return [];
  const data = await (await fetch(url)).json().catch(() => null); // signed S3 URL — no auth header
  const segs = Array.isArray(data) ? data : data?.segments || data?.data?.segments || data?.transcript || [];
  return (segs as any[])
    .map((s) => ({
      speaker: s.speaker || s.participant?.name || `Speaker ${s.speaker_id ?? ""}`.trim(),
      text: Array.isArray(s.words) ? s.words.map((w: any) => w.text).join(" ") : s.text || "",
    }))
    .filter((t) => t.text);
}
