import { notFound, redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./session";

/** Mã lỗi chuẩn cho server action (SITEMAP §2). */
export type ActionErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION";

export const ACTION_ERROR_MESSAGES: Record<ActionErrorCode, string> = {
  UNAUTHENTICATED: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  NOT_FOUND: "Không tìm thấy nội dung.",
  VALIDATION: "Thông tin chưa hợp lệ. Hãy kiểm tra các ô được đánh dấu.",
};

/** Trang cần đăng nhập: chưa đăng nhập → /login?next=<đường dẫn hiện tại>. */
export async function requireUser(currentPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  return user;
}

/** Trang quản trị: chưa đăng nhập → đăng nhập; không phải admin → 404 (không lộ sự tồn tại). */
export async function requireAdmin(currentPath: string): Promise<CurrentUser> {
  const user = await requireUser(currentPath);
  if (!user.isAdmin) notFound();
  return user;
}
