"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  MapPin, Calendar, Clock, Users, ArrowLeft, PhoneCall,
  CheckCircle2, AlertCircle, ChevronLeft, ChevronRight,
  UtensilsCrossed, BedDouble, Plane, CircleCheck, CircleX, Info,
  Camera, X, ArrowRight,
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
function fmtShort(d: string) {
  return new Date(d).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", weekday: "short" });
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

// ── Scroll reveal ─────────────────────────────────────────────────────────────
function Reveal({
  children, delay = 0, className = "",
}: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect(); } },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: vis ? 1 : 0,
        transform: vis ? "none" : "translateY(32px)",
        transition: `opacity .8s cubic-bezier(.2,.65,.3,1) ${delay}ms, transform .8s cubic-bezier(.2,.65,.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ── Booking sidebar（Basic 版用；價格/日期來自 tours，與後台綁定）──────────────
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
function PriceRows({ tour }: { tour: Tour }) {
  const prices = [
    { label: "成人", price: tour.selling_price, pax: tour.pax_adult },
    { label: "只參團（不含機票）", price: tour.price_tour_only || 0, pax: tour.pax_tour_only },
    { label: "兒童", price: tour.price_child || 0, pax: tour.pax_child },
    { label: "嬰兒", price: tour.price_infant || 0, pax: tour.pax_infant },
    ...(tour.custom_price_tiers || []).map((ct) => ({ label: ct.label, price: ct.price, pax: ct.pax })),
  ].filter((p) => p.price > 0);

  return (
    <div className="divide-y divide-[#ece4d0]">
      {prices.map((p) => (
        <div key={p.label} className="flex justify-between items-center py-3.5">
          <span className="text-sm font-medium">{p.label}</span>
          <span className="font-bold text-lg">NT${p.price.toLocaleString()}</span>
        </div>
      ))}
      {tour.deposit_per_person && tour.deposit_per_person > 0 ? (
        <div className="flex justify-between items-center py-3.5">
          <span className="text-sm font-medium">訂金（每人）</span>
          <span className="font-bold text-[#b04a3a]">NT${tour.deposit_per_person.toLocaleString()}</span>
        </div>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rich page（AI 生成行程網頁 — 雜誌風格）
// ═══════════════════════════════════════════════════════════════════════════════

const INK = "#27382e";
const RED = "#a8453a";
const BG  = "#f7f2e7";
const CARD = "#fdfaf2";

// 圖片收集（向下相容單圖版）
function dayImgs(d: { image: string; images?: string[] }): string[] {
  if (d.images && d.images.length > 0) return d.images;
  return d.image ? [d.image] : [];
}

// ── 三圖拼貼 ──────────────────────────────────────────────────────────────────
function PhotoCollage({
  images, caption, onView, hClass = "h-[340px] md:h-[480px]",
}: { images: string[]; caption?: string; onView: (url: string) => void; hClass?: string }) {
  if (images.length === 0) return null;

  if (images.length === 1) {
    return (
      <div className={`relative rounded-3xl overflow-hidden shadow-xl ${hClass} group`}>
        <img src={images[0]} alt={caption || ""} loading="lazy"
          onClick={() => onView(images[0])}
          className="w-full h-full object-cover cursor-zoom-in transition-transform duration-700 group-hover:scale-105" />
        {caption && <CaptionPill text={caption} />}
      </div>
    );
  }

  if (images.length === 2) {
    return (
      <div className={`relative grid grid-cols-2 gap-2 ${hClass}`}>
        {images.map((img, i) => (
          <div key={i} className="relative rounded-3xl overflow-hidden shadow-xl group">
            <img src={img} alt="" loading="lazy" onClick={() => onView(img)}
              className="w-full h-full object-cover cursor-zoom-in transition-transform duration-700 group-hover:scale-105" />
          </div>
        ))}
        {caption && <CaptionPill text={caption} />}
      </div>
    );
  }

  return (
    <div className={`relative grid grid-cols-3 grid-rows-2 gap-2 ${hClass}`}>
      <div className="relative col-span-2 row-span-2 rounded-3xl overflow-hidden shadow-xl group">
        <img src={images[0]} alt="" loading="lazy" onClick={() => onView(images[0])}
          className="w-full h-full object-cover cursor-zoom-in transition-transform duration-700 group-hover:scale-105" />
      </div>
      {[images[1], images[2]].map((img, i) => (
        <div key={i} className="relative rounded-2xl overflow-hidden shadow-lg group">
          <img src={img} alt="" loading="lazy" onClick={() => onView(img)}
            className="w-full h-full object-cover cursor-zoom-in transition-transform duration-700 group-hover:scale-105" />
        </div>
      ))}
      {caption && <CaptionPill text={caption} />}
    </div>
  );
}

function CaptionPill({ text }: { text: string }) {
  return (
    <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-[80%] flex items-center gap-2 bg-black/55 backdrop-blur-sm text-white text-xs px-3.5 py-2 rounded-full pointer-events-none">
      <Camera className="w-3.5 h-3.5 shrink-0 opacity-70" />
      <span className="truncate">{text}</span>
    </div>
  );
}

// ── 海報輪播（Ken Burns）──────────────────────────────────────────────────────
function HeroCarousel({
  posters, tour, days, subtitle,
}: { posters: TourPagePoster[]; tour: Tour; days: number; subtitle: string }) {
  const [idx, setIdx] = useState(0);
  const n = posters.length;
  const go = useCallback((d: number) => setIdx(i => (i + d + n) % n), [n]);

  useEffect(() => {
    if (n <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % n), 6000);
    return () => clearInterval(t);
  }, [n]);

  return (
    <div className="relative h-[78vh] md:h-[92vh] overflow-hidden" style={{ background: INK }}>
      {posters.map((p, i) => (
        <div key={i}
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: i === idx ? 1 : 0, pointerEvents: i === idx ? "auto" : "none" }}>
          {p.image ? (
            <img src={p.image} alt={p.title}
              className={`absolute inset-0 w-full h-full object-cover ${i === idx ? "kb-zoom" : ""}`} />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]}`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/20" />
          <div className="absolute bottom-0 left-0 right-0 pb-16 md:pb-24">
            <div className="max-w-6xl mx-auto px-5 md:px-8">
              <div className="flex items-center gap-2.5 mb-5 flex-wrap">
                <span className="text-[11px] md:text-xs tracking-[0.25em] uppercase text-amber-300/90 font-semibold">
                  {fmtShort(tour.start_date)} 出發 ・ {days}天{days - 1}夜 ・ {tour.destination}
                </span>
              </div>
              <h2 className="serif-tc text-white text-4xl md:text-7xl font-black leading-[1.15] mb-4 md:mb-6 drop-shadow-2xl max-w-4xl">
                {p.title}
              </h2>
              <p className="text-white/80 text-sm md:text-xl max-w-2xl leading-relaxed drop-shadow">
                {p.subtitle || subtitle}
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* 出發日戳章 */}
      <div className="absolute top-6 right-5 md:top-10 md:right-10 w-20 h-20 md:w-28 md:h-28 rounded-full border-2 flex flex-col items-center justify-center rotate-12 select-none"
        style={{ borderColor: "rgba(255,255,255,.55)", color: "rgba(255,255,255,.9)" }}>
        <span className="text-[9px] md:text-[11px] tracking-widest">DEPART</span>
        <span className="serif-tc font-bold text-sm md:text-lg leading-tight">
          {new Date(tour.start_date).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" })}
        </span>
        <span className="text-[9px] md:text-[11px]">{new Date(tour.start_date).getFullYear()}</span>
      </div>

      {n > 1 && (
        <>
          <button onClick={() => go(-1)} aria-label="上一張"
            className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 p-2.5 bg-white/10 hover:bg-white/25 text-white rounded-full backdrop-blur-sm transition-colors z-10">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={() => go(1)} aria-label="下一張"
            className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 p-2.5 bg-white/10 hover:bg-white/25 text-white rounded-full backdrop-blur-sm transition-colors z-10">
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-6 right-5 md:right-8 flex gap-1.5 z-10">
            {posters.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`第${i + 1}張海報`}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-7 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────
function SectionHead({
  kicker, title, desc,
}: { kicker: string; title: string; desc?: string }) {
  return (
    <Reveal className="mb-10 md:mb-14">
      <div className="text-[11px] md:text-xs tracking-[0.3em] uppercase font-bold mb-3" style={{ color: RED }}>
        {kicker}
      </div>
      <h2 className="serif-tc text-3xl md:text-5xl font-black leading-tight" style={{ color: INK }}>
        {title}
      </h2>
      {desc && <p className="mt-4 text-sm md:text-base max-w-2xl leading-relaxed" style={{ color: "#6b6a5c" }}>{desc}</p>}
    </Reveal>
  );
}

function RichTourPage({ tour, page, days }: { tour: Tour; page: TourPage; days: number }) {
  const c = page.content as TourPageContent;
  const cat = TOUR_PAGE_CATEGORIES.find(x => x.key === page.category);
  const canJoin = tour.status === "confirmed" || tour.status === "ongoing";
  const [lightbox, setLightbox] = useState<string | null>(null);

  // 旅館清單（從每日行程彙整）
  const hotels = Array.from(new Set(
    c.days.map(d => d.hotel).filter(h => h && h !== "溫暖的家")
  ));

  const gallery = c.gallery || [];

  const NAV = [
    { id: "overview",  label: "總覽" },
    { id: "highlights", label: "行程特色" },
    { id: "days",      label: "每日行程" },
    ...(gallery.length > 0 ? [{ id: "gallery", label: "景點美照" }] : []),
    { id: "price",     label: "費用說明" },
    { id: "notes",     label: "旅遊須知" },
  ];

  return (
    <div className="min-h-screen" style={{ background: BG, color: INK }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700;900&display=swap');
        .serif-tc { font-family: 'Noto Serif TC', Georgia, 'Times New Roman', serif; }
        @keyframes kbZoom { 0% { transform: scale(1.02); } 100% { transform: scale(1.14); } }
        .kb-zoom { animation: kbZoom 9s ease-out both; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { scrollbar-width: none; }
      `}</style>

      <PublicNavbar />

      {/* ── Hero ── */}
      <HeroCarousel posters={page.hero_posters} tour={tour} days={days} subtitle={c.subtitle} />

      {/* ── 錨點導覽（sticky）── */}
      <div className="sticky top-16 z-40 border-b backdrop-blur-md"
        style={{ background: "rgba(247,242,231,.92)", borderColor: "#e7ddc6" }}>
        <div className="max-w-6xl mx-auto px-4 h-13 flex items-center gap-1 overflow-x-auto scrollbar-none py-2">
          {NAV.map(n => (
            <a key={n.id} href={`#${n.id}`}
              className="shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors hover:bg-[#ece3cd]"
              style={{ color: "#54604f" }}>
              {n.label}
            </a>
          ))}
          <div className="ml-auto hidden md:flex items-center gap-3 shrink-0 pl-4">
            <span className="serif-tc font-bold text-lg" style={{ color: RED }}>
              NT${tour.selling_price.toLocaleString()}<span className="text-xs font-normal ml-0.5" style={{ color: "#8a8268" }}>起</span>
            </span>
            {canJoin && (
              <Link href={`/join/${tour.id}`}
                className="text-white text-sm font-semibold px-5 py-2 rounded-full transition-opacity hover:opacity-90"
                style={{ background: RED }}>
                立即報名
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── 總覽 ── */}
      <section id="overview" className="scroll-mt-32 max-w-6xl mx-auto px-5 md:px-8 pt-16 md:pt-24 pb-8 md:pb-14">
        <div className="grid md:grid-cols-5 gap-10 md:gap-14 items-start">
          <Reveal className="md:col-span-3">
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              {cat && (
                <Link href={`/tours?cat=${cat.key}`}
                  className="text-xs font-medium px-3 py-1 rounded-full transition-colors"
                  style={{ background: "#e9dfc8", color: "#6b6248" }}>
                  {cat.emoji} {cat.label}
                </Link>
              )}
              <StatusBadge status={tour.status} />
            </div>
            <h1 className="serif-tc text-3xl md:text-5xl font-black leading-[1.25] mb-5">
              {tour.name}
            </h1>
            {c.subtitle && (
              <p className="serif-tc text-lg md:text-2xl font-semibold mb-6" style={{ color: RED }}>
                {c.subtitle}
              </p>
            )}
            <p className="text-[15px] md:text-base leading-[1.9] whitespace-pre-wrap" style={{ color: "#5c5a4c" }}>
              {c.intro}
            </p>
          </Reveal>

          {/* 集合資訊卡 */}
          <Reveal delay={150} className="md:col-span-2">
            <div className="rounded-3xl p-7 md:p-8 text-white shadow-2xl" style={{ background: INK }}>
              <div className="text-[11px] tracking-[0.25em] uppercase mb-5 opacity-60">Tour Info ・ 出團資訊</div>
              <div className="space-y-4">
                {[
                  { icon: Calendar, label: "出發日期", value: fmtFull(tour.start_date) },
                  { icon: Calendar, label: "回程日期", value: fmtFull(tour.end_date) },
                  { icon: Clock,    label: "行程天數", value: `${days} 天 ${days - 1} 夜` },
                  { icon: Users,    label: "出團人數", value: `${tour.pax} 人成行` },
                  { icon: MapPin,   label: "目的地",   value: tour.destination },
                ].map(r => (
                  <div key={r.label} className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                      <r.icon className="w-4 h-4 text-amber-300" />
                    </div>
                    <div>
                      <div className="text-[11px] opacity-55">{r.label}</div>
                      <div className="text-sm font-semibold">{r.value}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-7 pt-6 border-t border-white/15 flex items-end justify-between">
                <div>
                  <div className="text-[11px] opacity-55 mb-0.5">成人費用</div>
                  <div className="serif-tc text-3xl font-black text-amber-300">
                    NT${tour.selling_price.toLocaleString()}
                  </div>
                </div>
                {canJoin && (
                  <Link href={`/join/${tour.id}`}
                    className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-full text-white transition-opacity hover:opacity-90"
                    style={{ background: RED }}>
                    立即報名 <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          </Reveal>
        </div>

        {/* 航班 + 旅館 */}
        {(c.flights.length > 0 || hotels.length > 0) && (
          <div className="grid md:grid-cols-2 gap-5 mt-12 md:mt-16">
            {c.flights.length > 0 && (
              <Reveal>
                <div className="rounded-3xl p-7 h-full shadow-sm" style={{ background: CARD, border: "1px solid #ece3cd" }}>
                  <h3 className="flex items-center gap-2 font-bold mb-5" style={{ color: RED }}>
                    <Plane className="w-4.5 h-4.5" /> 參考航班
                  </h3>
                  <div className="divide-y" style={{ borderColor: "#ece4d0" }}>
                    {c.flights.map((f, i) => (
                      <div key={i} className="py-3.5 flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-[15px]">{f.flight_no}</div>
                          <div className="text-xs mt-0.5" style={{ color: "#8a8268" }}>
                            {f.from} → {f.to}　{f.date}
                          </div>
                        </div>
                        <div className="font-semibold text-sm whitespace-nowrap">{f.depart}–{f.arrive}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            )}
            {hotels.length > 0 && (
              <Reveal delay={120}>
                <div className="rounded-3xl p-7 h-full shadow-sm" style={{ background: CARD, border: "1px solid #ece3cd" }}>
                  <h3 className="flex items-center gap-2 font-bold mb-5" style={{ color: RED }}>
                    <BedDouble className="w-4.5 h-4.5" /> 住宿安排
                  </h3>
                  <div className="space-y-2.5">
                    {hotels.map((h, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                        style={{ background: "#f3ecda" }}>
                        <span className="serif-tc font-bold text-sm shrink-0" style={{ color: RED }}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="text-sm font-medium">{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            )}
          </div>
        )}
      </section>

      {/* ── 行程特色 ── */}
      {c.highlights.length > 0 && (
        <section id="highlights" className="scroll-mt-32 max-w-6xl mx-auto px-5 md:px-8 py-12 md:py-20">
          <SectionHead kicker="Highlights" title="行程特色" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-7">
            {c.highlights.map((h, i) => (
              <Reveal key={i} delay={i * 90}>
                <div className="group rounded-3xl overflow-hidden h-full shadow-md hover:shadow-2xl transition-all duration-500 hover:-translate-y-1.5"
                  style={{ background: CARD, border: "1px solid #ece3cd" }}>
                  {h.image ? (
                    <>
                      {/* 大圖 */}
                      <div className="relative h-56 md:h-64 overflow-hidden cursor-zoom-in"
                        onClick={() => setLightbox(h.image!)}>
                        <img src={h.image} alt={h.title} loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
                        {/* emoji 圓徽章（跨在圖片與內容交界）*/}
                        <div className="absolute -bottom-0 left-6 translate-y-1/2 w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-lg z-10"
                          style={{ background: CARD, border: "1px solid #ece3cd" }}>
                          {h.icon}
                        </div>
                      </div>
                      {/* 內容 */}
                      <div className="px-6 pt-11 pb-6">
                        <div className="serif-tc font-black text-xl mb-2.5">{h.title}</div>
                        <div className="text-sm leading-[1.8]" style={{ color: "#6b6a5c" }}>{h.desc}</div>
                      </div>
                    </>
                  ) : (
                    /* 無圖 fallback（舊版資料）*/
                    <div className="p-6 md:p-7 h-full">
                      <div className="text-4xl mb-4">{h.icon}</div>
                      <div className="serif-tc font-bold text-lg mb-2">{h.title}</div>
                      <div className="text-sm leading-relaxed" style={{ color: "#6b6a5c" }}>{h.desc}</div>
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ── 每日行程 ── */}
      {c.days.length > 0 && (
        <section id="days" className="scroll-mt-32 max-w-6xl mx-auto px-5 md:px-8 py-12 md:py-20">
          <SectionHead kicker="Daily Route" title="每日行程"
            desc="每一天以重點照片與行程卡組成，把景點介紹、餐食安排與住宿資訊放在同一個閱讀節奏中。" />

          <div className="space-y-16 md:space-y-24">
            {c.days.map((d, di) => {
              const imgs = dayImgs(d);
              const flip = di % 2 === 1;
              const dateOfDay = new Date(new Date(tour.start_date).getTime() + (d.day - 1) * 86400000);
              return (
                <div key={d.day}
                  className={`flex flex-col gap-6 md:gap-12 md:items-center ${flip ? "md:flex-row-reverse" : "md:flex-row"}`}>
                  {/* 照片拼貼 */}
                  {imgs.length > 0 && (
                    <Reveal className="md:w-[55%] shrink-0 w-full" delay={flip ? 120 : 0}>
                      <PhotoCollage images={imgs} caption={d.spots[0] || d.title} onView={setLightbox} />
                    </Reveal>
                  )}

                  {/* 行程內容 */}
                  <Reveal className="flex-1" delay={flip ? 0 : 120}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="serif-tc w-14 h-14 rounded-full border-2 flex items-center justify-center font-black text-lg shrink-0"
                        style={{ borderColor: RED, color: RED }}>
                        D{d.day}
                      </span>
                      <span className="text-sm font-medium" style={{ color: "#8a8268" }}>
                        {dateOfDay.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", weekday: "short" })}
                      </span>
                    </div>
                    <h3 className="serif-tc text-2xl md:text-[34px] font-black leading-snug mb-4">
                      {d.title}
                    </h3>
                    <p className="text-[15px] leading-[1.9] mb-5" style={{ color: "#5c5a4c" }}>
                      {d.description}
                    </p>

                    {d.spots.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-6">
                        {d.spots.map((s, i) => (
                          <span key={i} className="text-xs font-medium px-3 py-1.5 rounded-full"
                            style={{ background: "#e9dfc8", color: "#5a634f" }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 pt-5"
                      style={{ borderTop: "1px solid #e7ddc6" }}>
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-bold mb-2" style={{ color: RED }}>
                          <UtensilsCrossed className="w-4 h-4" /> 餐食
                        </div>
                        <div className="space-y-1 text-sm" style={{ color: "#5c5a4c" }}>
                          <div>早餐：{d.meals.breakfast}</div>
                          <div>午餐：{d.meals.lunch}</div>
                          <div>晚餐：{d.meals.dinner}</div>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-bold mb-2" style={{ color: RED }}>
                          <BedDouble className="w-4 h-4" /> 住宿
                        </div>
                        <div className="text-sm" style={{ color: "#5c5a4c" }}>{d.hotel || "—"}</div>
                      </div>
                    </div>
                  </Reveal>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 景點美照 ── */}
      {gallery.length > 0 && (
        <section id="gallery" className="scroll-mt-32 py-14 md:py-24" style={{ background: "#efe8d6" }}>
          <div className="max-w-6xl mx-auto px-5 md:px-8">
            <SectionHead kicker="Scenic Gallery" title="景點美照"
              desc="把旅途中最動人的風景先放進行前想像——每個景點精選三張照片，讓期待先出發。" />

            <div className="grid md:grid-cols-2 gap-x-8 gap-y-12 md:gap-y-16">
              {gallery.map((g, gi) => (
                <Reveal key={gi} delay={(gi % 2) * 120}>
                  <PhotoCollage images={g.images} onView={setLightbox} hClass="h-[300px] md:h-[360px]" />
                  <div className="mt-4 px-1">
                    <h3 className="serif-tc font-black text-xl md:text-2xl">{g.name}</h3>
                    {g.subtitle && (
                      <p className="text-sm mt-1" style={{ color: "#8a8268" }}>{g.subtitle}</p>
                    )}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 費用說明 ── */}
      <section id="price" className="scroll-mt-32 max-w-6xl mx-auto px-5 md:px-8 py-14 md:py-20">
        <SectionHead kicker="Pricing" title="費用說明" />
        <div className="grid md:grid-cols-2 gap-5">
          <Reveal>
            <div className="rounded-3xl p-7 md:p-8 shadow-sm h-full" style={{ background: CARD, border: "1px solid #ece3cd" }}>
              <h3 className="font-bold mb-3" style={{ color: RED }}>團費價格</h3>
              <PriceRows tour={tour} />
            </div>
          </Reveal>
          <div className="space-y-5">
            {c.includes.length > 0 && (
              <Reveal delay={100}>
                <div className="rounded-3xl p-7 shadow-sm" style={{ background: CARD, border: "1px solid #ece3cd" }}>
                  <h3 className="flex items-center gap-2 font-bold mb-4" style={{ color: "#2e7d4f" }}>
                    <CircleCheck className="w-4.5 h-4.5" /> 費用包含
                  </h3>
                  <ul className="space-y-2 text-sm" style={{ color: "#5c5a4c" }}>
                    {c.includes.map((x, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <span className="shrink-0 mt-0.5" style={{ color: "#2e7d4f" }}>✓</span>{x}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            )}
            {c.excludes.length > 0 && (
              <Reveal delay={200}>
                <div className="rounded-3xl p-7 shadow-sm" style={{ background: CARD, border: "1px solid #ece3cd" }}>
                  <h3 className="flex items-center gap-2 font-bold mb-4" style={{ color: RED }}>
                    <CircleX className="w-4.5 h-4.5" /> 費用不含
                  </h3>
                  <ul className="space-y-2 text-sm" style={{ color: "#5c5a4c" }}>
                    {c.excludes.map((x, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <span className="shrink-0 mt-0.5" style={{ color: RED }}>✕</span>{x}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            )}
          </div>
        </div>
      </section>

      {/* ── 旅遊須知 ── */}
      {c.notes.length > 0 && (
        <section id="notes" className="scroll-mt-32 max-w-6xl mx-auto px-5 md:px-8 pb-14 md:pb-20">
          <SectionHead kicker="Notice" title="旅遊須知" />
          <Reveal>
            <div className="rounded-3xl p-7 md:p-8 shadow-sm" style={{ background: CARD, border: "1px solid #ece3cd" }}>
              <ul className="grid md:grid-cols-2 gap-x-10 gap-y-3.5 text-sm" style={{ color: "#5c5a4c" }}>
                {c.notes.map((x, i) => (
                  <li key={i} className="flex gap-2.5 items-start">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: RED }} />{x}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </section>
      )}

      {/* ── CTA ── */}
      <section className="py-16 md:py-24 text-white text-center px-5" style={{ background: INK }}>
        <Reveal>
          <div className="text-[11px] tracking-[0.3em] uppercase mb-4 opacity-60">Join the Journey</div>
          <h2 className="serif-tc text-3xl md:text-5xl font-black mb-4 leading-snug">
            和我們一起出發
          </h2>
          <p className="opacity-70 mb-2 text-sm md:text-base">
            {fmtFull(tour.start_date)} 出發 ・ {days} 天 {days - 1} 夜 ・ {tour.pax} 人成行
          </p>
          <div className="serif-tc text-amber-300 text-3xl md:text-4xl font-black mb-8">
            NT${tour.selling_price.toLocaleString()}<span className="text-base font-normal opacity-70 ml-1">/人 起</span>
          </div>
          {canJoin ? (
            <Link href={`/join/${tour.id}`}
              className="inline-flex items-center gap-2 text-white font-bold px-10 py-4 rounded-full text-base transition-opacity hover:opacity-90 shadow-xl"
              style={{ background: RED }}>
              立即報名 <ArrowRight className="w-5 h-5" />
            </Link>
          ) : (
            <div className="inline-block bg-white/10 rounded-full px-8 py-3.5 text-sm opacity-80">
              此行程目前無法報名
            </div>
          )}
          <p className="text-xs opacity-50 mt-5 flex items-center justify-center gap-1.5">
            <PhoneCall className="w-3.5 h-3.5" /> 報名後將有專員與您聯繫確認所有細節
          </p>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 text-center text-sm" style={{ background: "#1c2a23", color: "rgba(255,255,255,.45)" }}>
        <p>© 暖心旅行社 2026 旅遊大聯盟 Travel Alliance. All rights reserved.</p>
      </footer>

      {/* ── 手機底部報名列 ── */}
      {canJoin && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-5 py-3 backdrop-blur-md border-t"
          style={{ background: "rgba(253,250,242,.95)", borderColor: "#e7ddc6" }}>
          <div>
            <div className="text-[10px]" style={{ color: "#8a8268" }}>成人費用 / 人</div>
            <div className="serif-tc font-black text-xl" style={{ color: RED }}>
              NT${tour.selling_price.toLocaleString()}
            </div>
          </div>
          <Link href={`/join/${tour.id}`}
            className="text-white font-bold px-8 py-3 rounded-full text-sm"
            style={{ background: RED }}>
            立即報名
          </Link>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain" />
          <button onClick={() => setLightbox(null)} aria-label="關閉"
            className="absolute top-5 right-5 p-2.5 bg-white/15 hover:bg-white/30 text-white rounded-full backdrop-blur-sm transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
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
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="font-bold text-slate-800 text-lg mb-4">費用說明</h2>
            <PriceRows tour={tour} />
          </div>
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
        <p>© 暖心旅行社 2026 旅遊大聯盟 Travel Alliance. All rights reserved.</p>
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
