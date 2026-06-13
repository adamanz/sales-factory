export async function GET() {
  return Response.json({ ok: true, service: "sales-factory", ts: Date.now() });
}
