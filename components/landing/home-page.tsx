import { money } from "@/lib/demo/format";
import { demoCalls } from "@/lib/demo/seed";

export function HomePage() {
  const acme = demoCalls[0];
  const full = acme.quotes.find((quote) => quote.recommended);
  const lean = acme.quotes.find((quote) => !quote.recommended);
  if (!full || !lean) return null;

  return (
    <>
      <a className="sf-skip" href="#content">Skip to content</a>
      <header className="sf-top">
        <a className="sf-mark" href="/">Sales Factory</a>
        <nav className="sf-nav" aria-label="Primary">
          <a className="sf-nav-extra" href="/start">Walkthrough</a>
          <a className="sf-btn" href="/demo?tour=1&call=acme">Open the workspace</a>
        </nav>
      </header>
      <main id="content" className="sf-wrap">
        <section className="sf-landing">
          <div>
            <p className="sf-kicker">Sample workspace</p>
            <h1>Acme asked for two quotes. They are already written.</h1>
            <p className="sf-lede">
              Open three sample calls. Acme Robotics has the transcript, a coaching tip on the lines that mattered, and the nudges a rep could have used. Full is {money(full.total)}. The walkthrough takes about two minutes. The prices are on the first screen.
            </p>
            <div className="sf-cta-row">
              <a className="sf-btn" href="/start">Start the walkthrough</a>
              <a className="sf-btn-ghost" href="/demo?call=acme&tour=0">Skip to the quote</a>
            </div>
            <dl className="sf-stats">
              <div>
                <dt>Lean</dt>
                <dd>{money(lean.total)}</dd>
              </div>
              <div>
                <dt>Full, recommended</dt>
                <dd>{money(full.total)}</dd>
              </div>
              <div>
                <dt>Seats</dt>
                <dd>40 at $0</dd>
              </div>
            </dl>
          </div>
          <aside className="sf-ticket" aria-label="Acme call slip">
            <div className="sf-ticket-top">
              <span>Call slip</span>
              <span>Sample</span>
            </div>
            <h2>{acme.account}</h2>
            <p>{acme.prospect}, {acme.prospectTitle}</p>
            <table className="sf-lines">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Full option</th>
                </tr>
              </thead>
              <tbody>
                {full.lines.map((line) => (
                  <tr key={line.sku}>
                    <td>{line.name}</td>
                    <td className={line.discount >= 100 ? "sf-zero" : undefined}>
                      {line.discount >= 100 ? "$0" : money(line.quantity * line.unitPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="sf-total">
              <span>Annual total</span>
              <strong>{money(full.total)}</strong>
            </div>
          </aside>
        </section>
        <section className="sf-path" aria-labelledby="path-title">
          <h2 id="path-title">What the two minutes include</h2>
          <ol className="sf-steps">
            <li>
              <span>01</span>
              <strong>Three calls, already loaded</strong>
              <p>{demoCalls.map((call) => call.account).join(", ")}.</p>
            </li>
            <li>
              <span>02</span>
              <strong>Coaching, then the short nudge</strong>
              <p>A tip quotes the line. A nudge is the one sentence the rep could say next.</p>
            </li>
            <li>
              <span>03</span>
              <strong>The order form, still in the browser</strong>
              <p>Accept marks the option here. Slack, email, and Salesforce are not called.</p>
            </li>
          </ol>
          <p className="sf-foot">
            This path does not start a live relay run. The scripted relay demo is still <code>POST /api/recall/replay</code>. Meeting times on the workspace are samples until Slot Finder is connected.
          </p>
        </section>
      </main>
    </>
  );
}
