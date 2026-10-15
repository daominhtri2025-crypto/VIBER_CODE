import { NextResponse, type NextRequest } from "next/server";
import { refreshTokens } from "@/lib/server/session";

/** GET /bff/auth/refresh?next=/path — used by server layouts when the access token expired. */
export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const ok = await refreshTokens();
  // Relative Location: behind a reverse proxy / Codespaces port forwarding, req.url carries the
  // internal host (localhost:3000), so an absolute redirect would leave the public origin.
  const location = ok ? safeNext : `/login?next=${encodeURIComponent(safeNext)}`;
  return new NextResponse(null, { status: 307, headers: { Location: location } });
}
