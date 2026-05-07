"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Profile } from "@/lib/supabase";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import MobileHeader from "./MobileHeader";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [collapsed, setCollapsed]   = useState(false);
  const [profile,   setProfile]     = useState<Profile | null>(null);
  const [checking,  setChecking]    = useState(true);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const { data: prof } = await supabase
        .from("profiles").select("*").eq("id", session.user.id).single();

      if (!prof) { router.replace("/login"); return; }
      if (prof.role === "customer") { router.replace("/customer"); return; }

      if (mounted) { setProfile(prof); setChecking(false); }
    };

    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [router]);

  if (checking) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
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
        {children}
      </main>

      {/* Mobile bottom nav — hidden on desktop */}
      <BottomNav role={profile?.role} />
    </div>
  );
}
