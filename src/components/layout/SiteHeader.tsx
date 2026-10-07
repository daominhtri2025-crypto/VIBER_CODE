import Link from "next/link";
import { signOut } from "@/features/auth/actions";
import { getCurrentUser } from "@/features/auth/session";

const linkClass =
  "rounded-md px-3 py-2 font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// Điều hướng Lộ trình/Khóa học/Bài tập bổ sung khi các trang đó tồn tại (TASK-008+), tránh link chết.
export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-primary">
          Coding Academy
        </Link>
        <nav aria-label="Tài khoản" className="flex flex-wrap items-center gap-1">
          {user ? (
            <>
              <Link href="/dashboard" className={linkClass}>
                {user.displayName}
              </Link>
              <form action={signOut}>
                <button type="submit" className={linkClass}>
                  Đăng xuất
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className={linkClass}>
                Đăng nhập
              </Link>
              <Link href="/register" className={`${linkClass} bg-primary text-white hover:bg-blue-700`}>
                Đăng ký
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
