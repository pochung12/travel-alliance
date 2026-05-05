"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Profile } from "@/lib/supabase";
import { Globe, LogOut, Users } from "lucide-react";
import ThemeProvider from "@/components/ThemeProvider";

function CustomerPortal() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase
        .from("profiles").select("*").eq("id", session.user.id).single();
      if (!prof) { router.replace("/login"); return; }
      if (prof.role !== "customer") { router.replace("/admin"); return; }
      setProfile(prof);
      setChecking(false);
    });
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (checking) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <Globe className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">歡迎回來！</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-6">
            {profile?.name || profile?.email}
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium mb-8">
            <Users className="w-4 h-4" />
            顧客會員
          </div>

          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-5 text-sm text-slate-600 dark:text-slate-300 mb-6">
            <p>目前顧客會員頁面建置中。</p>
            <p className="mt-1">如需查詢出團資訊，請聯絡旅行社。</p>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 mx-auto px-5 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" /> 登出
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CustomerPage() {
  return (
    <ThemeProvider>
      <CustomerPortal />
    </ThemeProvider>
  );
}
