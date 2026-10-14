import { redirect } from "next/navigation";
import { ChangePassword } from "@/components/ChangePassword";
import { Shell } from "@/components/Shell";
import { fetchMe } from "@/lib/server/backend";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await fetchMe();
  if (!me) redirect("/bff/auth/refresh?next=/");
  return <Shell me={me}>{me.must_change_password ? <ChangePassword /> : children}</Shell>;
}
