export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "64px auto", padding: 24 }}>
      <h1>🏭 Sales Factory</h1>
      <p>A Recall.ai bot joins a sales call → Claude coaches live in Slack → a swarm of agents builds
         real Salesforce <b>Quote</b> line items (modern AI pricing: discounted seats + usage pool + FDE + premium support),
         a clickable HTML deck, and an order form — then self-verifies against a rubric.</p>
      <ul>
        <li><code>POST /api/recall/replay</code> — run the scripted demo call</li>
        <li><code>GET /api/deck/[id]</code> — generated pitch deck</li>
        <li><code>GET /api/health</code></li>
      </ul>
    </main>
  );
}
