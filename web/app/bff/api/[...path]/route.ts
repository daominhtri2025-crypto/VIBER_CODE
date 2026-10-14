import { NextResponse, type NextRequest } from "next/server";
import { API_URL, readTokens, refreshTokens } from "@/lib/server/session";

/**
 * Same-origin proxy to the FastAPI backend. Adds the bearer token from the
 * httpOnly cookie, refreshes once on 401, and requires a custom header on
 * mutating requests (CSRF defence in depth on top of SameSite=Lax).
 */
const PATH_RE = /^[A-Za-z0-9._~\-/]+$/;

async function forward(req: NextRequest, path: string[], method: string) {
  const joined = path.join("/");
  if (!PATH_RE.test(joined) || joined.includes("..")) {
    return NextResponse.json({ error: "BAD_PATH" }, { status: 400 });
  }
  if (method !== "GET" && req.headers.get("x-mt-client") !== "web") {
    return NextResponse.json({ error: "CSRF" }, { status: 403 });
  }
  const url = `${API_URL}/${joined}${req.nextUrl.search}`;
  const body = method === "GET" ? undefined : await req.text();
  const send = (token?: string) => fetch(url, {
    method, body, cache: "no-store",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  let { access } = await readTokens();
  let r = await send(access);
  if (r.status === 401) {
    access = (await refreshTokens()) ?? undefined;
    if (access) r = await send(access);
  }
  const headers = new Headers();
  for (const h of ["content-type", "content-disposition", "idempotent-replay", "retry-after"]) {
    const v = r.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(r.status === 204 ? null : await r.arrayBuffer(), { status: r.status, headers });
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(req: NextRequest, ctx: Ctx) { return forward(req, (await ctx.params).path, "GET"); }
export async function POST(req: NextRequest, ctx: Ctx) { return forward(req, (await ctx.params).path, "POST"); }
export async function PUT(req: NextRequest, ctx: Ctx) { return forward(req, (await ctx.params).path, "PUT"); }
export async function PATCH(req: NextRequest, ctx: Ctx) { return forward(req, (await ctx.params).path, "PATCH"); }
