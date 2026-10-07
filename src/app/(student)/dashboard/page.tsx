import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/session";

export const metadata: Metadata = { title: "Trang của tôi — Coding Academy" };

// Bản tối thiểu để có đích sau đăng nhập; nội dung đầy đủ thuộc TASK-016.
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-12">
      <p className="w-fit rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-900">
        Trang đang xây dựng — chưa có danh sách khóa học
      </p>
      <h1 className="text-2xl font-bold">Xin chào, {user.displayName}!</h1>
      <p>Bạn đã đăng nhập. Các khóa học đã đăng ký và nút &quot;Học tiếp&quot; sẽ hiển thị tại đây.</p>
    </main>
  );
}
