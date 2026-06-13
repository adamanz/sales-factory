// Slack posting via bot token (xoxb-). The relay executes the agent's `slack_post`
// custom tool. Needs SLACK_BOT_TOKEN with chat:write, bot invited to the channel.
export async function postMessage(opts: { channel: string; text?: string; blocks?: any; thread_ts?: string }) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "SLACK_BOT_TOKEN not set", ts: null };
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: opts.channel, text: opts.text || " ", blocks: opts.blocks, thread_ts: opts.thread_ts }),
  });
  const j = await res.json();
  return j.ok ? { ok: true, ts: j.ts as string, channel: j.channel as string } : { ok: false, error: j.error, ts: null };
}
