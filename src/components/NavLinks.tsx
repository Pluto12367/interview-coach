"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "仪表盘", icon: "◈" },
  { href: "/materials", label: "素材库", icon: "📚" },
  { href: "/jd", label: "JD 分析", icon: "🎯" },
  { href: "/interview/new", label: "发起面试", icon: "💬" },
  { href: "/review", label: "复盘与真题", icon: "🔁" },
  { href: "/applications", label: "投递追踪", icon: "📮" },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="mt-2 flex flex-col gap-1 px-3">
      {NAV.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
              active
                ? "bg-gradient-to-r from-[#4d6bfe]/90 to-[#6f8bff]/80 text-white shadow-lg shadow-[#4d6bfe]/30"
                : "text-white/65 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span className="w-5 text-center text-[13px]">{n.icon}</span>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
