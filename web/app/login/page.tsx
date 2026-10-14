import { brand } from "@/lib/brand";
import { BrandMark } from "@/components/Shell";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="notebook w-full max-w-md rounded-xl border border-line px-6 py-8 pl-[72px] shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <BrandMark />
          <div>
            <h1 className="text-2xl font-semibold text-ink">{brand.product}</h1>
            <p className="text-sm text-muted">{brand.org}</p>
          </div>
        </div>
        <LoginForm googleClientId={brand.googleClientId} />
        <p className="mt-6 text-xs text-muted">
          Tài khoản do thầy cô hoặc nhà trường cấp. Ứng dụng có trợ lý AI; các phản hồi của AI luôn được ghi rõ.
        </p>
      </div>
    </main>
  );
}
