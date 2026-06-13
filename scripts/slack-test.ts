// Standalone Slack integration smoke test.
// Verifies the bot token (auth.test) and posts a real message to SLACK_CHANNEL_ID
// using the same postMessage path the relay's `slack_post` tool uses.
//   tsx --env-file=.env.local scripts/slack-test.ts
import { postMessage } from "../lib/slack";

async function main() {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!token) throw new Error("SLACK_BOT_TOKEN not set");
  if (!channel) throw new Error("SLACK_CHANNEL_ID not set");

  // 1) Validate the token / identity.
  const auth = await (await fetch("https://slack.com/api/auth.test", {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  console.log("auth.test:", auth.ok ? `ok — team=${auth.team} user=${auth.user} bot=${auth.bot_id}` : `FAIL — ${auth.error}`);
  if (!auth.ok) process.exit(1);

  // 2) Open the call's root message (mirrors openCallThread).
  const root = await postMessage({ channel, text: ":factory: *Sales Factory* — live sales call: *Acme* (threading test)" });
  console.log("root post:", root);
  if (!root.ok) process.exit(1);

  // 3) Two agent coaching nudges, both pinned into the call thread (mirrors slackPost).
  const reply1 = await postMessage({ channel, thread_ts: root.ts!, text: "💡 PRICING: Lead with free seats — anchor the number on the usage pool." });
  const reply2 = await postMessage({
    channel, thread_ts: root.ts!, text: "Order form",
    blocks: [{ type: "section", text: { type: "mrkdwn", text: "*OBJECTION (price):* 40 seats at 100% off; commit to the usage pool." } }],
  });
  console.log("reply1:", reply1);
  console.log("reply2:", reply2);
  if (!reply1.ok || !reply2.ok) process.exit(1);

  console.log(`\nDone. Channel ${channel} should show ONE root message with two threaded replies.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
