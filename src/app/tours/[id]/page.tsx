"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  MapPin, Calendar, Clock, Users, ArrowLeft, PhoneCall,
  CheckCircle2, AlertCircle, ChevronLeft, ChevronRight,
  UtensilsCrossed, BedDouble, Plane, Sparkles, CircleCheck, CircleX, Info,
} from "lucide-react";
import {
  supabase, Tour, TourPage, TourPageContent, TourPagePoster, TOUR_PAGE_CATEGORIES,
} from "@/lib/supabase";
import PublicNavbar from "@/components/PublicNavbar";
import { CARD_GRADIENTS, getDays } from "@/components/TourCard";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtFull(d: string) {
  return new Date(d).toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
    confirmed: { label: "招募中", icon: CheckCircle2, cls: "bg-green-100 text-green-700" },
    ongoing:   { label: "進行中", icon: CheckCircle2, cls: "bg-blue-100 text-blue-700"  },
    planning:  { label: "規劃中", icon: AlertCircle,  cls: "bg-yellow-100 text-yellow-700" },
    completed: { label: "已結束", icon: AlertCircle,  cls: "bg-slate-100 text-slate-500"   },
    cancelled: { label: "已取消", icon: AlertCircle,  cls: "bg-red-100 text-red-600"       },
    settled:   { label: "已結團", icon: AlertCircle,  cls: "bg-slate-100 text-slate-500"   },
  };
  const s = map[status] || map.planning;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${s.cls}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function NotFoundScreen() {
  return (
    <div className="min-h-screen bg-slate-50">
      <PublicNavbar />
      <div className="text-center py-28 px-4">
        <div className="text-6xl mb-5">😕</div>
        <p className="text-xl font-semibold text-slate-600 mb-4">找不到此行程</p>
        <Link href="/tours" className="text-cyan-600 hover:underline text-sm">
          返回所有行程
        </Link>
      </div>
    </div>
  );
}

// ── Poster carousel ───────────────────────────────────────────────────────────
function PosterCarousel({ posters, tour, days }: { posters: TourPagePoster[]; tour: Tour; days: number }) {
  const [idx, setIdx] = useState(0);
  const n = posters.length;

  const go = useCallback((d: number) => setIdx(i => (i + d + n) % n), [n]);

  useEffect(() => {
    if (n <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % n), 5000);
    return () => clearInterval(t);
  }, [n]);

  if (n === 0) return null;

  return (
    <div className="relative h-[58vh] md:h-[74vh] overflow-hidden bg-slate-900">
      {posters.map((p, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: i === idx ? 1 : 0, pointerEvents: i === idx ? "auto" : "none" }}
        >
          {p.image ? (
            <img src={p.image} alt={p.title} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]}`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10" />
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-14 max-w-5xl mx-auto">
            <div className="flex items-center gap-2 mb-3 md:mb-4 flex-wrap">
              <span className="text-[11px] md:text-xs bg-orange-500 text-white font-bold px-2.5 py-1 rounded-full">
                {days}天{days - 1}夜
              </span>
              <span className="text-[11px] md:text-xs bg-white/20 backdrop-blur-sm text-white font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {tour.destination}
              </span>
            </div>
            <h2 className="text-white text-3xl md:text-5xl font-bold leading-tight mb-2 md:mb-3 drop-shadow-lg"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
              {p.title}
            </h2>
            <p className="text-white/85 text-sm md:text-lg drop-shadow">{p.subtitle}</p>
          </div>
        </div>
      ))}

      {/* Arrows */}
      {n > 1 && (
        <>
          <button onClick={() => go(-1)} aria-label="上一張"
            className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 p-2 md:p-2.5 bg-black/30 hover:bg-black/55 text-white rounded-full backdrop-blur-sm transition-colors z-10">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={() => go(1)} aria-label="下一張"
            className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 p-2 md:p-2.5 bg-black/30 hover:bg-black/55 text-white rounded-full backdrop-blur-sm transition-colors z-10">
            <ChevronRight className="w-5 h-5" />
          </button>
          {/* Dots */}
          <div className="absolute bottom-4 right-5 md:right-14 flex gap-1.5 z-10">
            {posters.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`第${i + 1}張海報`}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Booking sidebar（價格/日期一律來自 tours table，與後台團管理綁定）──────────
function BookingSidebar({ tour, days }: { tour: Tour; days: number }) {
  const canJoin = tour.status === "confirmed" || tour.status === "ongoing";
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm sticky top-24">
      <div className="text-center mb-5">
        <div className="text-4xl font-bold text-cyan-600">
          NT${tour.selling_price.toLocaleString()}
        </div>
        <div className="text-sm text-slate-400 mt-1">成人費用 / 人</div>
      </div>

      <div className="space-y-2.5 text-sm mb-5 pb-5 border-b border-slate-100">
        {[
          { label: "目的地", value: tour.destination },
          { label: "出發日期", value: new Date(tour.start_date).toLocaleDateString("zh-TW") },
          { label: "回程日期", value: new Date(tour.end_date).toLocaleDateString("zh-TW") },
          { label: "行程天數", value: `${days} 天 ${days - 1} 夜` },
          { label: "出團人數", value: `${tour.pax} 人` },
        ].map((r) => (
          <div key={r.label} className="flex justify-between items-start">
            <span className="text-slate-500">{r.label}</span>
            <span className="font-medium text-slate-700 text-right max-w-[60%]">{r.value}</span>
          </div>
        ))}
      </div>

      {canJoin ? (
        <>
          <Link
            href={`/join/${tour.id}`}
            className="block w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-center font-semibold py-3.5 rounded-xl transition-colors text-sm"
          >
            立即報名
          </Link>
          <p className="text-xs text-slate-400 text-center mt-3">報名後將有專員與您聯繫確認</p>
        </>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-center text-sm text-slate-500">
          此行程目前無法報名
        </div>
      )}
    </div>
  );
}

// ── Price table（資料來自 tours，綁定後台）────────────────────────────────────
function PriceTable({ tour }: { tour: Tour }) {
  const prices = [
    { label: "成人", price: tour.selling_price, pax: tour.pax_adult },
    { label: "只參團（不含機票）", price: tour.price_tour_only || 0, pax: tour.pax_tour_only },
    { label: "兒童", price: tour.price_child || 0, pax: tour.pax_child },
    { label: "嬰兒", price: tour.price_infant || 0, pax: tour.pax_infant },
    ...(tour.custom_price_tiers || []).map((ct) => ({ label: ct.label, price: ct.price, pax: ct.pax })),
  ].filter((p) => p.price > 0);

  if (prices.length === 0 && !(tour.deposit_per_person && tour.deposit_per_person > 0)) return null;

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h2 className="font-bold text-slate-800 text-lg mb-4">費用說明</h2>
      <div className="divide-y divide-slate-50">
        {prices.map((p) => (
          <div key={p.label} className="flex justify-between items-center py-3">
            <div>
              <span className="text-sm text-slate-700 font-medium">{p.label}</span>
              {(p.pax ?? 0) > 0 && <span className="ml-2 text-xs text-slate-400">{p.pax} 人</span>}
            </div>
            <span className="font-semibold text-slate-800">NT${p.price.toLocaleString()}</span>
          </div>
        ))}
        {tour.deposit_per_person && tour.deposit_per_person > 0 ? (
          <div className="flex justify-between items-center py-3">
            <span className="text-sm text-slate-700 font-medium">訂金（每人）</span>
            <span className="font-semibold text-orange-600">NT${tour.deposit_per_person.toLocaleString()}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ═══ Rich page（AI 生成行程網頁）═══════════════════════════════════════════════
function RichTourPage({ tour, page, days }: { tour: Tour; page: TourPage; days: number }) {
  const c = page.content as TourPageContent;
  const cat = TOUR_PAGE_CATEGORIES.find(x => x.key === page.category);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <PublicNavbar />

      {/* ── 海報輪播 ── */}
      <PosterCarousel posters={page.hero_posters} tour={tour} days={days} />

      {/* ── 標題列 ── */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-6 md:py-8">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {cat && (
              <Link href={`/tours?cat=${cat.key}`}
                className="text-xs bg-cyan-50 text-cyan-700 hover:bg-cyan-100 px-2.5 py-1 rounded-full font-medium transition-colors">
                {cat.emoji} {cat.label}
              </Link>
            )}
            <StatusBadge status={tour.status} />
          </div>
          <h1 className="text-2xl md:text-4xl font-bold text-slate-900 mb-2 leading-snug">{tour.name}</h1>
          {c.subtitle && <p className="text-slate-500 text-sm md:text-base">{c.subtitle}</p>}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500 mt-4">
            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-cyan-600" />{fmtFull(tour.start_date)} 出發</span>
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-cyan-600" />{days} 天 {days - 1} 夜</span>
            <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-cyan-600" />{tour.pax} 人成行</span>
            <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-cyan-600" />{tour.destination}</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 grid md:grid-cols-3 gap-6">
        {/* ── 左欄主內容 ── */}
        <div className="md:col-span-2 space-y-6">

          {/* 行程介紹 */}
          {c.intro && (
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <h2 className="font-bold text-slate-800 text-lg mb-3 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-500" /> 行程介紹
              </h2>
              <p className="text-sm md:text-[15px] text-slate-600 leading-relaxed whitespace-pre-wrap">{c.intro}</p>
            </div>
          )}

          {/* 行程特色 */}
          {c.highlights.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <h2 className="font-bold text-slate-800 text-lg mb-4">行程特色</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {c.highlights.map((h, i) => (
                  <div key={i} className="flex gap-3 items-start bg-slate-50/70 rounded-xl p-4">
                    <span className="text-2xl shrink-0">{h.icon}</span>
                    <div>
                      <div className="font-semibold text-slate-800 text-sm mb-0.5">{h.title}</div>
                      <div className="text-xs text-slate-500 leading-relaxed">{h.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 航班資訊 */}
          {c.flights.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <h2 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                <Plane className="w-5 h-5 text-sky-500" /> 航班資訊
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 border-b border-slate-100">
                      <th className="text-left py-2 pr-3 font-medium">航班</th>
                      <th className="text-left py-2 pr-3 font-medium">日期</th>
                      <th className="text-left py-2 pr-3 font-medium">出發</th>
                      <th className="text-left py-2 pr-3 font-medium">抵達</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {c.flights.map((f, i) => (
                      <tr key={i}>
                        <td className="py-2.5 pr-3 font-semibold text-sky-700">{f.flight_no}</td>
                        <td className="py-2.5 pr-3 text-slate-600">{f.date}</td>
                        <td className="py-2.5 pr-3 text-slate-600">{f.from} {f.depart}</td>
                        <td className="py-2.5 pr-3 text-slate-600">{f.to} {f.arrive}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 每日行程 */}
          {c.days.length > 0 && (
            <div className="space-y-5">
              <h2 className="font-bold text-slate-800 text-xl px-1">每日行程</h2>
              {c.days.map((d) => (
                <div key={d.day} className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
                  {d.image && (
                    <div className="relative h-48 md:h-60 overflow-hidden">
                      <img src={d.image} alt={d.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4 flex items-end gap-3">
                        <span className="shrink-0 bg-orange-500 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow">
                          Day {d.day}
                        </span>
                        <h3 className="text-white font-bold text-base md:text-lg drop-shadow leading-snug">{d.title}</h3>
                      </div>
                    </div>
                  )}
                  <div className="p-5 md:p-6">
                    {!d.image && (
                      <div className="flex items-center gap-3 mb-3">
                        <span className="shrink-0 bg-orange-500 text-white text-sm font-bold px-3 py-1.5 rounded-full">
                          Day {d.day}
                        </span>
                        <h3 className="font-bold text-slate-800 text-base md:text-lg leading-snug">{d.title}</h3>
                      </div>
                    )}
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">{d.description}</p>

                    {d.spots.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {d.spots.map((s, i) => (
                          <span key={i} className="text-xs bg-cyan-50 text-cyan-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {s}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="grid sm:grid-cols-2 gap-3 text-xs">
                      <div className="bg-amber-50/70 rounded-xl p-3.5">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-700 mb-2">
                          <UtensilsCrossed className="w-3.5 h-3.5" /> 餐食
                        </div>
                        <div className="space-y-1 text-slate-600">
                          <div><span className="text-slate-400 mr-1.5">早</span>{d.meals.breakfast}</div>
                          <div><span className="text-slate-400 mr-1.5">午</span>{d.meals.lunch}</div>
                          <div><span className="text-slate-400 mr-1.5">晚</span>{d.meals.dinner}</div>
                        </div>
                      </div>
                      <div className="bg-indigo-50/70 rounded-xl p-3.5">
                        <div className="flex items-center gap-1.5 font-semibold text-indigo-700 mb-2">
                          <BedDouble className="w-3.5 h-3.5" /> 住宿
                        </div>
                        <div className="text-slate-600">{d.hotel || "—"}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 費用說明（綁定後台價格）*/}
          <PriceTable tour={tour} />

          {/* 費用包含 / 不含 */}
          {(c.includes.length > 0 || c.excludes.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-4">
              {c.includes.length > 0 && (
                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                  <h3 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-2">
                    <CircleCheck className="w-4.5 h-4.5 text-emerald-500" /> 費用包含
                  </h3>
                  <ul className="space-y-2 text-sm text-slate-600">
                    {c.includes.map((x, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>{x}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {c.excludes.length > 0 && (
                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                  <h3 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-2">
                    <CircleX className="w-4.5 h-4.5 text-rose-400" /> 費用不含
                  </h3>
                  <ul className="space-y-2 text-sm text-slate-600">
                    {c.excludes.map((x, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <span className="text-rose-400 shrink-0 mt-0.5">✕</span>{x}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 注意事項 */}
          {c.notes.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <h3 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-2">
                <Info className="w-4.5 h-4.5 text-sky-500" /> 注意事項
              </h3>
              <ul className="space-y-2 text-sm text-slate-600">
                {c.notes.map((x, i) => (
                  <li key={i} className="flex gap-2 items-start">
                    <span className="text-slate-300 shrink-0 mt-0.5">•</span>{x}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 聯絡提示 */}
          <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-5 flex items-start gap-3">
            <PhoneCall className="w-5 h-5 text-cyan-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-cyan-800 mb-1">需要了解更多行程細節？</p>
              <p className="text-cyan-700 leading-relaxed">報名後我們的專員會主動聯繫您，提供完整行程說明及注意事項。</p>
            </div>
          </div>
        </div>

        {/* ── 右欄報名卡 ── */}
        <div>
          <BookingSidebar tour={tour} days={days} />
        </div>
      </div>

      <footer className="bg-slate-900 text-slate-400 py-8 text-center text-sm mt-4">
        <p>© 2025 旅遊大聯盟 Travel Alliance. All rights reserved.</p>
      </footer>
    </div>
  );
}

// ═══ Basic page（無 AI 網頁時的原始版本）═══════════════════════════════════════
function BasicTourPage({ tour, days }: { tour: Tour; days: number }) {
  const grad = CARD_GRADIENTS[
    (tour.name.charCodeAt(0) + tour.destination.charCodeAt(0)) % CARD_GRADIENTS.length
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <PublicNavbar />

      <div className={`bg-gradient-to-br ${grad} text-white`}>
        <div className="max-w-5xl mx-auto px-4 pt-8 pb-12">
          <Link href="/tours" className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> 返回行程列表
          </Link>
          <div className="flex items-center gap-2 text-white/70 text-sm mb-3">
            <MapPin className="w-4 h-4" /> {tour.destination}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4 leading-snug">{tour.name}</h1>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/85 mb-4">
            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{fmtFull(tour.start_date)}</span>
            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{fmtFull(tour.end_date)}</span>
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{days} 天 {days - 1} 夜</span>
            <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />共 {tour.pax} 人出發</span>
          </div>
          <StatusBadge status={tour.status} />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-5">
          {tour.notes && (
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <h2 className="font-bold text-slate-800 text-lg mb-4">行程介紹</h2>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{tour.notes}</p>
            </div>
          )}
          <PriceTable tour={tour} />
          <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-5 flex items-start gap-3">
            <PhoneCall className="w-5 h-5 text-cyan-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-cyan-800 mb-1">需要了解更多行程細節？</p>
              <p className="text-cyan-700 leading-relaxed">報名後我們的專員會主動聯繫您，提供完整行程說明及注意事項。</p>
            </div>
          </div>
        </div>
        <div>
          <BookingSidebar tour={tour} days={days} />
        </div>
      </div>

      <footer className="bg-slate-900 text-slate-400 py-8 text-center text-sm mt-4">
        <p>© 2025 旅遊大聯盟 Travel Alliance. All rights reserved.</p>
      </footer>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TourDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tour, setTour] = useState<Tour | null>(null);
  const [page, setPage] = useState<TourPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase
        .from("tours")
        .select(
          "id,name,destination,start_date,end_date,pax,pax_adult,pax_child,pax_infant,pax_tour_only,selling_price,price_tour_only,price_child,price_infant,status,notes,deposit_per_person,custom_price_tiers"
        )
        .eq("id", id)
        .single(),
      supabase
        .from("tour_pages")
        .select("id,tour_id,status,category,hero_posters,content")
        .eq("tour_id", id)
        .eq("status", "published")
        .limit(1),
    ]).then(([tourRes, pageRes]) => {
      setTour(tourRes.data as Tour | null);
      setPage((pageRes.data?.[0] as TourPage) || null);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <LoadingScreen />;
  if (!tour) return <NotFoundScreen />;

  const days = getDays(tour.start_date, tour.end_date);

  return page
    ? <RichTourPage tour={tour} page={page} days={days} />
    : <BasicTourPage tour={tour} days={days} />;
}
