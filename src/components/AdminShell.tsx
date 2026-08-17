"use client";
import { useCallback, useEffect, useState, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { supabase, Profile } from "@/lib/supabase";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import MobileHeader from "./MobileHeader";

// 側欄折疊狀態（給內頁調整內容寬度用）
const SidebarCollapseContext = createContext(false);
export const useSidebarCollapsed = () => useContext(SidebarCollapseContext);

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [collapsed, setCollapsed]   = useState(false);
  const [profile,   setProfile]     = useState<Profile | null>(null);
  const [checking,  setChecking]    = useState(true);
  const [authError, setAuthError]   = useState("");

  const checkAuth = useCallback(async () => {
    setChecking(true);
    setAuthError("");

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      setAuthError(`登入狀態讀取失敗：${sessionError.message}`);
      setChecking(false);
      return;
    }
    if (!session) {
      router.replace("/login?msg=session_expired");
      return;
    }

    const { data: prof, error: profileError } = await supabase
      .from("profiles").select("id,name,role,email").eq("id", session.user.id).maybeSingle();

    // Profile 查詢錯誤不代表登入失效，避免把有效 session 誤判為登出。
    if (profileError) {
      setAuthError(`帳號權限讀取失敗：${profileError.message}`);
      setChecking(false);
      return;
    }
    if (!prof) {
      setAuthError(`登入帳號 ${session.user.email || ""} 尚未建立 profiles 權限資料，請由管理員補建帳號資料。`);
      setChecking(false);
      return;
    }
    if (prof.role === "customer") {
      router.replace("/customer");
      return;
    }

    setProfile(prof as Profile);
    setChecking(false);
  }, [router]);

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });

    return () => subscription.unsubscribe();
  }, [checkAuth, router]);

  if (checking) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (authError) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-200 dark:border-red-800 bg-white dark:bg-slate-900 p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">無法讀取後台權限</h1>
        <p className="mt-3 text-sm text-red-600 dark:text-red-400 break-words">{authError}</p>
        <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
          <button onClick={checkAuth} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
            重新檢查
          </button>
          <button onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300">
            重新登入
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-200">

      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden lg:block">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(c => !c)}
          profile={profile}
        />
      </div>

      {/* Mobile top header — hidden on desktop */}
      <MobileHeader profile={profile} />

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0
        pt-14 pb-[calc(4rem+env(safe-area-inset-bottom))]
        lg:pt-0 lg:pb-0">
        <SidebarCollapseContext.Provider value={collapsed}>
          {children}
        </SidebarCollapseContext.Provider>
      </main>

      {/* Mobile bottom nav — hidden on desktop */}
      <BottomNav role={profile?.role} />
    </div>
  );
}
