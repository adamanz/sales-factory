"use client";

import { DeckDialog } from "@/components/demo/deck-dialog";
import { money } from "@/lib/demo/format";
import type { DemoCall } from "@/lib/demo/types";

export function QuoteBoard({
  call,
  quotesReady,
  acceptedQuoteId,
  onAccept,
}: {
  call: DemoCall;
  quotesReady: boolean;
  acceptedQuoteId: string | null;
  onAccept: (quoteId: string, quoteName: string) => void;
}) {
  if (call.quotes.length === 0) {
    return (
      <section className="sf-panel sf-quotes" data-tour="quotes" aria-label="Quotes">
        <h2>Quote</h2>
        <p className="sf-quiet">No quote on {call.account}. Acme Robotics is the call with Lean and Full.</p>
      </section>
    );
  }

  return (
    <section className="sf-panel sf-quotes" data-tour="quotes" aria-label="Quotes">
      <h2>Quote</h2>
      {!quotesReady ? <p className="sf-quiet">The prices stay visible during replay. They count as delivered at the end of the call.</p> : null}
      {call.quotes.map((quote) => {
        const accepted = acceptedQuoteId === quote.id;
        return (
          <article key={quote.id} className={`sf-quote${quote.recommended ? " is-rec" : ""}${accepted ? " is-accepted" : ""}${quotesReady ? "" : " is-pending"}`}>
            {quote.recommended ? <span className="sf-ribbon">Recommended</span> : null}
            <h3 className="sf-section-title">{quote.name}</h3>
            <div className="sf-price">{money(quote.total)}</div>
            <p className="sf-quiet">{quote.summary}</p>
            <button
              className="sf-btn-small"
              type="button"
              disabled={accepted}
              onClick={() => onAccept(quote.id, quote.name)}
            >
              {accepted ? "Accepted in this demo" : `Accept ${quote.name} in this demo`}
            </button>
          </article>
        );
      })}
      <div className="sf-cta-row">
        {call.id === "acme" ? <DeckDialog /> : null}
        <a className="sf-textlink" href={`/demo/offer?call=${call.id}`}>Open the order form</a>
      </div>
    </section>
  );
}
