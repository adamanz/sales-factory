import { NextRequest } from "next/server";
import { artifacts } from "@/lib/artifacts";
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const html = artifacts.get(`quote:${id}`);
  if (!html) return new Response("Not found", { status: 404 });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
