"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { Sparkles, Clock, MapPin, ChevronRight, Compass, Instagram, Facebook, Search, Menu, X } from "lucide-react";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────
type Post = {
  id: string; title: string; slug: string; excerpt: string;
  cover_image: string; category: string; tags: string[];
  author: string; ai_generated: boolean; featured: boolean;
  published_at: string; created_at: string; reading_time: number;
  view_count: number;
};

// ─── Category config ──────────────────────────────────────────────────────────
const CATS = [
  { key: "all",          label: "全部",     color: "bg-slate-800 text-white" },
  { key: "japan",        label: "🇯🇵 日本",  color: "bg-red-600 text-white"  },
  { key: "asia",         label: "🌏 亞洲",  color: "bg-emerald-600 text-white" },
  { key: "europe",       label: "🏰 歐洲",  color: "bg-violet-600 text-white" },
  { key: "southeast_asia",label:"🌴 東南亞", color: "bg-amber-600 text-white" },
  { key: "china",        label: "🇨🇳 中國",  color: "bg-rose-700 text-white" },
  { key: "tips",         label: "📖 攻略",  color: "bg-sky-600 text-white"  },
  { key: "food",         label: "🍜 美食",  color: "bg-orange-600 text-white" },
];

const CAT_BADGE: Record<string,string> = {
  japan: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  asia: "bg-emerald-100 text-emerald-700",
  europe: "bg-violet-100 text-violet-700",
  southeast_asia: "bg-amber-100 text-amber-700",
  china: "bg-rose-100 text-rose-700",
  tips: "bg-sky-100 text-sky-700",
  food: "bg-orange-100 text-orange-700",
  travel: "bg-slate-100 text-slate-700",
};
const CAT_LABEL: Record<string,string> = {
  japan: "日本", asia: "亞洲", europe: "歐洲", southeast_asia: "東南亞",
  china: "中國", tips: "旅遊攻略", food: "美食探索", travel: "旅遊",
};

// ─── Default cover images (fallback by category) ─────────────────────────────
const CAT_FALLBACK: Record<string,string> = {
  japan: "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?w=1200&q=80",
  asia:  "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?w=1200&q=80",
  europe:"https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=1200&q=80",
  southeast_asia:"https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=1200&q=80",
  china: "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=1200&q=80",
  tips:  "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1200&q=80",
  food:  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80",
  travel:"https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&q=80",
};
function coverOf(p: Post) {
  return p.cover_image || CAT_FALLBACK[p.category] || CAT_FALLBACK.travel;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function BlogPage() {
  const [posts,   setPosts]   = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat,     setCat]     = useState("all");
  const [search,  setSearch]  = useState("");
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    sb.from("blog_posts")
      .select("id,title,slug,excerpt,cover_image,category,tags,author,ai_generated,featured,published_at,created_at,reading_time,view_count")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .then(({ data }) => { setPosts((data || []) as Post[]); setLoading(false); });
  }, []);

  const filtered = posts.filter(p => {
    const matchCat = cat === "all" || p.category === cat;
    const matchSearch = !search || p.title.includes(search) || p.excerpt.includes(search);
    return matchCat && matchSearch;
  });

  const featured = filtered.find(p => p.featured) ?? filtered[0];
  const rest = filtered.filter(p => p.id !== featured?.id);

  return (
    <div className="min-h-screen bg-[#f8f6f1] text-slate-800">
      {/* ── Global CSS injected for magazine feel ─────────────────────────── */}
      <style>{`
        .magazine-serif { font-family: "Georgia", "Times New Roman", serif; }
        .hero-gradient  { background: linear-gradient(to top, rgba(0,0,0,.85) 0%, rgba(0,0,0,.3) 50%, rgba(0,0,0,0) 100%); }
        .card-img       { transition: transform .5s ease; }
        .card-img:hover { transform: scale(1.04); }
        .ink-border     { border-top: 3px solid #0f172a; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:none; } }
        .fade-up        { animation: fadeUp .6s ease both; }
      `}</style>

      {/* ─────────────────────────────────────────────────────────────────────
          HEADER — 深色雜誌導覽
         ──────────────────────────────────────────────────────────────────── */}
      <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          {/* Top strip */}
          <div className="hidden md:flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-700/60 py-1.5">
            <span>暖心旅行社 · 每天探索一處新世界</span>
            <div className="flex gap-4">
              <a href="https://www.facebook.com" target="_blank" className="hover:text-white flex items-center gap-1"><Facebook className="w-3 h-3"/>Facebook</a>
              <a href="https://www.instagram.com" target="_blank" className="hover:text-white flex items-center gap-1"><Instagram className="w-3 h-3"/>Instagram</a>
            </div>
          </div>
          {/* Main nav */}
          <div className="flex items-center justify-between h-14 md:h-16">
            {/* Logo */}
            <Link href="/blog" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
                <Compass className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <div className="magazine-serif font-bold text-base md:text-lg leading-none tracking-tight">暖心旅遊誌</div>
                <div className="text-[10px] text-amber-400 tracking-widest uppercase leading-none mt-0.5">Travel Magazine</div>
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {CATS.slice(1).map(c => (
                <button key={c.key} onClick={() => setCat(c.key)}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    cat === c.key ? "text-amber-400 font-semibold" : "text-slate-300 hover:text-white"
                  }`}>{c.label}</button>
              ))}
            </nav>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="搜尋文章…"
                  className="bg-slate-800 border border-slate-700 rounded-full text-sm text-white pl-9 pr-4 py-1.5 w-40 focus:w-56 transition-all focus:outline-none focus:border-amber-400 placeholder:text-slate-500" />
              </div>
              <Link href="/admin/blog"
                className="hidden md:flex items-center gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-1.5 rounded-full font-medium transition-colors">
                後台管理
              </Link>
              <button onClick={() => setNavOpen(v => !v)} className="md:hidden p-2 text-slate-300 hover:text-white">
                {navOpen ? <X className="w-5 h-5"/> : <Menu className="w-5 h-5"/>}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {navOpen && (
          <div className="md:hidden bg-slate-800 border-t border-slate-700 px-4 py-3 space-y-1">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="搜尋文章…"
                className="bg-slate-700 border border-slate-600 rounded-lg text-sm text-white pl-9 pr-4 py-2 w-full focus:outline-none focus:border-amber-400 placeholder:text-slate-500" />
            </div>
            {CATS.map(c => (
              <button key={c.key} onClick={() => { setCat(c.key); setNavOpen(false); }}
                className={`block w-full text-left px-3 py-2 rounded text-sm ${
                  cat === c.key ? "bg-slate-700 text-amber-400 font-semibold" : "text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}>{c.label}</button>
            ))}
            <Link href="/admin/blog" onClick={()=>setNavOpen(false)}
              className="block mt-2 text-center text-xs bg-amber-500 text-white px-4 py-2 rounded-lg font-medium">後台管理</Link>
          </div>
        )}
      </header>

      {/* ─────────────────────────────────────────────────────────────────────
          CATEGORY FILTER BAR (mobile scroll)
         ──────────────────────────────────────────────────────────────────── */}
      <div className="md:hidden bg-white border-b border-slate-100 sticky top-14 z-40">
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5 scrollbar-none">
          {CATS.map(c => (
            <button key={c.key} onClick={()=>setCat(c.key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                cat === c.key ? c.color : "bg-slate-100 text-slate-600"
              }`}>{c.label}</button>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          HERO
         ──────────────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="h-[60vh] bg-slate-100 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !featured ? (
        <div className="h-[40vh] flex flex-col items-center justify-center gap-4 text-slate-400">
          <Compass className="w-12 h-12 opacity-30" />
          <p className="text-lg">目前沒有文章，請先到後台發文</p>
          <Link href="/admin/blog" className="bg-amber-500 text-white px-6 py-2 rounded-full text-sm font-medium">前往後台</Link>
        </div>
      ) : (
        <Link href={`/blog/${featured.slug}`} className="block relative h-[62vh] md:h-[82vh] overflow-hidden group">
          <img src={coverOf(featured)} alt={featured.title}
            className="card-img absolute inset-0 w-full h-full object-cover" />
          <div className="hero-gradient absolute inset-0" />
          {/* Content */}
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 max-w-5xl fade-up">
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-xs font-bold px-2.5 py-1 rounded uppercase tracking-wider ${CAT_BADGE[featured.category] || CAT_BADGE.travel}`}>
                {CAT_LABEL[featured.category] ?? featured.category}
              </span>
              <span className="text-white/60 text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" /> {featured.reading_time} 分鐘
              </span>
            </div>
            <h1 className="magazine-serif text-white text-2xl md:text-5xl font-bold leading-tight mb-3 md:mb-4 drop-shadow-lg max-w-3xl">
              {featured.title}
            </h1>
            <p className="text-white/80 text-sm md:text-base max-w-2xl line-clamp-2 hidden sm:block mb-4">
              {featured.excerpt}
            </p>
            <div className="flex items-center gap-3 text-white/60 text-xs">
              <span>{featured.author}</span>
              <span>·</span>
              <span>{fmtDate(featured.published_at || featured.created_at)}</span>
              <span className="ml-2 flex items-center gap-1 bg-white/10 group-hover:bg-amber-500 transition-colors px-3 py-1.5 rounded-full text-white text-xs font-medium">
                閱讀全文 <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        </Link>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          ARTICLES GRID
         ──────────────────────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-14">

        {/* Section header */}
        {rest.length > 0 && (
          <div className="ink-border pb-3 mb-8 flex items-center justify-between">
            <h2 className="magazine-serif text-xl md:text-2xl font-bold text-slate-900">
              {cat === "all" ? "最新文章" : `${CATS.find(c=>c.key===cat)?.label ?? ""} 精選`}
            </h2>
            <span className="text-sm text-slate-400">{rest.length} 篇</span>
          </div>
        )}

        {rest.length === 0 && !loading && (
          <div className="text-center py-16 text-slate-400">
            <p>此分類尚無文章</p>
          </div>
        )}

        {/* Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {rest.map((p, i) => (
            <Link key={p.id} href={`/blog/${p.slug}`}
              className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col fade-up"
              style={{ animationDelay: `${i * 0.07}s` }}>
              {/* Cover image */}
              <div className="relative h-48 overflow-hidden bg-slate-100">
                <img src={coverOf(p)} alt={p.title}
                  className="card-img w-full h-full object-cover group-hover:scale-105" />
              </div>
              {/* Body */}
              <div className="flex-1 p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${CAT_BADGE[p.category] || CAT_BADGE.travel}`}>
                    {CAT_LABEL[p.category] ?? p.category}
                  </span>
                  <span className="text-slate-400 text-xs flex items-center gap-1 ml-auto">
                    <Clock className="w-3 h-3" /> {p.reading_time} 分鐘
                  </span>
                </div>
                <h3 className="magazine-serif font-bold text-slate-900 text-base md:text-lg leading-snug mb-2 line-clamp-2 group-hover:text-amber-700 transition-colors">
                  {p.title}
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed line-clamp-3 flex-1 mb-3">
                  {p.excerpt}
                </p>
                {/* Meta */}
                <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-50">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {p.author}
                  </span>
                  <span>{fmtDate(p.published_at || p.created_at)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Load more placeholder */}
        {rest.length >= 9 && (
          <div className="text-center mt-12">
            <button className="px-8 py-3 border-2 border-slate-900 text-slate-900 font-semibold rounded-full hover:bg-slate-900 hover:text-white transition-colors text-sm">
              載入更多文章
            </button>
          </div>
        )}
      </main>

      {/* ─────────────────────────────────────────────────────────────────────
          FOOTER
         ──────────────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center">
                  <Compass className="w-4 h-4 text-white" />
                </div>
                <span className="magazine-serif font-bold text-white">暖心旅遊誌</span>
              </div>
              <p className="text-sm leading-relaxed">探索世界每一處感動，分享最真實的旅行故事。</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wide">分類</h4>
              <div className="space-y-1.5">
                {CATS.slice(1).map(c => (
                  <button key={c.key} onClick={()=>setCat(c.key)}
                    className="block text-sm hover:text-amber-400 transition-colors">{c.label}</button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wide">聯絡我們</h4>
              <p className="text-sm">📧 pochung12@gmail.com</p>
              <div className="flex gap-3 mt-3">
                <a href="#" className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors">
                  <Facebook className="w-3.5 h-3.5" />
                </a>
                <a href="#" className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center hover:bg-pink-600 transition-colors">
                  <Instagram className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <span>© {new Date().getFullYear()} 暖心旅行社 · 暖心旅遊誌 All rights reserved.</span>
            <Link href="/admin/blog" className="text-slate-500 hover:text-amber-400 transition-colors">後台管理</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
