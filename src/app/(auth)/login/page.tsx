import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/features/auth/components/SignInForm";
import { safeNextPath } from "@/features/auth/redirect";
import { getCurrentUser } from "@/features/auth/session";

export const metadata: Metadata = { title: "Đăng nhập — Coding Academy" };

const NOTICES: Record<string, string> = {
  link: "Liên kết không hợp lệ, đã hết hạn hoặc được mở ở trình duyệt khác. Nếu bạn vừa xác thực email, hãy đăng nhập.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const next = safeNextPath(searchParams.next);
  if (await getCurrentUser()) redirect(next);

  const notice = typeof searchParams.error === "string" ? NOTICES[searchParams.error] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Đăng nhập</h1>
      {notice ? (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          {notice}
        </p>
      ) : null}
      <SignInForm next={next} />
      <p>
        <Link href="/forgot-password" className="font-medium text-primary underline">
          Quên mật khẩu?
        </Link>
      </p>
      <p>
        Chưa có tài khoản?{" "}
        <Link href={{ pathname: "/register", query: { next } }} className="font-medium text-primary underline">
          Đăng ký
        </Link>
      </p>
    </main>
  );
}
