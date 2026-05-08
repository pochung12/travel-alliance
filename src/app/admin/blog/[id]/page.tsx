"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  ArrowLeft, Save, Sparkles, Eye, EyeOff,
  Tag, Image, FileText, Star, RefreshCw,
  ExternalLink, Trash2,
} from "lucide-react";

type Status = "draft" | "published" | "scheduled";
type Category = "japan" | "asia" | "europe" | "southeast_asia" | "china" | "tips" | "food" | "travel";

interface FormData {
  title: string; slug: string; excerpt: string; content: string;
  cover_image: string; category: Category; tags: string;
  status: Status; featured: boolean; reading_time: number;
  scheduled_at: string;
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "japan",        label: "🇯🇵 日本" },
  { value: "asia",         label: "🌏 亞洲" },
  { value: "europe",       label: "🏰 歐洲" },
  { value: "southeast_asia", label: "🌴 東南亞" },
  { value: "china",        label: "🇨🇳 中國" },
  { value: "tips",         label: "📖 旅遊攻略" },
  { value: "food",         label: "🍜 美食探索" },
  { value: "travel",       label: "✈️ 旅遊" },
];

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[\s一-鿿぀-ゟ゠-ヿ]+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || `post-${Date.now()}`;
}

const EMPTY: FormData = {
  title: "", slug: "", excerpt: "", content: "",
  cover_image: "", category: "travel", tags: "",
  status: "draft", featured: false, reading_time: 5,
  scheduled_at: "",
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function BlogEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew  = params.id === "new";

  const [form,      setForm]      = useState<FormData>(EMPTY);
  const [loading,   setLoading]   = useState(!isNew);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [tab,       setTab]       = useState<"write" | "preview">("write");

  // Load existing post
  useEffect(() => {
    if (isNew) return;
    (async () => {
      const { data } = await supabase.from("blog_posts").select("*").eq("id", params.id).single();
      if (data) {
        setForm({
          title:       data.title,
          slug:        data.slug,
          excerpt:     data.excerpt || "",
          content:     data.content || "",
          cover_image: data.cover_image || "",
          category:    data.category as Category,
          tags:        (data.tags || []).join(", "),
          status:      data.status as Status,
          featured:    data.featured || false,
          reading_time: data.reading_time || 5,
          scheduled_at: data.scheduled_at ? data.scheduled_at.slice(0, 16) : "",
        });
        setSlugEdited(true);
      }
      setLoading(false);
    })();
  }, [isNew, params.id]);

  const set = (k: keyof FormData, v: FormData[keyof FormData]) => {
    setForm(f => ({ ...f, [k]: v }));
    if (k === "title" && !slugEdited) {
      setForm(f => ({ ...f, title: v as string, slug: slugify(v as string) }));
    }
  };

  const save = async (publish = false) => {
    if (!form.title.trim()) { setError("請輸入文章標題"); return; }
    if (!form.slug.trim())  { setError("請輸入 Slug"); return; }
    setSaving(true); setError(""); setSuccess("");

    const payload = {
      title:        form.title,
      slug:         form.slug,
      excerpt:      form.excerpt,
      content:      form.content,
      cover_image:  form.cover_image,
      category:     form.category,
      tags:         form.tags.split(",").map(t => t.trim()).filter(Boolean),
      status:       publish ? "published" : form.status,
      featured:     form.featured,
      reading_time: form.reading_time,
      published_at: publish ? new Date().toISOString() : undefined,
      scheduled_at: form.status === "scheduled" && form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
    };

    let err: { message: string } | null = null;
    if (isNew) {
      const res = await supabase.from("blog_posts").insert(payload).select("id").single();
      err = res.error;
      if (!err && res.data) {
        setSuccess("文章已建立！");
        setTimeout(() => router.replace(`/admin/blog/${res.data!.id}`), 800);
      }
    } else {
      const res = await supabase.from("blog_posts").update(payload).eq("id", params.id);
      err = res.error;
      if (!err) setSuccess(publish ? "文章已發布！" : "已儲存草稿");
    }
    if (err) setError(err.message);
    setSaving(false);
  };

  const deletePost = async () => {
    if (!confirm("確定要刪除這篇文章嗎？此操作無法復原。")) return;
    await supabase.from("blog_posts").delete().eq("id", params.id);
    router.replace("/admin/blog");
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <RefreshCw className="w-6 h-6 animate-spin mr-2" />載入中...
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/admin/blog" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {isNew ? "新增文章" : (form.title || "編輯文章")}
            </h1>
            <p className="text-xs text-slate-400">{isNew ? "建立新的旅遊文章" : `slug: ${form.slug}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isNew && form.status === "published" && (
            <Link href={`/blog/${form.slug}`} target="_blank"
              className="hidden sm:flex items-center gap-1.5 text-xs border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 px-3 py-2 rounded-xl transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> 預覽
            </Link>
          )}
          {!isNew && (
            <button onClick={deletePost}
              className="hidden sm:flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-slate-200 dark:border-slate-600 px-3 py-2 rounded-xl transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> 刪除
            </button>
          )}
          <button onClick={() => save(false)} disabled={saving}
            className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 px-3.5 py-2 rounded-xl text-sm transition-colors disabled:opacity-50">
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">儲存草稿</span>
          </button>
          <button onClick={() => save(true)} disabled={saving}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            <span className="hidden sm:inline">發布</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error   && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 px-4 py-2.5 rounded-xl">{error}</div>}
      {success && <div className="text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 px-4 py-2.5 rounded-xl">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">

        {/* ── Left: Main content ──────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Title */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                <FileText className="w-3.5 h-3.5 inline-block mr-1" />文章標題 *
              </label>
              <input value={form.title}
                onChange={e => set("title", e.target.value)}
                placeholder="輸入吸引人的標題..."
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-base font-medium bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Slug（網址）</label>
              <div className="flex gap-2">
                <input value={form.slug}
                  onChange={e => { setSlugEdited(true); set("slug", e.target.value); }}
                  placeholder="auto-generated-from-title"
                  className="flex-1 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono" />
                <button onClick={() => { setForm(f => ({ ...f, slug: slugify(f.title) })); }}
                  className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-xl text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap">
                  重新生成
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">摘要（顯示於列表卡片）</label>
              <textarea value={form.excerpt}
                onChange={e => set("excerpt", e.target.value)}
                placeholder="一段簡短的文章介紹，讓讀者想點進來..."
                rows={3}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
            </div>
          </div>

          {/* Content editor */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-700">
              <button onClick={() => setTab("write")}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === "write" ? "text-amber-600 border-b-2 border-amber-500" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"}`}>
                ✍️ 撰寫
              </button>
              <button onClick={() => setTab("preview")}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === "preview" ? "text-amber-600 border-b-2 border-amber-500" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"}`}>
                👁️ 預覽
              </button>
              <div className="flex-1 flex items-center justify-end px-4">
                <span className="text-xs text-slate-400">支援 ## 標題 / &gt; 引言 / - 列表</span>
              </div>
            </div>
            {tab === "write" ? (
              <textarea value={form.content}
                onChange={e => set("content", e.target.value)}
                placeholder={`在這裡撰寫文章正文...\n\n支援簡易 Markdown：\n## 大標題\n### 小標題\n> 這是引言\n- 列表項目`}
                rows={22}
                className="w-full px-4 py-4 text-sm bg-transparent text-slate-800 dark:text-slate-100 placeholder:text-slate-300 focus:outline-none resize-none leading-[1.9] font-mono" />
            ) : (
              <div className="px-4 py-4 min-h-[400px] prose-preview">
                <style>{`
                  .prose-preview > * + * { margin-top: 1.6em; }
                  .prose-preview h2 { font-family: Georgia, serif; font-size: 1.5rem; font-weight: 700; color: #1e293b; margin-top: 2rem; margin-bottom: 0.75rem; }
                  .prose-preview h3 { font-family: Georgia, serif; font-size: 1.2rem; font-weight: 700; color: #334155; margin-top: 1.5rem; margin-bottom: 0.5rem; }
                  .prose-preview p  { color: #475569; line-height: 1.9; }
                  .prose-preview blockquote { border-left: 4px solid #f59e0b; padding-left: 1rem; font-style: italic; color: #64748b; }
                  .prose-preview ul { list-style: none; }
                  .prose-preview ul li::before { content: "●"; color: #f59e0b; margin-right: 0.5rem; }
                `}</style>
                {form.content ? renderBlocks(form.content) : <p className="text-slate-300 italic">尚無內容</p>}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Meta ──────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Status & Publish */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Eye className="w-4 h-4" /> 發布設定
            </h3>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">狀態</label>
              <select value={form.status} onChange={e => set("status", e.target.value as Status)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="draft">草稿</option>
                <option value="published">發布</option>
                <option value="scheduled">排程發布</option>
              </select>
            </div>
            {form.status === "scheduled" && (
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">排程時間</label>
                <input type="datetime-local" value={form.scheduled_at}
                  onChange={e => set("scheduled_at", e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            )}
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div onClick={() => set("featured", !form.featured)}
                className={`w-10 h-5 rounded-full transition-colors ${form.featured ? "bg-amber-500" : "bg-slate-200 dark:bg-slate-600"} relative`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.featured ? "left-5" : "left-0.5"}`} />
              </div>
              <span className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-500" /> 設為精選（顯示在首頁 Hero）
              </span>
            </label>
          </div>

          {/* Category */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">分類 & 標籤</h3>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">分類</label>
              <select value={form.category} onChange={e => set("category", e.target.value as Category)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                <Tag className="w-3 h-3 inline-block mr-1" />標籤（逗號分隔）
              </label>
              <input value={form.tags}
                onChange={e => set("tags", e.target.value)}
                placeholder="東京, 賞楓, 秋季旅遊"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>

          {/* Cover image */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Image className="w-4 h-4" /> 封面圖片
            </h3>
            <input value={form.cover_image}
              onChange={e => set("cover_image", e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono text-xs" />
            {form.cover_image && (
              <div className="relative h-28 rounded-xl overflow-hidden bg-slate-100">
                <img src={form.cover_image} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <p className="text-[11px] text-slate-400">留空則自動使用分類預設圖片</p>
          </div>

          {/* Reading time */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">閱讀時間（分鐘）</h3>
            <input type="number" min={1} max={60} value={form.reading_time}
              onChange={e => set("reading_time", parseInt(e.target.value) || 5)}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          {/* AI badge info */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm font-medium mb-1">
              <Sparkles className="w-4 h-4" /> AI 自動發文
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
              使用頂部「AI 生成文章」功能，可讓雅婷自動幫你撰寫完整文章並直接發布。
            </p>
          </div>
        </div>
      </div>

      {/* Bottom action bar (mobile) */}
      <div className="flex sm:hidden gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
        <button onClick={() => save(false)} disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50">
          <Save className="w-4 h-4" /> 儲存草稿
        </button>
        <button onClick={() => save(true)} disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          發布
        </button>
      </div>
    </div>
  );
}

// Simple preview renderer (mirrors blog [slug] renderContent)
function renderBlocks(content: string) {
  return content.split(/\n\n+/).map((block, i) => {
    const t = block.trim();
    if (!t) return null;
    if (t.startsWith("## "))  return <h2 key={i}>{t.slice(3)}</h2>;
    if (t.startsWith("### ")) return <h3 key={i}>{t.slice(4)}</h3>;
    if (t.startsWith("> "))   return <blockquote key={i}>{t.slice(2)}</blockquote>;
    if (t.startsWith("- ") || t.startsWith("• ")) {
      return <ul key={i}>{t.split("\n").filter(l=>l.startsWith("- ")||l.startsWith("• ")).map((li,j)=><li key={j}>{li.replace(/^[-•]\s*/,"")}</li>)}</ul>;
    }
    return <p key={i}>{t}</p>;
  });
}
