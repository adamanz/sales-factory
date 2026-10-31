"use client";

import { formatSlotRange } from "@/lib/demo/format";
import type { DemoCall } from "@/lib/demo/types";

export function SlotPicker({
  call,
  heldSlotId,
  onHold,
}: {
  call: DemoCall;
  heldSlotId: string | undefined;
  onHold: (slotId: string, label: string) => void;
}) {
  return (
    <section className="sf-panel sf-slots" data-tour="slots" aria-label="Meeting times">
      <h2>Follow-up times</h2>
      <p className="sf-quiet">Samples stand in for Slot Finder. Holding a time stays in this browser.</p>
      {call.slots.map((slot) => {
        const label = `${formatSlotRange(slot.start, slot.end)} with ${slot.withWhom}`;
        const held = heldSlotId === slot.id;
        return (
          <button
            key={slot.id}
            type="button"
            className={`sf-slot${held ? " is-held" : ""}`}
            aria-pressed={held}
            onClick={() => onHold(slot.id, label)}
          >
            <strong>{formatSlotRange(slot.start, slot.end)}</strong>
            <small>{slot.withWhom}{held ? " · Held in this demo" : ""}</small>
          </button>
        );
      })}
    </section>
  );
}
