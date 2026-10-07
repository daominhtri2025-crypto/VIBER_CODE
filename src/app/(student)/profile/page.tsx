import type { Metadata } from "next";
import { requireUser } from "@/features/auth/guards";
import { ChangePasswordForm } from "@/features/profile/components/ChangePasswordForm";
import { DisplayNameForm } from "@/features/profile/components/DisplayNameForm";

export const metadata: Metadata = { title: "Hồ sơ — Coding Academy" };

export default async function ProfilePage() {
  const user = await requireUser("/profile");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-12">
      <h1 className="text-2xl font-bold">Hồ sơ của tôi</h1>

      <section aria-labelledby="account-heading" className="flex flex-col gap-2">
        <h2 id="account-heading" className="text-lg font-semibold">
          Tài khoản
        </h2>
        <dl>
          <dt className="font-medium">Email</dt>
          <dd className="text-slate-700">{user.email ?? "—"}</dd>
        </dl>
      </section>

      <section aria-labelledby="name-heading" className="flex flex-col gap-3">
        <h2 id="name-heading" className="text-lg font-semibold">
          Tên hiển thị
        </h2>
        <DisplayNameForm currentName={user.displayName} />
      </section>

      <section aria-labelledby="password-heading" className="flex flex-col gap-3">
        <h2 id="password-heading" className="text-lg font-semibold">
          Đổi mật khẩu
        </h2>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
