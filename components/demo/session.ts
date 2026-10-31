"use client";

import { useEffect, useState } from "react";

export const SESSION_KEY = "sf.demo.session";

export type DemoSession = {
  acceptedQuoteId: string | null;
  heldSlotByCall: Record<string, string>;
};

export const EMPTY_SESSION: DemoSession = { acceptedQuoteId: null, heldSlotByCall: {} };

export function readSession(): DemoSession {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return EMPTY_SESSION;
    const parsed = JSON.parse(raw) as Partial<DemoSession>;
    const held = parsed.heldSlotByCall;
    return {
      acceptedQuoteId: typeof parsed.acceptedQuoteId === "string" ? parsed.acceptedQuoteId : null,
      heldSlotByCall: held && typeof held === "object" ? held : {},
    };
  } catch {
    return EMPTY_SESSION;
  }
}

export function writeSession(next: DemoSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
}

export function useDemoSession() {
  const [session, setSession] = useState<DemoSession>(EMPTY_SESSION);
  useEffect(() => {
    setSession(readSession());
  }, []);

  function acceptQuote(quoteId: string) {
    const next = { ...readSession(), acceptedQuoteId: quoteId };
    writeSession(next);
    setSession(next);
  }

  function holdSlot(callId: string, slotId: string) {
    const current = readSession();
    const next = { ...current, heldSlotByCall: { ...current.heldSlotByCall, [callId]: slotId } };
    writeSession(next);
    setSession(next);
  }

  return { session, acceptQuote, holdSlot };
}
