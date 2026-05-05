"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Map, Users, Globe,
  ChevronLeft, ChevronRight, Sun, Moon,
  LogOut, UserCog, ShieldCheck, User,
} from "lucide-react";
import { APP_VERSION } from "@/lib/version";
import { useTheme } from "./ThemeProvider";
import { supabase, Profile, UserRole } from "@/lib/supabase";

const NAV_ITEMS = [
  { href: "/admin",        label: "儀表板",   icon: LayoutDashboard, roles: ["staff", "admin"] as UserRole[] },
  { href: "/admin/groups", label: "團管理",   icon: Map,             roles: ["staff", "admin"] as UserRole[] },
  { href: "/admin/crm",    label: "旅客 CRM", icon: Users,           roles: ["staff", "admin"] as UserRole[] },
  { href: "/admin/users",  label: "用戶管理", icon: UserCog,         roles: ["admin"]          as UserRole[] },
];

const ROLE_BADGE: Record<UserRole, { label: string; icon: React.ElementType; color: string }> = {
  admin:    { label: "超級管理員", icon: ShieldCheck, color: "text-purple-400" },
  staff:    { label: "員工",       icon: UserCog,     color: "text-blue-400" },
  customer: { label: "顧客會員",   icon: User,        color: "text-slate-400" },
};

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  profile: Profile | null;
}

export default function Sidebar({ collapsed, onToggleCollapse, profile }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const { theme, toggle } = useTheme();

  const role = profile?.role ?? "staff";
  const badge = ROLE_BADGE[role];
  const BadgeIcon = badge.icon;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const visibleNav = NAV_ITEMS.filter(item => item.roles.includes(role));

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

      {/* Collapse toggle */}
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

      {/* User info */}
      {!collapsed && profile && (
        <div className="px-4 py-3 border-b border-slate-700/60">
          <div className="text-sm font-medium text-slate-100 truncate">
            {profile.name || profile.email}
          </div>
          <div className={`flex items-center gap-1 text-xs mt-0.5 ${badge.color}`}>
            <BadgeIcon className="w-3 h-3" />
            {badge.label}
          </div>
        </div>
      )}
      {collapsed && profile && (
        <div className="flex justify-center py-3 border-b border-slate-700/60">
          <BadgeIcon className={`w-4 h-4 ${badge.color}`} title={badge.label} />
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {visibleNav.map(({ href, label, icon: Icon }) => {
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

      {/* Bottom: dark mode + logout + version */}
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
          {!collapsed && <span>{theme === "dark" ? "明亮模式" : "深色模式"}</span>}
        </button>

        <button
          onClick={handleLogout}
          title={collapsed ? "登出" : undefined}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-red-900/40 hover:text-red-300 transition-colors ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>登出</span>}
        </button>

        {!collapsed && (
          <div className="text-xs text-slate-500 px-3 pt-1">{APP_VERSION}</div>
        )}
      </div>
    </aside>
  );
}
