"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X, MapPin } from "lucide-react";
import { supabase, Tour, TourPagePoster, TOUR_PAGE_CATEGORIES } from "@/lib/supabase";
import PublicNavbar from "@/components/PublicNavbar";
import TourCard from "@/components/TourCard";

interface PageMeta { category: string; image: string }

function ToursContent() {
  const searchParams = useSearchParams();
  const initQ = searchParams.get("q") || "";
  const initCat = searchParams.get("cat") || "";

  const [allTours, setAllTours] = useState<Tour[]>([]);
  const [pageMeta, setPageMeta] = useState<Record<string, PageMeta>>({});
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState(initQ);
  const [cat, setCat] = useState(initCat);
  const [destination, setDestination] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [showMobileFilter, setShowMobileFilter] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase
        .from("tours")
        .select("id,name,destination,start_date,end_date,pax,selling_price,original_price,status")
        .in("status", ["confirmed", "ongoing"])
        .eq("is_public", true)
        .order("start_date", { ascending: true }),
      supabase
        .from("tour_pages")
        .select("tour_id,category,hero_posters")
        .eq("status", "published"),
    ]).then(([toursRes, pagesRes]) => {
      setAllTours((toursRes.data || []) as unknown as Tour[]);
      const map: Record<string, PageMeta> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pagesRes.data || []).forEach((p: any) => {
        const posters = (p.hero_posters || []) as TourPagePoster[];
        map[p.tour_id] = { category: p.category || "", image: posters[0]?.image || "" };
      });
      setPageMeta(map);
      setLoading(false);
    });
  }, []);

  // Sync url params on mount
  useEffect(() => {
    setSearchQ(initQ);
  }, [initQ]);
  useEffect(() => {
    setCat(initCat);
  }, [initCat]);

  const destinations = Array.from(new Set(allTours.map((t) => t.destination))).sort();

  const filtered = allTours.filter((t) => {
    if (
      searchQ &&
      !t.name.toLowerCase().includes(searchQ.toLowerCase()) &&
      !t.destination.toLowerCase().includes(searchQ.toLowerCase())
    )
      return false;
    if (cat && pageMeta[t.id]?.category !== cat) return false;
    if (destination && t.destination !== destination) return false;
    if (minPrice && t.selling_price < +minPrice) return false;
    if (maxPrice && t.selling_price > +maxPrice) return false;
    return true;
  });

  const clearFilters = () => {
    setSearchQ("");
    setCat("");
    setDestination("");
    setMinPrice("");
    setMaxPrice("");
  };

  const hasFilter = searchQ || cat || destination || minPrice || maxPrice;

  const catLabel = (key: string) => {
    const c = TOUR_PAGE_CATEGORIES.find(x => x.key === key);
    return c ? `${c.emoji} ${c.label}` : "";
  };

  const FilterPanel = () => (
    <div className="space-y-5">
      <h3 className="font-semibold text-slate-700 flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-cyan-600" />
        篩選條件
      </h3>

      {/* Keyword */}
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1.5 block">關鍵字</label>
        <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-cyan-400 transition-shadow">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
            placeholder="搜尋行程..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
          {searchQ && (
            <button onClick={() => setSearchQ("")} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Destination */}
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1.5 block">目的地</label>
        <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-cyan-400 transition-shadow">
          <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            className="flex-1 text-sm bg-transparent outline-none text-slate-700"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="">選擇目的地</option>
            {destinations.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Price range */}
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1.5 block">
          價格範圍 (NT$)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="最低"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400 bg-white"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
          />
          <input
            type="number"
            placeholder="最高"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400 bg-white"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </div>
      </div>

      {/* Search + Clear */}
      <div className="space-y-2">
        <button
          onClick={clearFilters}
          className="w-full text-sm text-slate-500 hover:text-red-500 py-2 border border-slate-200 hover:border-red-200 rounded-xl transition-colors"
        >
          清除篩選
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none -mx-4 px-4">
        <button
          onClick={() => setCat("")}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
            !cat ? "bg-cyan-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-cyan-400 hover:text-cyan-600"
          }`}
        >
          全部行程
        </button>
        {TOUR_PAGE_CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(cat === c.key ? "" : c.key)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              cat === c.key ? "bg-cyan-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-cyan-400 hover:text-cyan-600"
            }`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {/* Mobile filter toggle */}
      <div className="md:hidden mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">
          所有行程
          {!loading && (
            <span className="text-sm font-normal text-slate-400 ml-2">
              共 {filtered.length} 筆
            </span>
          )}
        </h1>
        <button
          onClick={() => setShowMobileFilter(!showMobileFilter)}
          className="flex items-center gap-2 text-sm border border-slate-200 px-3 py-2 rounded-xl text-slate-600 hover:border-cyan-400 hover:text-cyan-600 transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" />
          篩選
          {hasFilter && (
            <span className="w-2 h-2 bg-orange-500 rounded-full" />
          )}
        </button>
      </div>

      {/* Mobile filter panel */}
      {showMobileFilter && (
        <div className="md:hidden bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
          <FilterPanel />
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:block w-64 shrink-0">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sticky top-24">
            <FilterPanel />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="hidden md:flex items-center justify-between mb-5">
            <h1 className="text-xl font-bold text-slate-800">
              所有行程
              {!loading && (
                <span className="text-sm font-normal text-slate-400 ml-2">
                  共 {filtered.length} 筆
                </span>
              )}
            </h1>
            {hasFilter && (
              <button
                onClick={clearFilters}
                className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> 清除篩選
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl overflow-hidden border border-slate-100 animate-pulse"
                >
                  <div className="h-44 bg-slate-200" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-slate-200 rounded w-3/4" />
                    <div className="h-3 bg-slate-200 rounded w-1/2" />
                    <div className="h-6 bg-slate-200 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <div className="text-5xl mb-4">🔍</div>
              <p className="text-base font-medium mb-2">沒有找到符合條件的行程</p>
              <p className="text-sm mb-4">請調整篩選條件再試試</p>
              {hasFilter && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-cyan-600 hover:underline"
                >
                  清除所有篩選
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map((t, i) => (
                <TourCard
                  key={t.id}
                  tour={t}
                  idx={i}
                  image={pageMeta[t.id]?.image}
                  categoryLabel={catLabel(pageMeta[t.id]?.category || "")}
                  categoryKey={pageMeta[t.id]?.category}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ToursPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <PublicNavbar />
      <Suspense
        fallback={
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <ToursContent />
      </Suspense>
      <footer className="bg-slate-900 text-slate-400 py-8 text-center text-sm mt-4">
        <p>© 暖心旅行社 2026 旅遊大聯盟 Travel Alliance. All rights reserved.</p>
      </footer>
    </div>
  );
}
