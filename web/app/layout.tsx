import type { Metadata, Viewport } from "next";
import "./globals.css";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: brand.product, template: `%s · ${brand.product}` },
  description: "Tự học giải phương trình bậc nhất từng bước, có gợi ý mà không cho đáp án.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1f3a93" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
