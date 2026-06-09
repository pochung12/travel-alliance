"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Globe, Star, Heart, Users, ArrowRight, BookOpen, Clock } from "lucide-react";
import { supabase, Tour } from "@/lib/supabase";
import PublicNavbar from "@/components/PublicNavbar";
import TourCard from "@/components/TourCard";

// ─── Blog types & helpers ──────────────────────────────────────────────────────
type BlogPost = {
  id: string; title: string; slug: string; excerpt: string;
  cover_image: string; category: string; author: string;
  published_at: string; created_at: string; reading_time: number;
};

const BLOG_CAT_LABEL: Record<string, string> = {
  japan: "日本", asia: "亞洲", europe: "歐洲", southeast_asia: "東南亞",
  china: "中國", tips: "旅遊攻略", food: "美食探索", travel: "旅遊",
};
const BLOG_CAT_BADGE: Record<string, string> = {
  japan: "bg-red-100 text-red-700", asia: "bg-emerald-100 text-emerald-700",
  europe: "bg-violet-100 text-violet-700", southeast_asia: "bg-amber-100 text-amber-700",
  china: "bg-rose-100 text-rose-700", tips: "bg-sky-100 text-sky-700",
  food: "bg-orange-100 text-orange-700", travel: "bg-slate-100 text-slate-700",
};
const BLOG_FALLBACK: Record<string, string> = {
  japan: "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?w=800&q=80",
  asia:  "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?w=800&q=80",
  europe:"https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&q=80",
  southeast_asia:"https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800&q=80",
  china: "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800&q=80",
  tips:  "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&q=80",
  food:  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80",
  travel:"https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80",
};
function blogCover(p: BlogPost) {
  return p.cover_image || BLOG_FALLBACK[p.category] || BLOG_FALLBACK.travel;
}
function fmtBlogDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
}

export default function HomePage() {
  const router = useRouter();
  const [searchVal, setSearchVal] = useState("");
  const [tours, setTours] = useState<Tour[]>([]);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    supabase
      .from("tours")
      .select("id,name,destination,start_date,end_date,pax,selling_price,status")
      .in("status", ["confirmed", "ongoing"])
      .eq("is_public", true)
      .order("start_date", { ascending: true })
      .limit(6)
      .then(({ data }) => setTours((data || []) as unknown as Tour[]));

    supabase
      .from("blog_posts")
      .select("id,title,slug,excerpt,cover_image,category,author,published_at,created_at,reading_time")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(3)
      .then(({ data }) => setBlogPosts((data || []) as BlogPost[]));
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchVal.trim();
    router.push(q ? `/tours?q=${encodeURIComponent(q)}` : "/tours");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <PublicNavbar />

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section
        className="relative min-h-[480px] flex items-center justify-center"
        style={{
          background:
            "linear-gradient(135deg, #0891b2 0%, #0e7490 50%, #155e75 100%)",
        }}
      >
        {/* dot-grid overlay */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative z-10 text-center px-4 py-20 max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight tracking-tight">
            探索世界，從這裡開始
          </h1>
          <p className="text-cyan-100 text-lg md:text-xl mb-10">
            精選全球優質行程，讓旅行更簡單、更美好
          </p>
          <form
            onSubmit={handleSearch}
            className="flex gap-2 bg-white rounded-2xl p-2 shadow-2xl max-w-xl mx-auto"
          >
            <div className="flex-1 flex items-center gap-2 px-3">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                className="flex-1 text-sm text-slate-700 placeholder:text-slate-400 bg-transparent outline-none py-1"
                placeholder="搜尋目的地或關鍵字..."
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-colors shrink-0"
            >
              搜尋行程
            </button>
          </form>
        </div>
      </section>

      {/* ── Hot categories ─────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-slate-800 text-center mb-8">
          熱門旅遊分類
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: "團體旅遊",
              desc: "專業導遊全程陪伴，放心暢遊全球",
              icon: "🌏",
              q: "團體旅遊",
              grad: "from-cyan-500 to-teal-600",
            },
            {
              label: "海島度假",
              desc: "藍天碧海，享受頂級海島體驗",
              icon: "🏝️",
              q: "海島",
              grad: "from-blue-500 to-cyan-600",
            },
            {
              label: "親子旅遊",
              desc: "歡樂家庭時光，創造美好回憶",
              icon: "👨‍👩‍👧‍👦",
              q: "親子",
              grad: "from-orange-400 to-amber-500",
            },
          ].map((c) => (
            <Link
              key={c.q}
              href={`/tours?q=${encodeURIComponent(c.label)}`}
              className={`relative bg-gradient-to-br ${c.grad} rounded-2xl p-6 text-white hover:scale-[1.02] active:scale-[0.99] transition-transform cursor-pointer overflow-hidden group`}
            >
              <div className="absolute right-5 bottom-5 text-6xl opacity-20 group-hover:opacity-30 transition-opacity select-none">
                {c.icon}
              </div>
              <div className="text-4xl mb-3">{c.icon}</div>
              <h3 className="font-bold text-xl mb-1">{c.label}</h3>
              <p className="text-white/80 text-sm">{c.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Featured tours ──────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pb-14">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-800">精選行程</h2>
          <Link
            href="/tours"
            className="flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 font-medium transition-colors"
          >
            查看更多 <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {tours.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {tours.map((t, i) => (
              <TourCard key={t.id} tour={t} idx={i} />
            ))}
          </div>
        ) : (
          <div className="text-center py-14 text-slate-400">
            <div className="text-5xl mb-4">✈️</div>
            <p className="font-medium">即將推出更多精彩行程，敬請期待！</p>
          </div>
        )}
      </section>

      {/* ── 旅遊誌精選 ───────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pb-14">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-amber-500" />
            <h2 className="text-2xl font-bold text-slate-800">旅遊誌精選</h2>
          </div>
          <Link
            href="/blog"
            className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 font-medium transition-colors"
          >
            查看更多 <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {blogPosts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {blogPosts.map((p) => (
              <Link
                key={p.id}
                href={`/blog/${p.slug}`}
                className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col"
              >
                {/* Cover */}
                <div className="relative h-48 overflow-hidden bg-slate-100">
                  <img
                    src={blogCover(p)}
                    alt={p.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <span
                    className={`absolute top-3 left-3 text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${
                      BLOG_CAT_BADGE[p.category] || BLOG_CAT_BADGE.travel
                    }`}
                  >
                    {BLOG_CAT_LABEL[p.category] ?? p.category}
                  </span>
                </div>
                {/* Body */}
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-bold text-slate-900 text-base leading-snug mb-2 line-clamp-2 group-hover:text-amber-700 transition-colors">
                    {p.title}
                  </h3>
                  <p className="text-slate-500 text-sm leading-relaxed line-clamp-3 flex-1 mb-3">
                    {p.excerpt}
                  </p>
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-100">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {p.reading_time} 分鐘閱讀
                    </span>
                    <span>{fmtBlogDate(p.published_at || p.created_at)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-14 rounded-2xl bg-amber-50 border border-amber-100">
            <div className="text-5xl mb-4">📖</div>
            <p className="font-medium text-slate-500 mb-3">精彩旅遊文章即將上線！</p>
            <Link
              href="/blog"
              className="text-sm text-amber-600 hover:text-amber-700 font-medium underline underline-offset-2"
            >
              前往旅遊誌
            </Link>
          </div>
        )}
      </section>

      {/* ── Why choose us ──────────────────────────────────────────────────────── */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-slate-800 text-center mb-12">
            為什麼選擇旅遊大聯盟
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              {
                icon: Globe,
                label: "行程最多元",
                desc: "數十家旅行社，超過萬筆行程任您挑選",
                bg: "bg-cyan-100",
                fg: "text-cyan-600",
              },
              {
                icon: Star,
                label: "價格最優惠",
                desc: "團體旅遊優惠與旅行社同步，買貴退差價",
                bg: "bg-orange-100",
                fg: "text-orange-500",
              },
              {
                icon: Heart,
                label: "值得信賴",
                desc: "不滿意包退小費，旅遊品質有保障",
                bg: "bg-teal-100",
                fg: "text-teal-600",
              },
              {
                icon: Users,
                label: "服務最貼心",
                desc: "專業客服團隊，全程協助您的旅程",
                bg: "bg-rose-100",
                fg: "text-rose-500",
              },
            ].map((f) => (
              <div key={f.label}>
                <div
                  className={`w-16 h-16 rounded-full ${f.bg} flex items-center justify-center mx-auto mb-4`}
                >
                  <f.icon className={`w-8 h-8 ${f.fg}`} />
                </div>
                <h3 className="font-bold text-slate-800 mb-2">{f.label}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-cyan-600 to-teal-600 py-16 text-center px-4">
        <h2 className="text-3xl font-bold text-white mb-3">
          立即註冊，開啟您的旅程
        </h2>
        <p className="text-cyan-100 mb-8 text-lg">
          註冊會員即享專屬優惠，讓旅行更划算
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/register"
            className="bg-white text-cyan-600 hover:bg-cyan-50 font-semibold px-8 py-3.5 rounded-xl transition-colors shadow-sm"
          >
            免費註冊
          </Link>
          <Link
            href="/tours"
            className="border-2 border-white text-white hover:bg-white/10 font-semibold px-8 py-3.5 rounded-xl transition-colors"
          >
            瀏覽行程
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-8 text-center text-sm">
        <p>© 2025 旅遊大聯盟 Travel Alliance. All rights reserved.</p>
      </footer>
    </div>
  );
}
