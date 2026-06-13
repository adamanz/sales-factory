// Batches raw Recall transcript chunks by speaker-turn / ~15s window before
// forwarding to the agent as a single user.message (cuts session turns ~10x).
type Chunk = { speaker: string; text: string; ts: number };
const buffers = new Map<string, { chunks: Chunk[]; timer: NodeJS.Timeout | null }>();
const WINDOW_MS = 15_000;

export function pushChunk(botId: string, chunk: Chunk, flush: (text: string) => void) {
  let b = buffers.get(botId);
  if (!b) { b = { chunks: [], timer: null }; buffers.set(botId, b); }
  b.chunks.push(chunk);
  if (!b.timer) b.timer = setTimeout(() => doFlush(botId, flush), WINDOW_MS);
}
export function doFlush(botId: string, flush: (text: string) => void) {
  const b = buffers.get(botId);
  if (!b || b.chunks.length === 0) return;
  const text = b.chunks.map((c) => `[${c.speaker}] ${c.text}`).join("\n");
  b.chunks = []; if (b.timer) { clearTimeout(b.timer); b.timer = null; }
  flush(text);
}
