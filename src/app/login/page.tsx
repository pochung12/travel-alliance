"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Globe, Loader2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import ThemeProvider, { useTheme } from "@/components/ThemeProvider";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { theme, toggle } = useTheme();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const noAccess = params.get("msg") === "no_access";
  const sessionExpired = params.get("msg") === "session_expired";

  // If already logged in, redirect
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data: prof } = await supabase
        .from("profiles").select("role").eq("id", session.user.id).maybeSingle();
      if (prof?.role === "customer") router.replace("/customer");
      else if (prof) router.replace("/admin");
    });
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError("");
    setLoading(true);

    const directResult = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    let authErr = directResult.error;
    let user = directResult.data.user;

    // Supabase Auth 區域節點若發生 5xx/網路錯誤，改由 Railway 伺服器安全代送驗證。
    if (authErr && ((authErr.status || 0) >= 500 || /fetch|network|timeout|522/i.test(authErr.message))) {
      const proxyResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const proxy = await proxyResponse.json().catch(() => ({ error: "登入服務回應格式錯誤" }));
      if (!proxyResponse.ok || !proxy.access_token || !proxy.refresh_token) {
        setError(proxy.error || `登入服務暫時無法使用（${proxyResponse.status}）`);
        setLoading(false);
        return;
      }
      const sessionResult = await supabase.auth.setSession({
        access_token: proxy.access_token,
        refresh_token: proxy.refresh_token,
      });
      user = sessionResult.data.user;
      authErr = sessionResult.error;
    }

    if (authErr || !user) {
      setError(authErr?.message || "登入失敗，未取得使用者資料");
      setLoading(false);
      return;
    }

    const { data: prof, error: profileErr } = await supabase
      .from("profiles").select("role").eq("id", user.id).maybeSingle();

    if (profileErr) {
      setError(`登入成功，但帳號權限讀取失敗：${profileErr.message}`);
      setLoading(false);
      return;
    }
    if (!prof) {
      setError(`登入成功，但此帳號（${user.email || email}）沒有 profiles 權限資料，請由管理員補建。`);
      setLoading(false);
      return;
    }

    if (prof?.role === "customer") {
      router.replace("/customer");
    } else {
      router.replace("/admin");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors duration-200">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <Globe className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">旅遊大聯盟</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">管理後台登入</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 px-6 py-7">
          {noAccess && (
            <div className="mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl text-sm text-amber-700 dark:text-amber-300">
              ⚠️ 此帳號為顧客會員，無法進入管理後台
            </div>
          )}

          {sessionExpired && !noAccess && (
            <div className="mb-4 px-4 py-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-xl text-sm text-blue-700 dark:text-blue-300">
              登入狀態已過期，請重新登入。
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">密碼</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 pr-10 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "登入中…" : "登入"}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-700 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              還沒有帳號？{" "}
              <Link href="/register" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                立即註冊
              </Link>
            </p>
          </div>
        </div>

        {/* Dark mode toggle */}
        <div className="mt-4 text-center">
          <button
            onClick={toggle}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            {theme === "dark" ? "☀️ 切換明亮模式" : "🌙 切換深色模式"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <ThemeProvider>
      <Suspense>
        <LoginForm />
      </Suspense>
    </ThemeProvider>
  );
}
