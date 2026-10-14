import { NextResponse, type NextRequest } from "next/server";
import { refreshTokens } from "@/lib/server/session";

/** GET /bff/auth/refresh?next=/path — used by server layouts when the access token expired. */
export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const ok = await refreshTokens();
  return NextResponse.redirect(new URL(ok ? safeNext : `/login?next=${encodeURIComponent(safeNext)}`, req.url));
}
