"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Meter } from "@/components/demo/meter";
import { ONBOARDING_STEPS, ONBOARDING_STORAGE_KEY } from "@/lib/demo/onboarding";

type Mode = "steps" | "returning";

export function StartFlow() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("steps");
  const [index, setIndex] = useState(0);
  const step = ONBOARDING_STEPS[index];
  const last = index === ONBOARDING_STEPS.length - 1;

  useEffect(() => {
    const seen = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
    setMode(seen ? "returning" : "steps");
  }, []);

  function finish() {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    router.push("/demo?tour=1&call=acme");
  }

  return (
    <>
      <a className="sf-skip" href="#content">Skip to content</a>
      <header className="sf-top">
        <a className="sf-mark" href="/">Sales Factory</a>
        <nav className="sf-nav" aria-label="Primary">
          <a href="/demo?call=acme&tour=0">Skip to the quote</a>
        </nav>
      </header>
      <main id="content" className="sf-start">
        {mode === "returning" ? (
          <section className="sf-card">
            <p className="sf-kicker">Sample workspace</p>
            <h1>The Acme quotes are still loaded.</h1>
            <p>Full is $185,000, with 40 seats at $0. You can go straight to that page or replay these three screens.</p>
            <div className="sf-cta-row">
              <button className="sf-btn" type="button" onClick={finish}>Enter the workspace</button>
              <button className="sf-btn-ghost" type="button" onClick={() => { setIndex(0); setMode("steps"); }}>
                Replay the intro
              </button>
            </div>
          </section>
        ) : null}
        {mode === "steps" ? (
          <section className="sf-card" aria-labelledby="step-title">
            <p className="sf-kicker">Step {index + 1} of {ONBOARDING_STEPS.length}</p>
            <Meter value={((index + 1) / ONBOARDING_STEPS.length) * 100} label="Walkthrough progress" />
            <h1 id="step-title">{step.title}</h1>
            <p>{step.body}</p>
            <div className="sf-cta-row">
              {index > 0 ? (
                <button className="sf-btn-ghost" type="button" onClick={() => setIndex((current) => current - 1)}>Back</button>
              ) : null}
              {last ? (
                <button className="sf-btn" type="button" onClick={finish}>Enter the workspace</button>
              ) : (
                <button className="sf-btn" type="button" onClick={() => setIndex((current) => current + 1)}>Next</button>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}
