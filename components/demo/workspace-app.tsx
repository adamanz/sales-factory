"use client";

import { useEffect, useRef, useState } from "react";
import { stageAccept, stageHold } from "@/lib/demo/actions";
import { money, sourceBanner } from "@/lib/demo/format";
import { PLAYBACK_MS, viewAt } from "@/lib/demo/playback";
import { TOUR_STEPS } from "@/lib/demo/tour";
import type { DemoWorkspace } from "@/lib/demo/types";
import { CallStage } from "./call-stage";
import { NudgeRail } from "./nudge-rail";
import { QuoteBoard } from "./quote-board";
import { useDemoSession } from "./session";
import { SlotPicker } from "./slot-picker";
import { TourDock } from "./tour-dock";

const TOUR_DONE_KEY = "sf.demo.tourDone";

export function WorkspaceApp({
  workspace,
  initialCallId,
  unknownCall,
  forceTour,
  skipTour,
  startAt,
}: {
  workspace: DemoWorkspace;
  initialCallId: string;
  unknownCall: boolean;
  forceTour: boolean;
  skipTour: boolean;
  startAt: "start" | "end";
}) {
  const [callId, setCallId] = useState(initialCallId);
  const [elapsed, setElapsed] = useState(startAt === "start" ? 0 : PLAYBACK_MS);
  const [playing, setPlaying] = useState(false);
  const [tourOpen, setTourOpen] = useState(forceTour);
  const [tourStep, setTourStep] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const elapsedRef = useRef(elapsed);
  const { session, acceptQuote, holdSlot } = useDemoSession();
  const call = workspace.calls.find((item) => item.id === callId) ?? workspace.calls[0];
  const view = viewAt(call, elapsed);

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  useEffect(() => {
    if (skipTour) {
      setTourOpen(false);
      return;
    }
    if (forceTour) return;
    if (window.localStorage.getItem(TOUR_DONE_KEY) !== "1") setTourOpen(true);
  }, [forceTour, skipTour]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(PLAYBACK_MS, elapsedRef.current + (now - last));
      last = now;
      elapsedRef.current = next;
      setElapsed(next);
      if (next >= PLAYBACK_MS) {
        setPlaying(false);
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    const id = tourOpen ? TOUR_STEPS[tourStep].id : "";
    document.querySelectorAll<HTMLElement>("[data-tour]").forEach((node) => {
      node.classList.toggle("is-current", node.dataset.tour === id);
    });
    if (id) document.querySelector<HTMLElement>(`[data-tour="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [tourOpen, tourStep, callId]);

  function selectCall(nextId: string) {
    setCallId(nextId);
    setPlaying(false);
    elapsedRef.current = PLAYBACK_MS;
    setElapsed(PLAYBACK_MS);
    setNotice(null);
  }

  function replay() {
    elapsedRef.current = 0;
    setElapsed(0);
    setPlaying(true);
  }

  function closeTour() {
    window.localStorage.setItem(TOUR_DONE_KEY, "1");
    setTourOpen(false);
  }

  function accept(quoteId: string, quoteName: string) {
    const result = stageAccept(quoteName);
    acceptQuote(quoteId);
    setNotice(result.message);
  }

  function hold(slotId: string, label: string) {
    const result = stageHold(label);
    holdSlot(call.id, slotId);
    setNotice(result.message);
  }

  return (
    <div className={tourOpen ? "sf-app is-touring" : "sf-app"}>
      <a className="sf-skip" href="#content">Skip to content</a>
      <header className="sf-appbar">
        <a className="sf-mark" href="/">Sales Factory</a>
        <div className="sf-appbar-actions">
          <span className="sf-quiet">Demo, nothing is sent</span>
          <button className="sf-btn-small" type="button" onClick={() => { setTourStep(0); setTourOpen(true); }}>
            Restart tour
          </button>
        </div>
      </header>
      <main id="content">
        <p className="sf-banner">{sourceBanner(workspace.sources)} Nothing on this page is sent.</p>
        {unknownCall ? <p className="sf-unknown">That call is not in the sample workspace. Showing {call.account}.</p> : null}
        {notice ? <p className="sf-status" role="status">{notice}</p> : null}
        <div className="sf-grid">
          <aside className="sf-panel sf-calls" data-tour="calls" aria-label="Calls">
            <h2>Calls</h2>
            <div className="sf-calllist">
              {workspace.calls.map((item) => {
                const recommended = item.quotes.find((quote) => quote.recommended);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === call.id ? "sf-call is-on" : "sf-call"}
                    aria-current={item.id === call.id ? "true" : undefined}
                    onClick={() => selectCall(item.id)}
                  >
                    <strong>{item.account}</strong>
                    <small>{item.outcome}</small>
                    {recommended ? <small>{money(recommended.total)} recommended</small> : null}
                  </button>
                );
              })}
            </div>
          </aside>
          <CallStage
            call={call}
            elapsed={elapsed}
            playing={playing}
            onReplay={replay}
            onToggle={() => setPlaying((current) => !current)}
          />
          <div className="sf-side">
            <QuoteBoard
              call={call}
              quotesReady={view.quotesReady}
              acceptedQuoteId={session.acceptedQuoteId}
              onAccept={accept}
            />
            <NudgeRail call={call} elapsed={elapsed} />
            <SlotPicker call={call} heldSlotId={session.heldSlotByCall[call.id]} onHold={hold} />
          </div>
        </div>
      </main>
      {tourOpen ? <TourDock step={tourStep} onStep={setTourStep} onClose={closeTour} /> : null}
    </div>
  );
}
