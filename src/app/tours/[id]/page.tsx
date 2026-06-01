"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  MapPin, Calendar, Clock, Users, ArrowLeft, PhoneCall,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { supabase, Tour } from "@/lib/supabase";
import PublicNavbar from "@/components/PublicNavbar";
import { CARD_GRADIENTS, getDays } from "@/components/TourCard";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtFull(d: string) {
  return new Date(d).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
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

// ── Loading / Not found ───────────────────────────────────────────────────────
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

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TourDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tour, setTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("tours")
      .select(
        "id,name,destination,start_date,end_date,pax,pax_adult,pax_child,pax_infant,pax_tour_only,selling_price,price_tour_only,price_child,price_infant,status,notes,deposit_per_person,custom_price_tiers"
      )
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setTour(data as Tour | null);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <LoadingScreen />;
  if (!tour) return <NotFoundScreen />;

  const grad = CARD_GRADIENTS[
    (tour.name.charCodeAt(0) + tour.destination.charCodeAt(0)) % CARD_GRADIENTS.length
  ];
  const days = getDays(tour.start_date, tour.end_date);
  const canJoin = tour.status === "confirmed" || tour.status === "ongoing";

  const prices = [
    { label: "成人", price: tour.selling_price, pax: tour.pax_adult },
    { label: "只參團（不含機票）", price: tour.price_tour_only || 0, pax: tour.pax_tour_only },
    { label: "兒童", price: tour.price_child || 0, pax: tour.pax_child },
    { label: "嬰兒", price: tour.price_infant || 0, pax: tour.pax_infant },
    ...(tour.custom_price_tiers || []).map((ct) => ({
      label: ct.label,
      price: ct.price,
      pax: ct.pax,
    })),
  ].filter((p) => p.price > 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <PublicNavbar />

      {/* ── Hero banner ────────────────────────────────────────────────────── */}
      <div className={`bg-gradient-to-br ${grad} text-white`}>
        <div className="max-w-5xl mx-auto px-4 pt-8 pb-12">
          <Link
            href="/tours"
            className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回行程列表
          </Link>

          <div className="flex items-center gap-2 text-white/70 text-sm mb-3">
            <MapPin className="w-4 h-4" />
            {tour.destination}
          </div>

          <h1 className="text-3xl md:text-4xl font-bold mb-4 leading-snug">
            {tour.name}
          </h1>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/85 mb-4">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {fmtFull(tour.start_date)}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {fmtFull(tour.end_date)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {days} 天 {days - 1} 夜
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              共 {tour.pax} 人出發
            </span>
          </div>

          <StatusBadge status={tour.status} />
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-8 grid md:grid-cols-3 gap-6">

        {/* Left: description + price table */}
        <div className="md:col-span-2 space-y-5">
          {tour.notes && (
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <h2 className="font-bold text-slate-800 text-lg mb-4">行程介紹</h2>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {tour.notes}
              </p>
            </div>
          )}

          {/* Price table */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="font-bold text-slate-800 text-lg mb-4">費用說明</h2>
            <div className="divide-y divide-slate-50">
              {prices.map((p) => (
                <div key={p.label} className="flex justify-between items-center py-3">
                  <div>
                    <span className="text-sm text-slate-700 font-medium">{p.label}</span>
                    {(p.pax ?? 0) > 0 && (
                      <span className="ml-2 text-xs text-slate-400">{p.pax} 人</span>
                    )}
                  </div>
                  <span className="font-semibold text-slate-800">
                    NT${p.price.toLocaleString()}
                  </span>
                </div>
              ))}
              {tour.deposit_per_person && tour.deposit_per_person > 0 && (
                <div className="flex justify-between items-center py-3">
                  <span className="text-sm text-slate-700 font-medium">訂金（每人）</span>
                  <span className="font-semibold text-orange-600">
                    NT${tour.deposit_per_person.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Itinerary prompt */}
          <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-5 flex items-start gap-3">
            <PhoneCall className="w-5 h-5 text-cyan-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-cyan-800 mb-1">需要了解更多行程細節？</p>
              <p className="text-cyan-700 leading-relaxed">
                報名後我們的專員會主動聯繫您，提供完整行程說明及注意事項。
              </p>
            </div>
          </div>
        </div>

        {/* Right: booking card */}
        <div>
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm sticky top-24">
            <div className="text-center mb-5">
              <div className="text-4xl font-bold text-cyan-600">
                NT${tour.selling_price.toLocaleString()}
              </div>
              <div className="text-sm text-slate-400 mt-1">成人費用 / 人</div>
            </div>

            {/* Quick stats */}
            <div className="space-y-2.5 text-sm mb-5 pb-5 border-b border-slate-100">
              {[
                { label: "目的地", value: tour.destination },
                {
                  label: "出發日期",
                  value: new Date(tour.start_date).toLocaleDateString("zh-TW"),
                },
                {
                  label: "回程日期",
                  value: new Date(tour.end_date).toLocaleDateString("zh-TW"),
                },
                { label: "行程天數", value: `${days} 天 ${days - 1} 夜` },
                { label: "出團人數", value: `${tour.pax} 人` },
              ].map((r) => (
                <div key={r.label} className="flex justify-between items-start">
                  <span className="text-slate-500">{r.label}</span>
                  <span className="font-medium text-slate-700 text-right max-w-[60%]">
                    {r.value}
                  </span>
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
                <p className="text-xs text-slate-400 text-center mt-3">
                  報名後將有專員與您聯繫確認
                </p>
              </>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-center text-sm text-slate-500">
                此行程目前無法報名
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-8 text-center text-sm mt-4">
        <p>© 2025 旅遊大聯盟 Travel Alliance. All rights reserved.</p>
      </footer>
    </div>
  );
}
