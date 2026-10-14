import { NextResponse } from "next/server";
import { API_URL, writeTokens, type TokenPair } from "@/lib/server/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await fetch(`${API_URL}/auth/google`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id_token: String(body.credential ?? "") }), cache: "no-store",
  });
  if (!r.ok) return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
  await writeTokens((await r.json()) as TokenPair);
  return NextResponse.json({ ok: true });
}
