import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasFreshRecovery } from "./recovery";

export type CurrentUser = {
  id: string;
  email: string | null;
  displayName: string;
};

/**
 * Data Access Layer: người dùng hiện tại, xác minh bằng getClaims() (kiểm tra chữ ký JWT),
 * không dùng getSession() vì cookie do client kiểm soát. Ghi nhớ trong một lần render.
 * Chỉ trả các trường cần cho giao diện (DTO).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const id = data.claims.sub;
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", id).maybeSingle();

  return {
    id,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    displayName: profile?.display_name ?? "Học viên",
  };
});

/** Có session khôi phục mật khẩu còn hiệu lực không (dùng cho /reset-password và action đổi mật khẩu). */
export const hasRecoverySession = cache(async (): Promise<boolean> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return false;
  return hasFreshRecovery(data.claims.amr, Math.floor(Date.now() / 1000));
});
