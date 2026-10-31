export const ONBOARDING_STEPS = [
  {
    id: "loaded",
    title: "The workspace is already loaded",
    body: "Three sample calls are in it. Acme Robotics asked for two quotes. The transcript, the coaching, and the prices are already there.",
  },
  {
    id: "quote",
    title: "Read the quote first",
    body: "Lean is $100,000. Full is $185,000, and the 40 seats are $0. Replay runs about 50 seconds if you want the nudges in order. The prices are on screen either way.",
  },
  {
    id: "sends",
    title: "This demo does not send anything",
    body: "Accepting an option and holding a meeting time stay in this browser. The demo does not post to Slack, send email, or update Salesforce.",
  },
] as const;

export const ONBOARDING_STORAGE_KEY = "sf.demo.onboarded";
