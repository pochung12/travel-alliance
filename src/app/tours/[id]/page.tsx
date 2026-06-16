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
  supabase, Tour, TourPage, TourPageContent, TourPagePoster, TOUR_PAGE_CATEGORIES, isChinaTour, isTierPublic,
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

// ── 團費標示（現金價 / 刷卡價）─────────────────────────────────────────────────
function PriceTypeBadge({ tour, className = "" }: { tour: Tour; className?: string }) {
  const t = tour.price_type;
  if (t !== "cash" && t !== "card") return null;
  const isCash = t === "cash";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
      isCash ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
    } ${className}`}>
      {isCash ? "💵 現金價" : "💳 刷卡價"}
    </span>
  );
}

// ── 刷卡價（以團費為現金價，加成計算）─────────────────────────────────────────
function cardPriceOf(tour: Tour) {
  const cash = tour.selling_price || 0;
  const amt  = tour.card_surcharge_amount || 0;
  const pct  = tour.card_surcharge_percent || 0;
  const fee  = amt > 0 ? amt : (pct > 0 ? Math.round(cash * pct / 100) : 0);
  const pctShow = amt > 0 ? Math.round((fee / Math.max(cash, 1)) * 1000) / 10 : pct;
  return { has: fee > 0 && cash > 0, cash, card: cash + fee, fee, pct: pctShow };
}

function CardPriceNote({ tour, className = "" }: { tour: Tour; className?: string }) {
  const cp = cardPriceOf(tour);
  if (!cp.has) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full ${className}`}>
      💳 刷卡價 NT${cp.card.toLocaleString()}（+{cp.pct}%）
    </span>
  );
}

// ── 折扣資訊（原價劃線 / 現價 / 省多少）─────────────────────────────────────────
function discountOf(tour: Tour) {
  const orig = tour.original_price ?? 0;
  const now  = tour.selling_price ?? 0;
  const has  = orig > now && now > 0;
  return { has, orig, now, save: has ? orig - now : 0 };
}

// ── Booking sidebar（Basic 版用；價格/日期來自 tours，與後台綁定）──────────────
function BookingSidebar({ tour, days }: { tour: Tour; days: number }) {
  const canJoin = tour.status === "confirmed" || tour.status === "ongoing";
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm sticky top-24">
      <div className="text-center mb-5">
        {(() => {
          const d = discountOf(tour);
          return (
            <>
              {d.has && (
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-base text-slate-400 line-through">NT${d.orig.toLocaleString()}</span>
                  <span className="text-[11px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">省 NT${d.save.toLocaleString()}</span>
                </div>
              )}
              <div className="text-4xl font-bold text-cyan-600">
                NT${tour.selling_price.toLocaleString()}
              </div>
              <div className="text-sm text-slate-400 mt-1 flex items-center justify-center gap-1.5 flex-wrap">
                成人費用 / 人{d.has && <span className="text-red-500 font-medium">・限時優惠</span>}
                <PriceTypeBadge tour={tour} />
              </div>
              <div className="mt-1.5 flex justify-center"><CardPriceNote tour={tour} /></div>
            </>
          );
        })()}
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
  const d = discountOf(tour);
  const prices = [
    { label: "成人", price: tour.selling_price, pax: tour.pax_adult, original: d.has ? d.orig : 0 },
    { label: "只參團（不含機票）", price: tour.price_tour_only || 0, pax: tour.pax_tour_only, original: 0 },
    { label: "兒童", price: tour.price_child || 0, pax: tour.pax_child, original: 0 },
    { label: "嬰兒", price: tour.price_infant || 0, pax: tour.pax_infant, original: 0 },
    ...(tour.custom_price_tiers || []).filter(isTierPublic).map((ct) => ({ label: ct.label, price: ct.price, pax: ct.pax, original: 0 })),
  ].filter((p) => p.price > 0);

  return (
    <div className="divide-y divide-[#ece4d0]">
      {prices.map((p) => (
        <div key={p.label} className="flex justify-between items-center py-3.5">
          <span className="text-sm font-medium">
            {p.label}
            {p.original > 0 && <span className="ml-2 text-[11px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">限時優惠</span>}
          </span>
          <span className="flex items-baseline gap-2">
            {p.original > 0 && <span className="text-sm text-slate-400 line-through">NT${p.original.toLocaleString()}</span>}
            <span className="font-bold text-lg">NT${p.price.toLocaleString()}</span>
          </span>
        </div>
      ))}
      {(() => {
        const cp = cardPriceOf(tour);
        if (!cp.has) return null;
        return (
          <div className="flex justify-between items-center py-3.5 gap-3 flex-wrap">
            <span className="text-sm font-medium flex items-center gap-2 flex-wrap">
              成人刷卡價
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-sky-100 text-sky-700">
                現金價 +{cp.pct}% 手續費
              </span>
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-xs text-slate-400">現金 NT${cp.cash.toLocaleString()}</span>
              <span className="font-bold text-lg text-sky-700">NT${cp.card.toLocaleString()}</span>
            </span>
          </div>
        );
      })()}
      {tour.deposit_per_person && tour.deposit_per_person > 0 ? (
        <div className="flex justify-between items-center py-3.5">
          <span className="text-sm font-medium">訂金（每人）</span>
          <span className="font-bold text-[#b04a3a]">NT${tour.deposit_per_person.toLocaleString()}</span>
        </div>
      ) : null}
      {(tour.tip_per_day ?? 0) > 0 ? (
        <div className="flex justify-between items-center py-3.5 gap-3 flex-wrap">
          <span className="text-sm font-medium flex items-center gap-2 flex-wrap">
            司機/導遊/領隊小費
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
              tour.tip_included
                ? "bg-emerald-100 text-emerald-700"
                : "bg-orange-100 text-orange-600"
            }`}>
              {tour.tip_included ? "已含於團費" : "未含・另行支付"}
            </span>
          </span>
          <span className="font-bold">
            NT${(tour.tip_per_day ?? 0).toLocaleString()}
            <span className="text-xs font-normal" style={{ color: "#8a8268" }}>/天</span>
          </span>
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
  if (d.images && d.images.length > 0) {
    const filtered = d.images.filter(Boolean);
    if (filtered.length > 0) return filtered;
  }
  return d.image ? [d.image] : [];
}

// ── 三圖拼貼 ──────────────────────────────────────────────────────────────────
function PhotoCollage({
  images: rawImages, caption, onView, hClass = "h-[340px] md:h-[480px]",
}: { images: string[]; caption?: string; onView: (url: string) => void; hClass?: string }) {
  const images = (rawImages || []).filter(Boolean);
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
function ChinaBadge({ large = false }: { large?: boolean }) {
  return (
    <span className={`inline-flex items-center bg-rose-600 text-white font-semibold rounded-full shadow-sm ${
      large ? "text-xs px-3 py-1" : "text-[11px] px-2.5 py-0.5"
    }`}>
      交流考察團
    </span>
  );
}

function HeroCarousel({
  posters, tour, days, subtitle, isChina,
}: { posters: TourPagePoster[]; tour: Tour; days: number; subtitle: string; isChina?: boolean }) {
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
                {isChina && <ChinaBadge large />}
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

// ── 閱讀進度條 ────────────────────────────────────────────────────────────────
function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        setP(max > 0 ? (h.scrollTop / max) * 100 : 0);
      });
    };
    window.addEventListener("scroll", on, { passive: true });
    on();
    return () => { window.removeEventListener("scroll", on); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-[3px] pointer-events-none" style={{ background: "rgba(0,0,0,.06)" }}>
      <div className="h-full" style={{ width: `${p}%`, background: `linear-gradient(90deg, ${RED}, #d98a3d)`, transition: "width .12s linear" }} />
    </div>
  );
}

// ── 行程特色：整頁大圖 + 視差 ──────────────────────────────────────────────────
function HighlightBand({
  h, idx, flip, onView,
}: {
  h: { icon: string; title: string; desc: string; image?: string };
  idx: number; flip: boolean; onView: (u: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [vis, setVis] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVis(true); },
      { threshold: 0.2 }
    );
    io.observe(el);
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const e2 = ref.current, im = imgRef.current;
        if (!e2 || !im) return;
        const r = e2.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        if (r.bottom < -240 || r.top > vh + 240) return;
        const prog = (r.top + r.height / 2 - vh / 2) / vh; // 約 -1 .. 0 .. 1
        im.style.transform = `translate3d(0, ${(-prog * 7).toFixed(2)}%, 0) scale(1.2)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const num = String(idx + 1).padStart(2, "0");
  const grad = CARD_GRADIENTS[idx % CARD_GRADIENTS.length];
  const ease = "cubic-bezier(.2,.65,.3,1)";

  return (
    <div ref={ref} className="relative w-full h-[88vh] min-h-[540px] overflow-hidden">
      {h.image ? (
        <img ref={imgRef} src={h.image} alt={h.title} loading="lazy"
          onClick={() => onView(h.image!)}
          className="absolute inset-0 w-full h-full object-cover cursor-zoom-in will-change-transform"
          style={{ transform: "scale(1.2)" }} />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${grad}`} />
      )}
      {/* 方向性遮罩 */}
      <div className="absolute inset-0" style={{
        background: flip
          ? "linear-gradient(to left, rgba(15,20,16,.78) 0%, rgba(15,20,16,.30) 48%, rgba(15,20,16,.02) 78%)"
          : "linear-gradient(to right, rgba(15,20,16,.78) 0%, rgba(15,20,16,.30) 48%, rgba(15,20,16,.02) 78%)",
      }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(15,20,16,.6), transparent 42%)" }} />

      <div className="absolute inset-0 flex items-end md:items-center">
        <div className="max-w-6xl mx-auto w-full px-6 md:px-10 pb-14 md:pb-0">
          <div className={`max-w-xl ${flip ? "md:ml-auto md:text-right" : ""}`}>
            <div className={`flex items-center gap-4 mb-4 ${flip ? "md:justify-end" : ""}`}
              style={{ opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(28px)", transition: `opacity .9s ${ease}, transform .9s ${ease}` }}>
              <span className="serif-tc text-amber-300 text-5xl md:text-8xl font-black leading-none drop-shadow-lg">{num}</span>
              <span className="text-3xl md:text-5xl">{h.icon}</span>
            </div>
            <h3 className="serif-tc text-white text-3xl md:text-6xl font-black leading-[1.12] mb-4 md:mb-6 drop-shadow-2xl"
              style={{ opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(36px)", transition: `opacity 1s ${ease} .1s, transform 1s ${ease} .1s` }}>
              {h.title}
            </h3>
            <p className="text-white/85 text-sm md:text-lg leading-relaxed drop-shadow max-w-lg md:inline-block"
              style={{ opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(36px)", transition: `opacity 1s ${ease} .2s, transform 1s ${ease} .2s` }}>
              {h.desc}
            </p>
          </div>
        </div>
      </div>

      <div className={`absolute bottom-5 ${flip ? "left-6 md:left-10" : "right-6 md:right-10"} text-white/45 text-[11px] tracking-[0.3em] uppercase select-none hidden md:block`}>
        Highlight {num}
      </div>
    </div>
  );
}

// 偵測小費／服務費相關的文字行（領隊/司機/導遊小費或服務費）
function isTipLine(text: string): boolean {
  const t = text || "";
  if (t.includes("小費")) return true;
  if (t.includes("服務費") && (t.includes("領隊") || t.includes("司機") || t.includes("導遊"))) return true;
  return false;
}

function RichTourPage({ tour, page, days }: { tour: Tour; page: TourPage; days: number }) {
  const c = page.content as TourPageContent;
  const cat = TOUR_PAGE_CATEGORIES.find(x => x.key === page.category);
  const canJoin = tour.status === "confirmed" || tour.status === "ongoing";
  const isChina = isChinaTour(`${tour.name} ${tour.destination}`, page.category);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // 已設定結構化小費欄位時，小費資訊一律以該欄位（團費價格區）為準，
  // 過濾掉 AI 生成內容裡的小費／服務費行，避免「已含於團費」卻又列在費用不含的矛盾
  const disc = discountOf(tour);
  const hasTipField = (tour.tip_per_day ?? 0) > 0;
  const includes = hasTipField ? c.includes.filter(x => !isTipLine(x)) : c.includes;
  const excludes = hasTipField ? c.excludes.filter(x => !isTipLine(x)) : c.excludes;
  const notes    = hasTipField ? c.notes.filter(x => !isTipLine(x))    : c.notes;

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
    ...(notes.length > 0 ? [{ id: "notes", label: "旅遊須知" }] : []),
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
        html { scroll-behavior: smooth; }
        @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } .kb-zoom { animation: none; } }
      `}</style>

      <ScrollProgress />
      <PublicNavbar />

      {/* ── Hero ── */}
      <HeroCarousel posters={page.hero_posters} tour={tour} days={days} subtitle={c.subtitle} isChina={isChina} />

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
            <span className="serif-tc font-bold text-lg flex items-baseline gap-1.5" style={{ color: RED }}>
              {disc.has && <span className="text-sm font-normal line-through" style={{ color: "#b3ac98" }}>NT${disc.orig.toLocaleString()}</span>}
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
              {isChina && <ChinaBadge />}
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
                  <div className="text-[11px] opacity-55 mb-0.5 flex items-center gap-1.5 flex-wrap">
                    成人費用
                    {tour.price_type === "cash" && <span className="text-[10px] font-bold text-emerald-900 bg-emerald-300 px-1.5 py-0.5 rounded-full">現金價</span>}
                    {tour.price_type === "card" && <span className="text-[10px] font-bold text-sky-900 bg-sky-300 px-1.5 py-0.5 rounded-full">刷卡價</span>}
                    {disc.has && <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">限時優惠</span>}
                  </div>
                  {disc.has && <div className="text-sm opacity-60 line-through -mb-0.5">NT${disc.orig.toLocaleString()}</div>}
                  <div className="serif-tc text-3xl font-black text-amber-300">
                    NT${tour.selling_price.toLocaleString()}
                  </div>
                  {(() => {
                    const cp = cardPriceOf(tour);
                    if (!cp.has) return null;
                    return <div className="text-[11px] text-white/65 mt-1">刷卡價 NT${cp.card.toLocaleString()}（+{cp.pct}%）</div>;
                  })()}
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

      {/* ── 行程特色：整頁大圖視差 ── */}
      {c.highlights.length > 0 && (
        <section id="highlights" className="scroll-mt-32 pt-12 md:pt-20">
          <div className="max-w-6xl mx-auto px-5 md:px-8">
            <SectionHead kicker="Highlights" title="行程特色"
              desc="一頁一風景——把這趟旅程最值得期待的畫面，放到最大。" />
          </div>
          <div>
            {c.highlights.map((h, i) => (
              <HighlightBand key={i} h={h} idx={i} flip={i % 2 === 1} onView={setLightbox} />
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 pt-5"
                      style={{ borderTop: "1px solid #e7ddc6" }}>
                      {/* 餐食（含照片）*/}
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-bold mb-2.5" style={{ color: RED }}>
                          <UtensilsCrossed className="w-4 h-4" /> 餐食
                        </div>
                        {(() => {
                          const mealRows = [
                            { label: "早餐", name: d.meals.breakfast, img: d.meal_images?.breakfast },
                            { label: "午餐", name: d.meals.lunch,     img: d.meal_images?.lunch },
                            { label: "晚餐", name: d.meals.dinner,    img: d.meal_images?.dinner },
                          ];
                          const withImg = mealRows.filter(m => m.img);
                          return (
                            <>
                              {withImg.length > 0 && (
                                <div className={`grid gap-1.5 mb-2.5 ${withImg.length === 1 ? "grid-cols-1" : withImg.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                                  {withImg.map((m, i) => (
                                    <div key={i}
                                      className="relative rounded-xl overflow-hidden cursor-zoom-in group/meal"
                                      style={{ height: withImg.length === 1 ? "7.5rem" : "5.5rem" }}
                                      onClick={() => setLightbox(m.img!)}>
                                      <img src={m.img} alt={m.name} loading="lazy"
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover/meal:scale-110" />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                                      <span className="absolute bottom-1.5 left-2 text-[10px] font-semibold text-white drop-shadow">
                                        {m.label}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="space-y-1 text-sm" style={{ color: "#5c5a4c" }}>
                                {mealRows.map((m, i) => (
                                  <div key={i}>{m.label}：{m.name}</div>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      {/* 住宿（含照片）*/}
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-bold mb-2.5" style={{ color: RED }}>
                          <BedDouble className="w-4 h-4" /> 住宿
                        </div>
                        {d.hotel_image && (
                          <div className="relative rounded-xl overflow-hidden cursor-zoom-in group/hotel mb-2.5 h-[7.5rem]"
                            onClick={() => setLightbox(d.hotel_image!)}>
                            <img src={d.hotel_image} alt={d.hotel} loading="lazy"
                              className="w-full h-full object-cover transition-transform duration-500 group-hover/hotel:scale-110" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                            <span className="absolute bottom-1.5 left-2 text-[10px] font-semibold text-white drop-shadow line-clamp-1">
                              {d.hotel}
                            </span>
                          </div>
                        )}
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
              <h3 className="font-bold mb-3 flex items-center gap-2 flex-wrap" style={{ color: RED }}>
                團費價格 <PriceTypeBadge tour={tour} />
              </h3>
              <PriceRows tour={tour} />
            </div>
          </Reveal>
          <div className="space-y-5">
            {includes.length > 0 && (
              <Reveal delay={100}>
                <div className="rounded-3xl p-7 shadow-sm" style={{ background: CARD, border: "1px solid #ece3cd" }}>
                  <h3 className="flex items-center gap-2 font-bold mb-4" style={{ color: "#2e7d4f" }}>
                    <CircleCheck className="w-4.5 h-4.5" /> 費用包含
                  </h3>
                  <ul className="space-y-2 text-sm" style={{ color: "#5c5a4c" }}>
                    {includes.map((x, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <span className="shrink-0 mt-0.5" style={{ color: "#2e7d4f" }}>✓</span>{x}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            )}
            {excludes.length > 0 && (
              <Reveal delay={200}>
                <div className="rounded-3xl p-7 shadow-sm" style={{ background: CARD, border: "1px solid #ece3cd" }}>
                  <h3 className="flex items-center gap-2 font-bold mb-4" style={{ color: RED }}>
                    <CircleX className="w-4.5 h-4.5" /> 費用不含
                  </h3>
                  <ul className="space-y-2 text-sm" style={{ color: "#5c5a4c" }}>
                    {excludes.map((x, i) => (
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
      {notes.length > 0 && (
        <section id="notes" className="scroll-mt-32 max-w-6xl mx-auto px-5 md:px-8 pb-14 md:pb-20">
          <SectionHead kicker="Notice" title="旅遊須知" />
          <Reveal>
            <div className="rounded-3xl p-7 md:p-8 shadow-sm" style={{ background: CARD, border: "1px solid #ece3cd" }}>
              <ul className="grid md:grid-cols-2 gap-x-10 gap-y-3.5 text-sm" style={{ color: "#5c5a4c" }}>
                {notes.map((x, i) => (
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
          <div className="serif-tc text-amber-300 text-3xl md:text-4xl font-black mb-8 flex items-center justify-center gap-3">
            {disc.has && <span className="text-xl md:text-2xl font-normal opacity-50 line-through">NT${disc.orig.toLocaleString()}</span>}
            <span>NT${tour.selling_price.toLocaleString()}<span className="text-base font-normal opacity-70 ml-1">/人 起</span></span>
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
            <div className="text-[10px] flex items-center gap-1" style={{ color: "#8a8268" }}>
              成人費用 / 人
              {disc.has && <span className="line-through">NT${disc.orig.toLocaleString()}</span>}
            </div>
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
          <div className="flex items-center gap-2 text-white/70 text-sm mb-3 flex-wrap">
            <MapPin className="w-4 h-4" /> {tour.destination}
            {isChinaTour(`${tour.name} ${tour.destination}`) && <ChinaBadge />}
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
        .select("*")
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
