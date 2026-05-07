"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Map, Users } from "lucide-react";
import { UserRole } from "@/lib/supabase";

const NAV = [
  { href: "/admin",        label: "儀表板", icon: LayoutDashboard, roles: ["staff","admin"] as UserRole[] },
  { href: "/admin/groups", label: "團管理",  icon: Map,             roles: ["staff","admin"] as UserRole[] },
  { href: "/admin/crm",    label: "旅客",   icon: Users,           roles: ["staff","admin"] as UserRole[] },
];

export default function BottomNav({ role }: { role?: UserRole }) {
  const pathname = usePathname();
  const visible  = NAV.filter(n => !role || n.roles.includes(role));

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {visible.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
        return (
          <Link key={href} href={href}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-[11px] font-medium transition-colors ${
              active
                ? "text-blue-600 dark:text-blue-400"
                : "text-slate-400 dark:text-slate-500 active:text-slate-600 dark:active:text-slate-300"
            }`}>
            <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : ""}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
