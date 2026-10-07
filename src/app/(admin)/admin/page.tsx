import type { Metadata } from "next";
import { requireAdmin } from "@/features/auth/guards";

export const metadata: Metadata = { title: "Quản trị — Coding Academy" };

// Bản tối thiểu để kiểm chứng bảo vệ route; tổng quan nội dung thuộc TASK-017.
export default async function AdminHomePage() {
  const admin = await requireAdmin("/admin");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-12">
      <p className="w-fit rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-900">
        Khu quản trị đang xây dựng — chưa có chức năng
      </p>
      <h1 className="text-2xl font-bold">Quản trị</h1>
      <p>Xin chào {admin.displayName}. Quản lý khóa học, bài học và bài tập sẽ có tại đây.</p>
    </main>
  );
}
