import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabasePublicEnv } from "./env";

/**
 * Client không đọc/ghi cookie, dùng ở server cho thao tác một lần (ví dụ xác minh mật khẩu hiện tại)
 * mà không làm thay đổi session của người dùng. Vẫn dùng publishable key và RLS.
 */
export function createSupabaseStatelessClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
