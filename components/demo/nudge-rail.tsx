"use client";

import { VisuallyHidden } from "radix-ui";
import { triggerLabel } from "@/lib/demo/format";
import { callSecond, isVisibleAt } from "@/lib/demo/playback";
import type { DemoCall } from "@/lib/demo/types";

export function NudgeRail({ call, elapsed }: { call: DemoCall; elapsed: number }) {
  const second = callSecond(elapsed, call.durationSec);
  const nudges = call.nudges.filter((nudge) => isVisibleAt(nudge.atSec, second));
  const latest = nudges[nudges.length - 1];

  return (
    <section className="sf-panel sf-nudges" data-tour="nudges" aria-label="Nudges">
      <h2>Nudges</h2>
      <p className="sf-quiet">{nudges.length === 0 ? "Nudges show up as the replay reaches them." : `${nudges.length} on this part of the call.`}</p>
      <VisuallyHidden.Root aria-live="polite">
        {latest ? `${triggerLabel(latest.trigger)}. ${latest.text}` : ""}
      </VisuallyHidden.Root>
      {nudges.map((nudge) => (
        <article className="sf-nudge" key={nudge.id}>
          <span className="sf-tag">{triggerLabel(nudge.trigger)}</span>
          <p>{nudge.text}</p>
        </article>
      ))}
    </section>
  );
}
