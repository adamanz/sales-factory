import type { DemoActionResult } from "./types";

export function stageAccept(quoteName: string): DemoActionResult {
  return {
    ok: true,
    delivered: false,
    channel: "browser",
    message: `${quoteName} is marked accepted in this demo. Salesforce was not updated.`,
  };
}

export function stageHold(slotLabel: string): DemoActionResult {
  return {
    ok: true,
    delivered: false,
    channel: "browser",
    message: `${slotLabel} is held in this demo. No invite was sent.`,
  };
}
