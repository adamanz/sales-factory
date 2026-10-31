import { OrderForm } from "@/components/demo/order-form";
import { findCall } from "@/lib/demo/assemble";
import { loadDemoWorkspace } from "@/lib/demo/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sample order form · Sales Factory" };

export default async function OfferPage({ searchParams }: { searchParams: Promise<{ call?: string }> }) {
  const params = await searchParams;
  const workspace = loadDemoWorkspace();
  const known = workspace.calls.some((call) => call.id === params.call);
  const call = findCall(workspace, params.call);

  return (
    <>
      <a className="sf-skip" href="#content">Skip to content</a>
      <header className="sf-top">
        <a className="sf-mark" href="/">Sales Factory</a>
        <nav className="sf-nav" aria-label="Primary">
          <a href={`/demo?call=${call.id}`}>Back to the workspace</a>
        </nav>
      </header>
      <main id="content" className="sf-offer">
        <p className="sf-kicker">Sample order form</p>
        <h1>{call.account}</h1>
        <p className="sf-lede">
          {call.prospect}, {call.prospectTitle}.
          {call.quotes.length > 0
            ? " Accepting an option marks it in this browser. Salesforce is not updated."
            : " This call has no quote. Acme Robotics has the order form."}
        </p>
        {!known && params.call ? <p className="sf-unknown">That call is not in the sample workspace. Showing {call.account}.</p> : null}
        <OrderForm call={call} />
      </main>
    </>
  );
}
