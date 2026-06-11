import Link from "next/link";
import { Calendar, Clock, Users, ArrowRight } from "lucide-react";
import type { Tour } from "@/lib/supabase";

export const CARD_GRADIENTS = [
  "from-cyan-500 to-blue-600",
  "from-teal-500 to-emerald-600",
  "from-violet-500 to-purple-600",
  "from-orange-500 to-amber-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-cyan-600",
  "from-sky-500 to-blue-600",
  "from-emerald-500 to-teal-700",
];

export function getDays(start: string, end: string) {
  const d = Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
  );
  return d + 1;
}

export function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("zh-TW", { month: "short", day: "numeric" });
}

export default function TourCard({
  tour, idx, image, categoryLabel,
}: {
  tour: Tour; idx: number; image?: string; categoryLabel?: string;
}) {
  const grad = CARD_GRADIENTS[idx % CARD_GRADIENTS.length];
  const days = getDays(tour.start_date, tour.end_date);

  return (
    <Link
      href={`/tours/${tour.id}`}
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg border border-slate-100 transition-all duration-300 hover:-translate-y-1"
    >
      {/* Header：有海報圖用圖片，否則漸層 */}
      <div className={`h-44 relative flex items-end p-4 overflow-hidden ${image ? "" : `bg-gradient-to-br ${grad}`}`}>
        {image && (
          <img
            src={image}
            alt={tour.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
        <div className={`absolute inset-0 ${image ? "bg-gradient-to-t from-black/70 via-black/20 to-transparent" : "bg-black/10"}`} />
        {categoryLabel && (
          <span className="absolute top-3 left-3 z-10 text-[11px] bg-white/90 backdrop-blur-sm text-slate-700 font-medium px-2 py-0.5 rounded-full">
            {categoryLabel}
          </span>
        )}
        <div className="relative z-10">
          <span className="text-white/75 text-xs font-medium block mb-1">
            📍 {tour.destination}
          </span>
          <h3 className="text-white font-bold text-base leading-snug line-clamp-2">
            {tour.name}
          </h3>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {fmtDate(tour.start_date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {days}天{days - 1}夜
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {tour.pax} 人
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block">成人售價</span>
            <div className="text-lg font-bold text-cyan-600 leading-tight">
              NT${tour.selling_price.toLocaleString()}
              <span className="text-xs font-normal text-slate-400 ml-1">起</span>
            </div>
          </div>
          <span className="flex items-center gap-1 text-xs text-cyan-600 font-medium group-hover:gap-2 transition-all">
            查看詳情
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
