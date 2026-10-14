import "server-only";
import { API_URL, readTokens } from "./session";

export type Me = { id: string; display_name: string; roles: string[]; username: string | null;
  must_change_password: boolean; google_linked: boolean; email: string | null };

/** Server-component read of the current user. Returns null when the access token is missing/expired
 *  (server components cannot set cookies, so the layout redirects through /bff/auth/refresh). */
export async function fetchMe(): Promise<Me | null> {
  const { access } = await readTokens();
  if (!access) return null;
  const r = await fetch(`${API_URL}/me`, { headers: { authorization: `Bearer ${access}` }, cache: "no-store" });
  return r.ok ? ((await r.json()) as Me) : null;
}

export function homeFor(roles: string[]): string {
  if (roles.includes("student")) return "/hoc";
  if (roles.includes("teacher")) return "/giao-vien";
  if (roles.includes("researcher")) return "/nghien-cuu";
  if (roles.includes("admin")) return "/quan-tri";
  return "/login";
}
