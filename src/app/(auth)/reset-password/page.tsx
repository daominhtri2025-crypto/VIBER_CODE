import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/features/auth/components/ResetPasswordForm";
import { hasRecoverySession } from "@/features/auth/session";

export const metadata: Metadata = { title: "Đặt mật khẩu mới — Coding Academy" };

export default async function ResetPasswordPage() {
  const allowed = await hasRecoverySession();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Đặt mật khẩu mới</h1>
      {allowed ? (
        <ResetPasswordForm />
      ) : (
        <div role="status" className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          <p>Trang này chỉ mở được từ liên kết đặt lại mật khẩu gửi qua email, trong vòng 1 giờ.</p>
          <Link href="/forgot-password" className="font-medium text-primary underline">
            Yêu cầu liên kết mới
          </Link>
        </div>
      )}
    </main>
  );
}
