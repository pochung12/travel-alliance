"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Globe, Star, Heart, Users, ArrowRight } from "lucide-react";
import { supabase, Tour } from "@/lib/supabase";
import PublicNavbar from "@/components/PublicNavbar";
import TourCard from "@/components/TourCard";

export default function HomePage() {
  const router = useRouter();
  const [searchVal, setSearchVal] = useState("");
  const [tours, setTours] = useState<Tour[]>([]);

  useEffect(() => {
    supabase
      .from("tours")
      .select("id,name,destination,start_date,end_date,pax,selling_price,status")
      .in("status", ["confirmed", "ongoing"])
      .order("start_date", { ascending: true })
      .limit(6)
      .then(({ data }) => setTours((data || []) as unknown as Tour[]));
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
