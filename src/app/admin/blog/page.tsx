"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  Plus, Pencil, Trash2, Sparkles, Eye, EyeOff,
  Newspaper, Search, RefreshCw, Star, StarOff,
  Calendar, Filter, ExternalLink, Bot,
} from "lucide-react";

type Post = {
  id: string; title: string; slug: string; excerpt: string;
  category: string; status: string; author: string;
  ai_generated: boolean; featured: boolean;
  published_at: string | null; created_at: string;
  reading_time: number; view_count: number;
};

const STATUS_BADGE: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  draft:     "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};
const STATUS_LABEL: Record<string, string> = {
  published: "已發布", draft: "草稿", scheduled: "已排程",
};
const CAT_LABEL: Record<string, string> = {
  japan: "🇯🇵 日本", asia: "🌏 亞洲", europe: "🏰 歐洲",
  southeast_asia: "🌴 東南亞", china: "🇨🇳 中國",
  tips: "📖 攻略", food: "🍜 美食", travel: "✈️ 旅遊",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// ── AI Generate Dialog ───────────────────────────────────────────────────────
function AIGenerateDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [topic,    setTopic]    = useState("");
  const [category, setCategory] = useState("travel");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [progress, setProgress] = useState("");

  const generate = async () => {
    if (!topic.trim()) { setError("請輸入主題"); return; }
    setLoading(true); setError(""); setProgress("正在呼叫 AI 生成文章...");
    try {
      const res = await fetch("/api/blog/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, category }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "生成失敗");
      setProgress("儲存文章中...");
      // Insert to Supabase
      const { error: dbErr } = await supabase.from("blog_posts").insert({
        title:        json.title,
        slug:         json.slug,
        excerpt:      json.excerpt,
        content:      json.content,
        category:     json.category || category,
        tags:         json.tags || [],
        reading_time: json.reading_time || 5,
        cover_image:  json.cover_image || "",
        status:       "published",
        published_at: new Date().toISOString(),
        ai_generated: true,
        ai_prompt:    topic,
      });
      if (dbErr) throw new Error(dbErr.message);
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "生成失敗");
    } finally {
      setLoading(false); setProgress("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-900 dark:text-white">AI 自動生成文章</h2>
            <p className="text-xs text-slate-400">輸入主題，雅婷幫你自動撰寫旅遊文章</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">主題 / 目的地</label>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="例如：東京秋季賞楓五天四夜行程"
            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            onKeyDown={e => e.key === "Enter" && generate()}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">分類</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400">
            {Object.entries(CAT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {error   && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
        {progress && <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" />{progress}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} disabled={loading}
            className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50">
            取消
          </button>
          <button onClick={generate} disabled={loading || !topic.trim()}
            className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? "生成中..." : "開始生成"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminBlogPage() {
  const [posts,      setPosts]      = useState<Post[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search,     setSearch]     = useState("");
  const [showAI,     setShowAI]     = useState(false);
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [cronRunning, setCronRunning] = useState(false);
  const [cronResult,  setCronResult]  = useState<{ generated: number; total: number; used_tavily: boolean; used_pexels: boolean } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("blog_posts")
      .select("id,title,slug,excerpt,category,status,author,ai_generated,featured,published_at,created_at,reading_time,view_count")
      .order("created_at", { ascending: false });
    setPosts((data || []) as Post[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = posts.filter(p => {
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.excerpt.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const togglePublish = async (p: Post) => {
    const next = p.status === "published" ? "draft" : "published";
    const extra = next === "published" ? { published_at: new Date().toISOString() } : {};
    await supabase.from("blog_posts").update({ status: next, ...extra }).eq("id", p.id);
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, status: next } : x));
  };

  const toggleFeatured = async (p: Post) => {
    await supabase.from("blog_posts").update({ featured: !p.featured }).eq("id", p.id);
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, featured: !x.featured } : x));
  };

  const deletePost = async (id: string) => {
    if (!confirm("確定要刪除這篇文章嗎？此操作無法復原。")) return;
    setDeleting(id);
    await supabase.from("blog_posts").delete().eq("id", id);
    setPosts(prev => prev.filter(x => x.id !== id));
    setDeleting(null);
  };

  const triggerCron = async () => {
    if (!confirm("確定要立即觸發今日自動生成3篇旅遊文章嗎？約需1-2分鐘。")) return;
    setCronRunning(true); setCronResult(null);
    try {
      const res = await fetch("/api/blog/trigger", { method: "POST" });
      const json = await res.json() as { generated?: number; total?: number; used_tavily?: boolean; used_pexels?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error || "觸發失敗");
      setCronResult({
        generated:   json.generated ?? 0,
        total:       json.total ?? 3,
        used_tavily: json.used_tavily ?? false,
        used_pexels: json.used_pexels ?? false,
      });
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "觸發失敗，請確認 BLOG_CRON_SECRET 設定");
    } finally {
      setCronRunning(false);
    }
  };

  const counts = {
    all:       posts.length,
    published: posts.filter(p => p.status === "published").length,
    draft:     posts.filter(p => p.status === "draft").length,
    scheduled: posts.filter(p => p.status === "scheduled").length,
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      {showAI && <AIGenerateDialog onClose={() => setShowAI(false)} onSuccess={load} />}

      {/* Cron result notification */}
      {cronResult && (
        <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-xl px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <Bot className="w-4 h-4 shrink-0" />
          <span>
            自動生成完成！成功 <strong>{cronResult.generated}</strong> / {cronResult.total} 篇
            {cronResult.used_tavily && " · 🌐 Tavily 熱門話題"}
            {cronResult.used_pexels && " · 🖼️ Pexels 封面圖片"}
          </span>
          <button onClick={() => setCronResult(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Newspaper className="w-6 h-6 text-amber-500 shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">旅遊誌管理</h1>
            <p className="text-xs text-slate-400 mt-0.5">發布旅遊文章 · AI 自動生文 · 每日 09:00 自動產出</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={triggerCron} disabled={cronRunning}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition-colors">
            {cronRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
            <span className="hidden sm:inline">{cronRunning ? "生成中..." : "觸發今日3篇"}</span>
            <span className="sm:hidden">{cronRunning ? "生成中" : "3篇"}</span>
          </button>
          <button onClick={() => setShowAI(true)}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition-colors">
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">AI 生成文章</span>
            <span className="sm:hidden">AI 生成</span>
          </button>
          <Link href="/admin/blog/new"
            className="flex items-center gap-1.5 bg-slate-900 dark:bg-white hover:bg-slate-700 dark:hover:bg-slate-100 text-white dark:text-slate-900 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">新增文章</span>
            <span className="sm:hidden">新增</span>
          </Link>
          <Link href="/blog" target="_blank"
            className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 px-3.5 py-2 rounded-xl text-sm transition-colors">
            <ExternalLink className="w-4 h-4" />
            <span className="hidden sm:inline">前台預覽</span>
          </Link>
        </div>
      </div>

      {/* Stat pills */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "published", "draft", "scheduled"] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === s
                ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-400"
            }`}>
            {s === "all" ? "全部" : STATUS_LABEL[s]}
            <span className="ml-1.5 text-xs opacity-70">{counts[s]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜尋文章標題..."
            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl pl-9 pr-4 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <button onClick={load} title="重新整理"
          className="p-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 w-8"><Filter className="w-3.5 h-3.5" /></th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400">標題</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">分類</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">狀態</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap hidden md:table-cell">
                  <Calendar className="w-3.5 h-3.5 inline-block mr-1" />發布日期
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap hidden lg:table-cell">閱讀/瀏覽</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-16 text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />載入中...
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16 text-slate-400">
                  <Newspaper className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>尚無文章</p>
                  <div className="flex justify-center gap-3 mt-4">
                    <button onClick={() => setShowAI(true)} className="text-amber-500 hover:underline text-sm">AI 生成</button>
                    <span className="text-slate-300">|</span>
                    <Link href="/admin/blog/new" className="text-slate-600 hover:underline text-sm">手動新增</Link>
                  </div>
                </td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  {/* Featured star */}
                  <td className="px-4 py-3">
                    <button onClick={() => toggleFeatured(p)} title={p.featured ? "取消精選" : "設為精選"}
                      className={`transition-colors ${p.featured ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}>
                      {p.featured ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
                    </button>
                  </td>
                  {/* Title */}
                  <td className="px-4 py-3 max-w-[260px]">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-white truncate leading-snug">{p.title}</div>
                        {p.ai_generated && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded mt-0.5">
                            <Sparkles className="w-2.5 h-2.5" /> AI
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  {/* Category */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{CAT_LABEL[p.category] ?? p.category}</span>
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status] || STATUS_BADGE.draft}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  {/* Date */}
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap hidden md:table-cell">
                    {fmtDate(p.published_at) !== "—" ? fmtDate(p.published_at) : fmtDate(p.created_at)}
                  </td>
                  {/* Stats */}
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap hidden lg:table-cell">
                    {p.reading_time}分 · {p.view_count}次
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Toggle publish */}
                      <button onClick={() => togglePublish(p)} title={p.status === "published" ? "設為草稿" : "發布"}
                        className={`p-1.5 rounded-lg transition-colors ${
                          p.status === "published"
                            ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                        }`}>
                        {p.status === "published" ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      {/* Edit */}
                      <Link href={`/admin/blog/${p.id}`}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                        <Pencil className="w-4 h-4" />
                      </Link>
                      {/* Preview */}
                      {p.status === "published" && (
                        <Link href={`/blog/${p.slug}`} target="_blank"
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors">
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      )}
                      {/* Delete */}
                      <button onClick={() => deletePost(p.id)} disabled={deleting === p.id}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-40">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      {filtered.length > 0 && (
        <p className="text-xs text-slate-400 text-right">共 {filtered.length} 篇</p>
      )}
    </div>
  );
}
