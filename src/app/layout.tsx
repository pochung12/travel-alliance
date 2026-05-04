import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "旅遊大聯盟管理系統",
  description: "旅遊團控管理 CRM 系統",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
