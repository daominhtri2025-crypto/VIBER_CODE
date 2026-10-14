import { redirect } from "next/navigation";
import { fetchMe, homeFor } from "@/lib/server/backend";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await fetchMe();
  redirect(me ? homeFor(me.roles) : "/bff/auth/refresh?next=/");
}
