"use client";
import { useEffect, useState } from "react";
import {
  supabase, Tour, TourPage, TourPagePoster, TourPageContent, TOUR_PAGE_CATEGORIES,
} from "@/lib/supabase";
import {
  Sparkles, Globe, Eye, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, EyeOff, ExternalLink, Image as ImageIcon,
} from "lucide-react";

interface Props { tour: Tour }

const EMPTY_CONTENT: TourPageContent = {
  subtitle: "", intro: "", highlights: [], days: [],
  flights: [], includes: [], excludes: [], notes: [],
};

function getDays(start: string, end: string) {
  const d = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
  return d + 1;
}

export default function TourPageTab({ tour }: Props) {
  const [page, setPage]         = useState<TourPage | null>(null);
  const [loading, setLoading]   = useState(true);
  const [rawInput, setRawInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    supabase
      .from("tour_pages")
      .select("*")
      .eq("tour_id", tour.id)
      .limit(1)
      .then(({ data }) => {
        const row = data?.[0] as TourPage | undefined;
        if (row) {
          setPage(row);
          setRawInput(row.raw_input || "");
        }
        setLoading(false);
      });
  }, [tour.id]);

  // ── AI 生成 ──────────────────────────────────────────────────────────────────
  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/tour-page/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tour: {
            name: tour.name,
            destination: tour.destination,
            start_date: tour.start_date,
            end_date: tour.end_date,
            days: getDays(tour.start_date, tour.end_date),
            selling_price: tour.selling_price,
          },
          rawInput,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "生成失敗，請重試"); return; }

      // 自動存為草稿（保留原本的 status 與 category 覆寫）
      const payload = {
        tour_id:      tour.id,
        category:     json.category || page?.category || "group",
        hero_posters: json.hero_posters || [],
        content:      json.content || EMPTY_CONTENT,
        raw_input:    rawInput,
        status:       page?.status || "draft",
        updated_at:   new Date().toISOString(),
      };
      if (page?.id) {
        const { error: e } = await supabase.from("tour_pages").update(payload).eq("id", page.id);
        if (e) { setError("儲存失敗：" + e.message); return; }
        setPage(prev => prev ? { ...prev, ...payload } as TourPage : prev);
      } else {
        const { data, error: e } = await supabase.from("tour_pages").insert([payload]).select("*").single();
        if (e) { setError("儲存失敗：" + e.message); return; }
        setPage(data as TourPage);
      }
    } catch {
      setError("生成失敗，請檢查網路後重試");
    } finally {
      setGenerating(false);
    }
  };

  // ── 發布 / 取消發布 ──────────────────────────────────────────────────────────
  const togglePublish = async () => {
    if (!page) return;
    setSaving(true);
    const next = page.status === "published" ? "draft" : "published";
    const { error: e } = await supabase.from("tour_pages")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", page.id);
    if (!e) {
      setPage(prev => prev ? { ...prev, status: next } : prev);
      // 發布時同步開啟前台公開，讓搜尋找得到
      if (next === "published" && !tour.is_public) {
        await supabase.from("tours").update({ is_public: true }).eq("id", tour.id);
      }
    }
    setSaving(false);
  };

  const changeCategory = async (cat: string) => {
    if (!page) return;
    await supabase.from("tour_pages").update({ category: cat }).eq("id", page.id);
    setPage(prev => prev ? { ...prev, category: cat } : prev);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  const content = page?.content as TourPageContent | undefined;
  const posters = (page?.hero_posters || []) as TourPagePoster[];
  const hasPage = !!page && (posters.length > 0 || (content?.days?.length || 0) > 0);

  return (
    <div className="space-y-4">

      {/* ── 素材輸入區 ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            AI 行程網頁生成器
          </h3>
          <span className="text-xs text-slate-400">
            綁定：{tour.name}（{new Date(tour.start_date).toLocaleDateString("zh-TW")} 出發 · NT${tour.selling_price.toLocaleString()}）
          </span>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          貼上行程素材（每日行程、景點、餐食、飯店、航班等任何文字資料），AI 會自動生成包含
          <span className="text-violet-600 dark:text-violet-400 font-medium"> 4 張特色海報、每日行程（每天 3 張配圖）、景點美照（每個景點 3 張）、餐食住宿、航班資訊 </span>
          的雜誌級行程網頁。日期與價格自動帶入本團資料。
        </p>

        <textarea
          className="w-full h-48 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y font-mono"
          placeholder={`範例：
Day1 台北 → 東京成田，午後淺草雷門、晴空塔，晚餐燒肉放題，宿：東京灣希爾頓
Day2 箱根一日遊，蘆之湖海賊船、大涌谷，溫泉飯店會席料理...
航班：BR198 1/15 TPE 09:00 → NRT 13:00
飯店：東京灣希爾頓 x2晚、箱根湯本溫泉飯店 x1晚
...（素材越詳細，生成越精準）`}
          value={rawInput}
          onChange={e => setRawInput(e.target.value)}
        />

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-all shadow-sm"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> AI 生成中（約 30-60 秒）…</>
              : hasPage
                ? <><RefreshCw className="w-4 h-4" /> 重新生成行程網頁</>
                : <><Sparkles className="w-4 h-4" /> AI 生成行程網頁</>
            }
          </button>
          {error && (
            <span className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </span>
          )}
        </div>
      </div>

      {/* ── 生成結果 ────────────────────────────────────────────────────────── */}
      {hasPage && page && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">

          {/* 狀態列 */}
          <div className="px-4 md:px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between flex-wrap gap-3 bg-slate-50/50 dark:bg-slate-700/30">
            <div className="flex items-center gap-3 flex-wrap">
              {page.status === "published" ? (
                <span className="flex items-center gap-1.5 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 已發布
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full font-medium">
                  <AlertCircle className="w-3.5 h-3.5" /> 草稿（前台不可見）
                </span>
              )}
              {/* 分類選擇 */}
              <select
                value={page.category}
                onChange={e => changeCategory(e.target.value)}
                className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-400"
              >
                {TOUR_PAGE_CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/tours/${tour.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-cyan-400 hover:text-cyan-600 rounded-lg transition-colors"
              >
                <Eye className="w-3.5 h-3.5" /> 預覽頁面 <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={togglePublish}
                disabled={saving}
                className={`flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                  page.status === "published"
                    ? "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                }`}
              >
                {page.status === "published"
                  ? <><EyeOff className="w-3.5 h-3.5" /> 取消發布</>
                  : <><Globe className="w-3.5 h-3.5" /> 發布到前台</>
                }
              </button>
            </div>
          </div>

          {/* 海報預覽 */}
          {posters.length > 0 && (
            <div className="p-4 md:p-5 border-b border-slate-100 dark:border-slate-700">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" /> 行程海報（{posters.length} 張）
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {posters.map((p, i) => (
                  <div key={i} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 group">
                    {p.image ? (
                      <img src={p.image} alt={p.title} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500 to-blue-600" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <div className="text-white font-bold text-sm leading-snug drop-shadow">{p.title}</div>
                      <div className="text-white/75 text-[10px] mt-0.5 leading-tight">{p.subtitle}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 內容摘要 */}
          {content && (
            <div className="p-4 md:p-5 space-y-4">
              {content.subtitle && (
                <div>
                  <span className="text-xs text-slate-400 block mb-0.5">副標語</span>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{content.subtitle}</p>
                </div>
              )}
              {content.intro && (
                <div>
                  <span className="text-xs text-slate-400 block mb-0.5">行程介紹</span>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">{content.intro}</p>
                </div>
              )}
              {content.highlights.length > 0 && (
                <div>
                  <span className="text-xs text-slate-400 block mb-1.5">行程特色（{content.highlights.length}）</span>
                  <div className="flex flex-wrap gap-2">
                    {content.highlights.map((h, i) => (
                      <span key={i} className="text-xs bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 px-2.5 py-1 rounded-full">
                        {h.icon} {h.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {content.days.length > 0 && (
                <div>
                  <span className="text-xs text-slate-400 block mb-1.5">每日行程（{content.days.length} 天）</span>
                  <div className="space-y-1.5">
                    {content.days.map(d => {
                      const imgCount = d.images?.length || (d.image ? 1 : 0);
                      return (
                        <div key={d.day} className="flex items-center gap-2 text-xs">
                          <span className="shrink-0 w-12 text-center font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 rounded-full py-0.5">D{d.day}</span>
                          <span className="text-slate-600 dark:text-slate-300 truncate">{d.title}</span>
                          {imgCount > 0 && (
                            <span className="flex items-center gap-0.5 text-emerald-600 shrink-0">
                              <ImageIcon className="w-3 h-3" /> {imgCount}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {(content.gallery?.length || 0) > 0 && (
                <div>
                  <span className="text-xs text-slate-400 block mb-1.5">景點美照（{content.gallery!.length} 個景點 × 3 張）</span>
                  <div className="flex flex-wrap gap-2">
                    {content.gallery!.map((g, i) => (
                      <span key={i} className="text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded-full flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> {g.name}（{g.images.length}）
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-xs text-slate-400 pt-2 border-t border-slate-50 dark:border-slate-700">
                <span>✈️ 航班 {content.flights.length} 筆</span>
                <span>🖼 景點美照 {content.gallery?.length || 0} 組</span>
                <span>✅ 費用包含 {content.includes.length} 項</span>
                <span>❌ 費用不含 {content.excludes.length} 項</span>
                <span>📌 注意事項 {content.notes.length} 項</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
