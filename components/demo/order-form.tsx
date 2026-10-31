"use client";

import { stageAccept } from "@/lib/demo/actions";
import { lineTotal, money } from "@/lib/demo/format";
import type { DemoCall } from "@/lib/demo/types";
import { useState } from "react";
import { useDemoSession } from "./session";

export function OrderForm({ call }: { call: DemoCall }) {
  const { session, acceptQuote } = useDemoSession();
  const [notice, setNotice] = useState<string | null>(null);

  function accept(quoteId: string, quoteName: string) {
    const result = stageAccept(quoteName);
    acceptQuote(quoteId);
    setNotice(result.message);
  }

  if (call.quotes.length === 0) {
    return <p className="sf-note">This call has no quote. Open Acme Robotics for the order form.</p>;
  }

  return (
    <>
      {notice ? <p className="sf-status" role="status">{notice}</p> : null}
      <div className="sf-offer-grid">
        {call.quotes.map((quote) => {
          const accepted = session.acceptedQuoteId === quote.id;
          return (
            <article key={quote.id} className={`sf-offer-card${quote.recommended ? " is-rec" : ""}`}>
              {quote.recommended ? <span className="sf-ribbon">Recommended</span> : null}
              {accepted ? <span className="sf-ribbon">Accepted in this demo</span> : null}
              <h2>{quote.name}</h2>
              <p className="sf-price">{money(quote.total)}</p>
              <p>{quote.summary}</p>
              <table className="sf-lines">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Item</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lines.map((line) => (
                    <tr key={line.sku}>
                      <td>{line.sku}</td>
                      <td>{line.name} × {line.quantity}{line.discount >= 100 ? " · waived" : ""}</td>
                      <td className={lineTotal(line) === 0 ? "sf-zero" : undefined}>{money(lineTotal(line))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="sf-total"><span>Annual total</span><strong>{money(quote.total)}</strong></p>
              <button className="sf-btn" type="button" disabled={accepted} onClick={() => accept(quote.id, quote.name)}>
                {accepted ? "Accepted in this demo" : `Accept ${quote.name} in this demo`}
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}
