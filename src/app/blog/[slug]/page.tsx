"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import {
  Sparkles, Clock, ArrowLeft, MapPin,
  Tag, Eye, Compass, Facebook, Instagram,
  ChevronRight,
} from "lucide-react";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Post = {
  id: string; title: string; slug: string; excerpt: string; content: string;
  cover_image: string; category: string; tags: string[];
  author: string; ai_generated: boolean; featured: boolean;
  published_at: string; created_at: string; reading_time: number;
  view_count: number;
};

const CAT_BADGE: Record<string, string> = {
  japan: "bg-red-100 text-red-700", asia: "bg-emerald-100 text-emerald-700",
  europe: "bg-violet-100 text-violet-700", southeast_asia: "bg-amber-100 text-amber-700",
  china: "bg-rose-100 text-rose-700", tips: "bg-sky-100 text-sky-700",
  food: "bg-orange-100 text-orange-700", travel: "bg-slate-100 text-slate-700",
};
const CAT_LABEL: Record<string, string> = {
  japan: "日本", asia: "亞洲", europe: "歐洲", southeast_asia: "東南亞",
  china: "中國", tips: "旅遊攻略", food: "美食探索", travel: "旅遊",
};
const CAT_FALLBACK: Record<string, string> = {
  japan: "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?w=1400&q=80",
  asia:  "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?w=1400&q=80",
  europe:"https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=1400&q=80",
  southeast_asia:"https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=1400&q=80",
  china: "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=1400&q=80",
  tips:  "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1400&q=80",
  food:  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1400&q=80",
  travel:"https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1400&q=80",
};
function coverOf(p: Post) {
  return p.cover_image || CAT_FALLBACK[p.category] || CAT_FALLBACK.travel;
}
function fmtDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
}
/** 把純文字 content 按段落分割，支援 ## 標題語法 */
function renderContent(content: string) {
  const blocks = content.split(/\n\n+/);
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("## ")) {
      return <h2 key={i} className="magazine-serif text-2xl md:text-3xl font-bold text-slate-900 mt-10 mb-4 leading-snug">{trimmed.slice(3)}</h2>;
    }
    if (trimmed.startsWith("### ")) {
      return <h3 key={i} className="magazine-serif text-xl font-bold text-slate-800 mt-8 mb-3">{trimmed.slice(4)}</h3>;
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      const items = trimmed.split("\n").filter(l => l.trim().startsWith("- ") || l.trim().startsWith("• "));
      return (
        <ul key={i} className="list-none space-y-2 my-4">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-slate-700 leading-relaxed">
              <span className="text-amber-500 mt-1.5 shrink-0">●</span>
              <span>{item.replace(/^[-•]\s*/, "")}</span>
            </li>
          ))}
        </ul>
      );
    }
    if (trimmed.startsWith("> ")) {
      return (
        <blockquote key={i} className="border-l-4 border-amber-400 pl-5 my-6 italic text-slate-600 text-lg leading-relaxed">
          {trimmed.slice(2)}
        </blockquote>
      );
    }
    return <p key={i} className="text-slate-700 leading-[1.9] text-base md:text-lg mb-0">{trimmed}</p>;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post,    setPost]    = useState<Post | null>(null);
  const [related, setRelated] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data } = await sb.from("blog_posts")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .single();

      if (!data) { setNotFound(true); setLoading(false); return; }
      setPost(data as Post);
      // increment view_count silently
      sb.from("blog_posts").update({ view_count: (data.view_count || 0) + 1 }).eq("id", data.id).then(() => {});
      // related posts (same category)
      const { data: rel } = await sb.from("blog_posts")
        .select("id,title,slug,excerpt,cover_image,category,tags,author,ai_generated,featured,published_at,created_at,reading_time,view_count")
        .eq("status", "published")
        .eq("category", data.category)
        .neq("id", data.id)
        .order("published_at", { ascending: false })
        .limit(3);
      setRelated((rel || []) as Post[]);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen bg-[#f8f6f1] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (notFound || !post) return (
    <div className="min-h-screen bg-[#f8f6f1] flex flex-col items-center justify-center gap-4 text-slate-400">
      <Compass className="w-12 h-12 opacity-30" />
      <p className="text-lg">找不到這篇文章</p>
      <Link href="/blog" className="bg-amber-500 text-white px-6 py-2 rounded-full text-sm font-medium">返回雜誌首頁</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8f6f1] text-slate-800">
      <style>{`
        .magazine-serif { font-family: "Georgia", "Times New Roman", serif; }
        .hero-gradient  { background: linear-gradient(to top, rgba(0,0,0,.85) 0%, rgba(0,0,0,.35) 55%, rgba(0,0,0,0) 100%); }
        .card-img       { transition: transform .5s ease; }
        .card-img:hover { transform: scale(1.04); }
        .prose-body > * + * { margin-top: 1.6em; }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .fade-in { animation: fadeIn .5s ease both; }
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-14 md:h-16">
            <Link href="/blog" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
                <Compass className="w-4 h-4 text-white" />
              </div>
              <div className="hidden sm:block">
                <div className="magazine-serif font-bold text-base leading-none tracking-tight">暖心旅遊誌</div>
                <div className="text-[10px] text-amber-400 tracking-widest uppercase leading-none mt-0.5">Travel Magazine</div>
              </div>
            </Link>
            <Link href="/blog"
              className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /> 返回列表
            </Link>
            <div className="flex items-center gap-3">
              <a href="#" className="hidden sm:flex text-slate-400 hover:text-white transition-colors"><Facebook className="w-4 h-4" /></a>
              <a href="#" className="hidden sm:flex text-slate-400 hover:text-white transition-colors"><Instagram className="w-4 h-4" /></a>
              <Link href="/admin/blog"
                className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-1.5 rounded-full font-medium transition-colors">
                後台管理
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ── HERO IMAGE ─────────────────────────────────────────────────────── */}
      <div className="relative h-[50vh] md:h-[68vh] overflow-hidden">
        <img src={coverOf(post)} alt={post.title}
          className="absolute inset-0 w-full h-full object-cover" />
        <div className="hero-gradient absolute inset-0" />
        <div className="absolute bottom-0 left-0 right-0 px-6 md:px-12 pb-8 md:pb-12 fade-in">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className={`text-xs font-bold px-2.5 py-1 rounded uppercase tracking-wider ${CAT_BADGE[post.category] || CAT_BADGE.travel}`}>
                {CAT_LABEL[post.category] ?? post.category}
              </span>
              {post.ai_generated && (
                <span className="flex items-center gap-1 text-amber-300 text-xs bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-400/30">
                  <Sparkles className="w-3 h-3" /> AI 生成
                </span>
              )}
              <span className="text-white/60 text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" /> {post.reading_time} 分鐘閱讀
              </span>
              <span className="text-white/60 text-xs flex items-center gap-1">
                <Eye className="w-3 h-3" /> {post.view_count} 次瀏覽
              </span>
            </div>
            <h1 className="magazine-serif text-white text-3xl md:text-5xl font-bold leading-tight mb-4 drop-shadow-xl">
              {post.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-white/70 text-sm">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> {post.author}
              </span>
              <span>·</span>
              <span>{fmtDate(post.published_at || post.created_at)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── ARTICLE BODY ───────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 md:px-6">

        {/* Excerpt (lead paragraph) */}
        {post.excerpt && (
          <div className="mt-10 mb-6 px-6 md:px-10 py-6 bg-amber-50 border-l-4 border-amber-400 rounded-r-2xl fade-in">
            <p className="magazine-serif text-slate-700 text-lg md:text-xl leading-relaxed italic">
              {post.excerpt}
            </p>
          </div>
        )}

        {/* Main content */}
        <article className="prose-body mt-6 pb-10 fade-in">
          {renderContent(post.content)}
        </article>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pb-10 border-b border-slate-200">
            <Tag className="w-4 h-4 text-slate-400" />
            {post.tags.map(t => (
              <span key={t} className="px-3 py-1 bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-700 text-xs rounded-full cursor-pointer transition-colors">
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Author card */}
        <div className="mt-10 mb-14 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm flex gap-4 items-start">
          <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center shrink-0">
            <Compass className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="font-semibold text-slate-900">{post.author}</div>
            <p className="text-slate-500 text-sm mt-1 leading-relaxed">
              暖心旅行社旅遊達人，帶你探索世界每一處角落，分享最真實的旅行故事與實用攻略。
            </p>
          </div>
        </div>
      </div>

      {/* ── RELATED POSTS ──────────────────────────────────────────────────── */}
      {related.length > 0 && (
        <div className="bg-white border-t border-slate-100 py-14">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="flex items-center justify-between mb-8" style={{ borderTop: "3px solid #0f172a", paddingTop: "1rem" }}>
              <h2 className="magazine-serif text-xl md:text-2xl font-bold text-slate-900">相關文章</h2>
              <Link href="/blog" className="text-sm text-amber-600 hover:text-amber-700 flex items-center gap-1">
                更多文章 <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {related.map(p => (
                <Link key={p.id} href={`/blog/${p.slug}`}
                  className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl border border-slate-100 transition-all duration-300 hover:-translate-y-1 flex flex-col">
                  <div className="relative h-44 overflow-hidden bg-slate-100">
                    <img src={coverOf(p)} alt={p.title}
                      className="card-img w-full h-full object-cover" />
                    {p.ai_generated && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] bg-black/50 text-amber-300 px-2 py-1 rounded-full backdrop-blur-sm">
                        <Sparkles className="w-2.5 h-2.5" /> AI
                      </div>
                    )}
                  </div>
                  <div className="flex-1 p-4 flex flex-col">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wide w-fit mb-2 ${CAT_BADGE[p.category] || CAT_BADGE.travel}`}>
                      {CAT_LABEL[p.category] ?? p.category}
                    </span>
                    <h3 className="magazine-serif font-bold text-slate-900 text-base leading-snug mb-2 line-clamp-2 group-hover:text-amber-700 transition-colors">
                      {p.title}
                    </h3>
                    <p className="text-slate-500 text-sm line-clamp-2 flex-1">{p.excerpt}</p>
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-3 mt-3 border-t border-slate-50">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {p.reading_time} 分鐘</span>
                      <span>{fmtDate(p.published_at || p.created_at)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 mt-0">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center">
                <Compass className="w-4 h-4 text-white" />
              </div>
              <span className="magazine-serif font-bold text-white">暖心旅遊誌</span>
            </div>
            <span className="text-xs">© {new Date().getFullYear()} 暖心旅行社 · All rights reserved.</span>
            <Link href="/admin/blog" className="text-slate-500 hover:text-amber-400 transition-colors text-xs">後台管理</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
