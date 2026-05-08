import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "暖心旅遊誌 — 探索世界每一處感動",
  description: "旅遊攻略、目的地介紹、美食探索，由暖心旅行社精心策劃的旅遊雜誌",
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
