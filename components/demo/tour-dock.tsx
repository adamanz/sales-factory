"use client";

import { useEffect, useRef } from "react";
import { TOUR_STEPS } from "@/lib/demo/tour";

export function TourDock({
  step,
  onStep,
  onClose,
}: {
  step: number;
  onStep: (next: number) => void;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const current = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && event.target.closest(".sf-dialog")) return;
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onStep(Math.min(TOUR_STEPS.length - 1, step + 1));
      if (event.key === "ArrowLeft") onStep(Math.max(0, step - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep, step]);

  return (
    <aside className="sf-tour" aria-label="Guided tour">
      <p className="sf-kicker">Tour {step + 1} of {TOUR_STEPS.length}</p>
      <h2 ref={titleRef} tabIndex={-1}>{current.title}</h2>
      <p>{current.body}</p>
      <div className="sf-cta-row">
        {step > 0 ? (
          <button className="sf-btn-ghost" type="button" onClick={() => onStep(step - 1)}>Back</button>
        ) : null}
        {last ? (
          <button className="sf-btn" type="button" onClick={onClose}>Done</button>
        ) : (
          <button className="sf-btn" type="button" onClick={() => onStep(step + 1)}>Next</button>
        )}
        <button className="sf-btn-ghost" type="button" onClick={onClose}>Close tour</button>
      </div>
    </aside>
  );
}
