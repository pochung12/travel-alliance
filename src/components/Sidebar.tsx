"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Map, Users, Globe } from "lucide-react";
import { APP_VERSION } from "@/lib/version";

const navItems = [
  { href: "/admin",       label: "儀表板",    icon: LayoutDashboard },
  { href: "/admin/groups", label: "團管理",   icon: Map },
  { href: "/admin/crm",   label: "旅客 CRM",  icon: Users },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Globe className="w-6 h-6 text-blue-400" />
          <div>
            <div className="font-bold text-sm leading-tight">旅遊大聯盟</div>
            <div className="text-xs text-slate-400 leading-tight">管理後台</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-blue-600 text-white font-medium"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-slate-700 text-xs text-slate-500">
        {APP_VERSION}
      </div>
    </aside>
  );
}
