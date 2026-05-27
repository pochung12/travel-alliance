"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  Plus, Pencil, Trash2, Sparkles, Eye, EyeOff,
  Newspaper, Search, RefreshCw, Star, StarOff,
  Calendar, Filter, ExternalLink, Bot, Camera,
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
  const [mode,        setMode]        = useState<"topic" | "photo">("topic");
  const [topic,       setTopic]       = useState("");
  const [destination, setDestination] = useState("");
  const [category,    setCategory]    = useState("travel");
  const [photos,      setPhotos]      = useState<string[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [progress,    setProgress]    = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 壓縮圖片至最大 1200px，JPEG 0.82
  const compressImage = (file: File): Promise<string> =>
    new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const maxDim = 1200;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = url;
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProgress("壓縮照片中...");
    const newPhotos: string[] = [];
    for (const file of Array.from(files).slice(0, 5 - photos.length)) {
      if (!file.type.startsWith("image/")) continue;
      newPhotos.push(await compressImage(file));
    }
    setPhotos(prev => [...prev, ...newPhotos].slice(0, 5));
    setProgress("");
  };

  const canGenerate = mode === "topic"
    ? topic.trim().length > 0
    : photos.length > 0;

  const generate = async () => {
    if (!canGenerate) { setError(mode === "topic" ? "請輸入主題" : "請上傳至少1張照片"); return; }
    setLoading(true); setError(""); setProgress("正在呼叫 AI 生成文章...");
    try {
      const body = mode === "topic"
        ? { topic, category }
        : { destination, category, images: photos };

      const res = await fetch("/api/blog/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "生成失敗");
      setProgress("儲存文章中...");

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
        ai_prompt:    mode === "photo" ? `📷 ${destination || "照片生成"}` : topic,
      });
      if (dbErr) throw new Error(dbErr.message);
      onSuccess(); onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "生成失敗");
    } finally {
      setLoading(false); setProgress("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-900 dark:text-white">AI 自動生成文章</h2>
            <p className="text-xs text-slate-400">輸入主題或上傳照片，雅婷幫你撰寫旅遊文章</p>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
          {([["topic", "✍️ 主題生成"], ["photo", "📷 照片生成"]] as const).map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setError(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === m ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── 主題模式 ── */}
        {mode === "topic" && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">主題 / 目的地</label>
            <input value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="例如：東京秋季賞楓五天四夜行程"
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
              onKeyDown={e => e.key === "Enter" && generate()} />
          </div>
        )}

        {/* ── 照片模式 ── */}
        {mode === "photo" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">旅遊地點 / 城市（選填）</label>
              <input value={destination} onChange={e => setDestination(e.target.value)}
                placeholder="例如：日本京都、泰國清邁、義大利羅馬"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>

            {/* Upload zone */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                上傳照片
                <span className="ml-1 text-xs font-normal text-slate-400">最多5張 · AI 根據照片撰寫文章 · 第一張為封面</span>
              </label>
              {photos.length < 5 && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                  className="border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-xl p-5 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50/30 dark:hover:bg-amber-900/10 transition-colors">
                  <Camera className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">點擊選取或拖曳照片至此</p>
                  <p className="text-xs text-slate-300 mt-0.5">支援 JPG、PNG、HEIC、WEBP</p>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => handleFiles(e.target.files)} />
                </div>
              )}

              {/* Previews */}
              {photos.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {photos.map((src, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden group shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setPhotos(p => p.filter((_, j) => j !== i))}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-lg font-light">
                        ✕
                      </button>
                      {i === 0 && (
                        <span className="absolute bottom-0 inset-x-0 bg-amber-500/90 text-white text-[9px] text-center py-0.5 font-medium">封面</span>
                      )}
                    </div>
                  ))}
                  {photos.length < 5 && (
                    <button onClick={() => fileInputRef.current?.click()}
                      className="w-20 h-20 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-xl flex items-center justify-center text-slate-300 hover:border-amber-400 hover:text-amber-400 transition-colors shrink-0">
                      <Plus className="w-6 h-6" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Category (shared) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">分類</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400">
            {Object.entries(CAT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {error    && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
        {progress && <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" />{progress}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} disabled={loading}
            className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50">
            取消
          </button>
          <button onClick={generate} disabled={loading || !canGenerate}
            className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : (mode === "photo" ? <Camera className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />)}
            {loading ? "生成中..." : mode === "photo" ? "分析照片並生成" : "開始生成"}
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
  const [cronResult,  setCronResult]  = useState<{ generated: number; total: number; used_tavily: boolean; used_pexels: boolean; errors?: string[] } | null>(null);

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
      const json = await res.json() as { generated?: number; total?: number; used_tavily?: boolean; used_pexels?: boolean; error?: string; results?: Array<{ success: boolean; title: string; error?: string }> };
      if (!res.ok) throw new Error(json.error || "觸發失敗");
      const errors = (json.results || []).filter(r => !r.success).map(r => `${r.title}: ${r.error || "未知錯誤"}`);
      setCronResult({
        generated:   json.generated ?? 0,
        total:       json.total ?? 3,
        used_tavily: json.used_tavily ?? false,
        used_pexels: json.used_pexels ?? false,
        errors:      errors.length > 0 ? errors : undefined,
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
        <div className={`border rounded-xl px-4 py-3 text-sm ${cronResult.generated > 0 ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300"}`}>
          <div className="flex items-center gap-3">
            <Bot className="w-4 h-4 shrink-0" />
            <span>
              自動生成完成！成功 <strong>{cronResult.generated}</strong> / {cronResult.total} 篇
              {cronResult.used_tavily && " · 🌐 Tavily 熱門話題"}
              {cronResult.used_pexels && " · 🖼️ Pexels 封面圖片"}
            </span>
            <button onClick={() => setCronResult(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
          </div>
          {cronResult.errors && cronResult.errors.length > 0 && (
            <ul className="mt-2 ml-7 space-y-0.5 text-xs opacity-80">
              {cronResult.errors.map((e, i) => <li key={i}>❌ {e}</li>)}
            </ul>
          )}
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
            <span>前台</span>
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

      {/* Mobile card list */}
      {loading ? (
        <div className="md:hidden flex justify-center py-12 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="md:hidden bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 py-14 text-center text-slate-400">
          <Newspaper className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">尚無文章</p>
          <div className="flex justify-center gap-3 mt-4">
            <button onClick={() => setShowAI(true)} className="text-amber-500 hover:underline text-sm">AI 生成</button>
            <span className="text-slate-300">|</span>
            <Link href="/admin/blog/new" className="text-slate-600 hover:underline text-sm">手動新增</Link>
          </div>
        </div>
      ) : (
        <div className="md:hidden space-y-2">
          {filtered.map(p => (
            <div key={p.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
              {/* Title row */}
              <div className="flex items-start gap-2">
                <button onClick={() => toggleFeatured(p)}
                  className={`mt-0.5 shrink-0 transition-colors ${p.featured ? "text-amber-500" : "text-slate-300"}`}>
                  {p.featured ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 dark:text-white leading-snug line-clamp-2">{p.title}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status] || STATUS_BADGE.draft}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                    <span className="text-xs text-slate-400">{CAT_LABEL[p.category] ?? p.category}</span>
                    {p.ai_generated && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
                        <Sparkles className="w-2.5 h-2.5" /> AI
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Date + stats */}
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>{fmtDate(p.published_at) !== "—" ? fmtDate(p.published_at) : fmtDate(p.created_at)}</span>
                <span>{p.reading_time}分鐘 · {p.view_count}次瀏覽</span>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-50 dark:border-slate-700">
                <button onClick={() => togglePublish(p)}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg transition-colors border ${
                    p.status === "published"
                      ? "border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                      : "border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400"
                  }`}>
                  {p.status === "published" ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {p.status === "published" ? "已發布" : "草稿"}
                </button>
                <Link href={`/admin/blog/${p.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 transition-colors">
                  <Pencil className="w-3.5 h-3.5" /> 編輯
                </Link>
                {p.status === "published" && (
                  <Link href={`/blog/${p.slug}`} target="_blank"
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-900/10 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> 預覽
                  </Link>
                )}
                <button onClick={() => deletePost(p.id)} disabled={deleting === p.id}
                  className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-40">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 w-8"><Filter className="w-3.5 h-3.5" /></th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400">標題</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">分類</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">狀態</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
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
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 dark:text-white truncate leading-snug">{p.title}</div>
                      {p.ai_generated && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded mt-0.5">
                          <Sparkles className="w-2.5 h-2.5" /> AI
                        </span>
                      )}
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
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {fmtDate(p.published_at) !== "—" ? fmtDate(p.published_at) : fmtDate(p.created_at)}
                  </td>
                  {/* Stats */}
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap hidden lg:table-cell">
                    {p.reading_time}分 · {p.view_count}次
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => togglePublish(p)} title={p.status === "published" ? "設為草稿" : "發布"}
                        className={`p-1.5 rounded-lg transition-colors ${
                          p.status === "published"
                            ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                        }`}>
                        {p.status === "published" ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <Link href={`/admin/blog/${p.id}`}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                        <Pencil className="w-4 h-4" />
                      </Link>
                      {p.status === "published" && (
                        <Link href={`/blog/${p.slug}`} target="_blank"
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors">
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      )}
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
