import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";

export const metadata: Metadata = { title: "Quên mật khẩu — Coding Academy" };

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  const { error } = await props.searchParams;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Quên mật khẩu</h1>
      {error === "link" ? (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          Liên kết đặt lại mật khẩu không hợp lệ, đã hết hạn hoặc đã được dùng. Hãy nhập email để nhận liên kết mới.
        </p>
      ) : (
        <p>Nhập email đã đăng ký. Chúng tôi sẽ gửi liên kết để đặt mật khẩu mới.</p>
      )}
      <ForgotPasswordForm />
      <p>
        <Link href="/login" className="font-medium text-primary underline">
          Quay lại đăng nhập
        </Link>
      </p>
    </main>
  );
}
