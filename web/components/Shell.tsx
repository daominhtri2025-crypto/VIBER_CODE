import Link from "next/link";
import { brand } from "@/lib/brand";
import type { Me } from "@/lib/server/backend";
import { LogoutButton } from "./LogoutButton";

const NAV: { role: string; href: string; label: string }[] = [
  { role: "student", href: "/hoc", label: "Bài của em" },
  { role: "teacher", href: "/giao-vien", label: "Lớp học" },
  { role: "teacher", href: "/giao-vien/ngan-hang", label: "Ngân hàng bài" },
  { role: "teacher", href: "/giao-vien/phan-hoi", label: "Phản hồi bị báo" },
  { role: "teacher", href: "/giao-vien/tai-khoan", label: "Tài khoản HS" },
  { role: "researcher", href: "/nghien-cuu", label: "Nghiên cứu" },
  { role: "admin", href: "/quan-tri", label: "Quản trị" },
];

export function BrandMark() {
  return brand.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brand.logoUrl} alt={brand.org} className="h-8 w-auto" />
  ) : (
    <span aria-hidden className="grid h-8 w-8 place-items-center rounded-md border-2 border-ink bg-paper text-lg font-bold italic text-ink">x</span>
  );
}

export function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const items = NAV.filter((n) => me.roles.includes(n.role));
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark />
            <span className="leading-tight">
              <span className="block font-semibold text-ink">{brand.product}</span>
              <span className="block text-xs text-muted">{brand.org}</span>
            </span>
          </Link>
          <nav aria-label="Điều hướng chính" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {items.map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-[#eef2f8]">{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{me.display_name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
