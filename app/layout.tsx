import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sơn Trà Số — Học và thực hành kỹ năng số",
  description: "Học kỹ năng số, đồng bộ tiến độ và đánh giá thực hành tại cộng đồng.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
