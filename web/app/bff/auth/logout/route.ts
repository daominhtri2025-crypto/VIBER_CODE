import { NextResponse } from "next/server";
import { API_URL, clearTokens, readTokens } from "@/lib/server/session";

export async function POST() {
  const { refresh } = await readTokens();
  if (refresh) {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }), cache: "no-store",
    }).catch(() => undefined);
  }
  await clearTokens();
  return NextResponse.json({ ok: true });
}
