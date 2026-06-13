// Stores agent-generated HTML artifacts (deck, per-option quotes) served at live URLs.
// In-memory for dev; swap for Vercel Blob/KV in prod.
const mem = new Map<string, string>();
export const artifacts = {
  put: (key: string, html: string) => void mem.set(key, html),
  get: (key: string) => mem.get(key),
};
