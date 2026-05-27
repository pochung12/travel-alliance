"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Sun, Moon, LogOut, X, ShieldCheck, UserCog, User } from "lucide-react";
import { supabase, Profile, UserRole } from "@/lib/supabase";
import { useTheme } from "./ThemeProvider";
import { APP_VERSION } from "@/lib/version";
import { useExchangeRate } from "@/lib/useExchangeRate";

const ROLE_INFO: Record<UserRole, { label: string; icon: React.ElementType; color: string }> = {
  admin:    { label: "超級管理員", icon: ShieldCheck, color: "text-purple-400" },
  staff:    { label: "員工",       icon: UserCog,     color: "text-blue-400" },
  customer: { label: "顧客",       icon: User,        color: "text-slate-400" },
};

export default function MobileHeader({ profile }: { profile: Profile | null }) {
  const router          = useRouter();
  const { theme, toggle } = useTheme();
  const { rate }          = useExchangeRate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const role    = profile?.role ?? "staff";
  const info    = ROLE_INFO[role];
  const BadgeIcon = info.icon;
  const initial = (profile?.name || profile?.email || "?")[0].toUpperCase();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <>
      {/* Top header bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-blue-500 shrink-0" />
          <span className="font-bold text-sm text-slate-800 dark:text-slate-100">旅遊大聯盟</span>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          {/* CNY 匯率小標籤 */}
          {rate && (
            <span className="text-[11px] font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-700/50 whitespace-nowrap">
              ¥ = {rate.toFixed(2)}
            </span>
          )}
          {/* Dark mode toggle */}
          <button
            onClick={toggle}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="切換深色模式">
            {theme === "dark"
              ? <Sun  className="w-4.5 h-4.5 text-amber-400" style={{ width: 18, height: 18 }} />
              : <Moon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
            }
          </button>

          {/* Profile avatar → opens drawer */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center ml-1">
            {initial}
          </button>
        </div>
      </header>

      {/* Profile drawer overlay */}
      {drawerOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="lg:hidden fixed top-0 right-0 bottom-0 z-50 w-72 bg-white dark:bg-slate-900 shadow-2xl flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <span className="font-semibold text-slate-800 dark:text-slate-100">帳號資訊</span>
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Profile info */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white text-lg font-bold flex items-center justify-center shrink-0">
                  {initial}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {profile?.name || profile?.email}
                  </div>
                  <div className={`flex items-center gap-1 text-xs mt-0.5 ${info.color}`}>
                    <BadgeIcon className="w-3 h-3" />
                    {info.label}
                  </div>
                  {profile?.email && profile?.name && (
                    <div className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">{profile.email}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex-1 px-3 py-3 space-y-1">
              <button
                onClick={() => { toggle(); setDrawerOpen(false); }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {theme === "dark"
                  ? <Sun  className="w-4 h-4 text-amber-400" />
                  : <Moon className="w-4 h-4 text-slate-400" />
                }
                {theme === "dark" ? "切換明亮模式" : "切換深色模式"}
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <LogOut className="w-4 h-4" />
                登出
              </button>
            </div>

            {/* Version */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400 dark:text-slate-500">
              {APP_VERSION}
            </div>
          </div>
        </>
      )}
    </>
  );
}
