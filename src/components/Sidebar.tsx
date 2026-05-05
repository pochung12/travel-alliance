"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Map, Users, Globe, ChevronLeft, ChevronRight, Sun, Moon } from "lucide-react";
import { APP_VERSION } from "@/lib/version";
import { useTheme } from "./ThemeProvider";

const navItems = [
  { href: "/admin",        label: "儀表板",   icon: LayoutDashboard },
  { href: "/admin/groups", label: "團管理",   icon: Map },
  { href: "/admin/crm",    label: "旅客 CRM", icon: Users },
];

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ collapsed, onToggleCollapse }: Props) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <aside
      className={`relative shrink-0 min-h-screen bg-slate-900 dark:bg-slate-950 text-white flex flex-col transition-all duration-300 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      {/* Logo */}
      <div className={`py-5 border-b border-slate-700/60 flex items-center gap-2 ${collapsed ? "justify-center px-3" : "px-5"}`}>
        <Globe className="w-6 h-6 text-blue-400 shrink-0" />
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="font-bold text-sm leading-tight whitespace-nowrap">旅遊大聯盟</div>
            <div className="text-xs text-slate-400 leading-tight">管理後台</div>
          </div>
        )}
      </div>

      {/* Collapse toggle — floats on the right edge */}
      <button
        onClick={onToggleCollapse}
        title={collapsed ? "展開側欄" : "折疊側欄"}
        className="absolute -right-3 top-[22px] z-20 w-6 h-6 bg-slate-700 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg transition-colors"
      >
        {collapsed
          ? <ChevronRight className="w-3.5 h-3.5" />
          : <ChevronLeft  className="w-3.5 h-3.5" />
        }
      </button>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                collapsed ? "justify-center" : ""
              } ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: dark mode toggle + version */}
      <div className="border-t border-slate-700/60 px-2 py-3 space-y-1">
        <button
          onClick={toggle}
          title={theme === "dark" ? "切換為明亮模式" : "切換為深色模式"}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {theme === "dark"
            ? <Sun  className="w-4 h-4 shrink-0 text-amber-400" />
            : <Moon className="w-4 h-4 shrink-0 text-slate-400" />
          }
          {!collapsed && (
            <span>{theme === "dark" ? "明亮模式" : "深色模式"}</span>
          )}
        </button>

        {!collapsed && (
          <div className="text-xs text-slate-500 px-3 pt-1">{APP_VERSION}</div>
        )}
      </div>
    </aside>
  );
}
