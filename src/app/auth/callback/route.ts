import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/features/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Nhận link xác thực email (luồng PKCE): đổi `code` lấy session rồi chuyển tới `next` nội bộ.
 * Link lỗi/hết hạn/mở ở trình duyệt khác → về trang đăng nhập kèm hướng dẫn.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    console.error("auth.callback exchange failed", { code: error.code, status: error.status });
  }

  // Link khôi phục lỗi → trang yêu cầu link mới; link xác thực email lỗi → trang đăng nhập.
  const fallback = next === "/reset-password" ? "/forgot-password?error=link" : "/login?error=link";
  return NextResponse.redirect(new URL(fallback, origin));
}
