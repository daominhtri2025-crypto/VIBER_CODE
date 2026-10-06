import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getSupabasePublicEnv } from "./env";

/**
 * Client Supabase theo session của người dùng hiện tại, dùng trong Server Component,
 * Server Function và Route Handler. Mọi truy vấn đi qua RLS với quyền của người dùng.
 * Làm mới session ở proxy và xử lý đăng nhập thuộc TASK-005.
 */
export async function createSupabaseServerClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component không được ghi cookie (tài liệu Next.js: cookies.md).
          // Session sẽ được làm mới ở proxy/Server Function; bỏ qua có chủ đích tại đây.
        }
      },
    },
  });
}
