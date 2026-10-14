"use client";

export function LogoutButton() {
  return (
    <button type="button" className="rounded-md px-3 py-2 text-ink hover:bg-[#eef2f8]"
      onClick={async () => {
        await fetch("/bff/auth/logout", { method: "POST" });
        window.location.href = "/login";
      }}>
      Đăng xuất
    </button>
  );
}
