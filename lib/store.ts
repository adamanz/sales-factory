// Per-bot session state. In-memory for local/dev; swap for Vercel KV in prod.
export type CallState = {
  botId: string;
  sessionId?: string;
  slackThreadTs?: string;
  channelId?: string;
  opportunityId: string;
  memoryStoreId?: string;
  quoteIds: string[];
  deckId?: string;
};
const mem = new Map<string, CallState>();
export const store = {
  get: (botId: string) => mem.get(botId),
  set: (s: CallState) => void mem.set(s.botId, s),
  patch: (botId: string, p: Partial<CallState>) => {
    const cur = mem.get(botId); if (cur) mem.set(botId, { ...cur, ...p });
  },
  bySession: (sessionId: string) => [...mem.values()].find((s) => s.sessionId === sessionId),
};
