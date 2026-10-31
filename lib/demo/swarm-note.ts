import { PEER_FILES } from "./assemble";

export const SWARM_NOTE = {
  from: "onboarding-demo",
  repo: "adamanz/sales-factory",
  sendsEnabled: false,
  paths: {
    landing: "/",
    walkthrough: "/start",
    workspace: "/demo?call=acme",
    orderForm: "/demo/offer?call=acme",
    payload: "/api/demo/workspace",
  },
  peerFiles: PEER_FILES,
  summary:
    "Self-serve demo is on / and /start, then /demo. Acme Robotics has Lean at $100,000 and Full at $185,000, with 40 seats at $0. Northwind Logistics and Brightline Health are the other sample calls. Coaching tips, nudges, and meeting times ship as samples. Accept and hold stay in the browser. Drop JSON at the peer file paths to replace a sample for the call ids in the file.",
} as const;
