import "server-only";
import { cookies } from "next/headers";

/**
 * Backend-for-frontend token handling: the browser NEVER sees JWTs.
 * Access and refresh tokens live in httpOnly, SameSite=Lax cookies; client
 * code calls same-origin /bff/* routes which attach the Authorization header.
 */
export const ACCESS_COOKIE = "mt_access";
export const REFRESH_COOKIE = "mt_refresh";

export const API_URL = (process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";
const SECURE = (process.env.COOKIE_SECURE ?? "false") === "true";

export type TokenPair = { access_token: string; refresh_token: string; expires_in: number };

export async function readTokens(): Promise<{ access?: string; refresh?: string }> {
  const jar = await cookies();
  return { access: jar.get(ACCESS_COOKIE)?.value, refresh: jar.get(REFRESH_COOKIE)?.value };
}

export async function writeTokens(pair: TokenPair): Promise<void> {
  const jar = await cookies();
  const base = { httpOnly: true, sameSite: "lax" as const, secure: SECURE, path: "/" };
  jar.set(ACCESS_COOKIE, pair.access_token, { ...base, maxAge: pair.expires_in });
  jar.set(REFRESH_COOKIE, pair.refresh_token, { ...base, path: "/bff", maxAge: 14 * 24 * 3600 });
}

export async function clearTokens(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.set(REFRESH_COOKIE, "", { path: "/bff", maxAge: 0 });
}

/** Rotate tokens with the refresh cookie. Returns the new access token or null. */
export async function refreshTokens(): Promise<string | null> {
  const { refresh } = await readTokens();
  if (!refresh) return null;
  const r = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }), cache: "no-store",
  });
  if (!r.ok) { await clearTokens(); return null; }
  const pair = (await r.json()) as TokenPair;
  await writeTokens(pair);
  return pair.access_token;
}
