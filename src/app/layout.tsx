import type { Metadata } from "next";
import Link from "next/link";
import NavLinks from "@/components/NavLinks";
import "./globals.css";

export const metadata: Metadata = {
  title: "求职陪练 · AI 模拟面试",
  description: "素材库 + JD 匹配 + 模拟面试 + 复盘报告",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen">
          <aside className="glass-nav fixed flex h-screen w-56 shrink-0 flex-col">
            <div className="px-5 pb-4 pt-6">
              <Link href="/" className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#4d6bfe] to-[#8ea5ff] text-lg shadow-lg shadow-[#4d6bfe]/40">
                  🐳
                </span>
                <span>
                  <span className="block text-base font-bold tracking-tight text-white">求职陪练</span>
                  <span className="block text-[11px] text-white/45">AI 模拟面试官 · Explore Deeper</span>
                </span>
              </Link>
            </div>
            <NavLinks />
            <div className="mt-auto px-5 pb-4 text-[11px] leading-relaxed text-white/35">
              MVP · DeepSeek API
              <br />
              语音链路 v1(mock 可跑)
            </div>
          </aside>
          <main className="ml-56 flex-1 px-8 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
