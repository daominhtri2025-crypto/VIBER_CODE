import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/features/auth/components/SignUpForm";
import { safeNextPath } from "@/features/auth/redirect";
import { getCurrentUser } from "@/features/auth/session";

export const metadata: Metadata = { title: "Đăng ký — Coding Academy" };

export default async function RegisterPage(props: PageProps<"/register">) {
  const searchParams = await props.searchParams;
  const next = safeNextPath(searchParams.next);
  if (await getCurrentUser()) redirect(next);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Tạo tài khoản</h1>
      <SignUpForm next={next} />
      <p>
        Đã có tài khoản?{" "}
        <Link href={{ pathname: "/login", query: { next } }} className="font-medium text-primary underline">
          Đăng nhập
        </Link>
      </p>
    </main>
  );
}
