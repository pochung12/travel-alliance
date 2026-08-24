"use client";
import { useEffect, useState } from "react";
import { supabase, TourFlight, TourPageFlightInfo } from "@/lib/supabase";
import { computeFlightCards } from "@/lib/flightGroups";
import { airportInfo, terminalLabel, knownTerminal, resolveAirportCode } from "@/lib/airports";
import { Plane, PlaneTakeoff, PlaneLanding } from "lucide-react";

const RED = "#a8453a";

function toTime(d?: string | null) { const t = d ? new Date(d).getTime() : NaN; return isNaN(t) ? NaN : t; }
function md(d?: string | null) {
  const t = toTime(d);
  if (isNaN(t)) return d || "";
  const dt = new Date(t);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}
function wd(d?: string | null) {
  const t = toTime(d);
  return isNaN(t) ? "" : new Date(t).toLocaleDateString("zh-TW", { weekday: "short" });
}
function overnight(dep?: string, arr?: string) {
  if (!dep || !arr) return false;
  const [dh, dm] = dep.split(":").map(Number), [ah, am] = arr.split(":").map(Number);
  if ([dh, dm, ah, am].some(isNaN)) return false;
  return ah * 60 + am < dh * 60 + dm;
}
function legOf(f: TourFlight, start?: string, end?: string): "out" | "back" {
  const ft = toTime(f.flight_date), st = toTime(start), et = toTime(end);
  if (isNaN(ft) || isNaN(st) || isNaN(et)) return "out";
  return Math.abs(ft - st) <= Math.abs(ft - et) ? "out" : "back";
}
const sortLegs = (a: TourFlight, b: TourFlight) =>
  (a.flight_date || "").localeCompare(b.flight_date || "") ||
  (a.departure_time || "").localeCompare(b.departure_time || "");

/** 一個機場端點：城市 代碼 航廈 */
function port(code?: string | null, term?: string | null, flightNo?: string | null, other?: string | null) {
  const info = airportInfo(code);
  const t = terminalLabel((term || "").trim() || knownTerminal(code, flightNo, other));
  const iata = resolveAirportCode(code) || (code || "").toUpperCase();
  return { city: info?.city || iata || "—", iata, term: t };
}

function Leg({ f, start, end }: { f: TourFlight; start?: string; end?: string }) {
  const back = legOf(f, start, end) === "back";
  const dep = port(f.departure_airport, f.departure_terminal, f.flight_number, f.arrival_airport);
  const arr = port(f.arrival_airport, f.arrival_terminal, f.flight_number, f.departure_airport);
  return (
    <div className="py-3 flex items-start gap-3">
      <div className="shrink-0 w-14 text-center">
        <div className="serif-tc font-black text-xl leading-none" style={{ color: RED }}>{md(f.flight_date)}</div>
        <div className="text-[10px] mt-0.5" style={{ color: "#a89e86" }}>{wd(f.flight_date)}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {back
            ? <PlaneLanding className="w-3.5 h-3.5" style={{ color: "#c07a2e" }} />
            : <PlaneTakeoff className="w-3.5 h-3.5" style={{ color: RED }} />}
          <span className="font-bold text-[15px]">{f.flight_number || "—"}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
            style={back ? { background: "#f6e7d4", color: "#a2661f" } : { background: "#f0e2dc", color: RED }}>
            {back ? "回程" : "去程"}
          </span>
        </div>
        <div className="text-xs mt-1.5 leading-relaxed" style={{ color: "#6b6248" }}>
          <span className="font-semibold">{dep.city}</span>
          <span className="font-mono ml-1" style={{ color: "#a89e86" }}>{dep.iata}</span>
          {dep.term && <span className="ml-1" style={{ color: "#c07a2e" }}>{dep.term}</span>}
          <span className="mx-1.5" style={{ color: "#c9c0a8" }}>→</span>
          <span className="font-semibold">{arr.city}</span>
          <span className="font-mono ml-1" style={{ color: "#a89e86" }}>{arr.iata}</span>
          {arr.term && <span className="ml-1" style={{ color: "#c07a2e" }}>{arr.term}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-semibold text-sm whitespace-nowrap tabular-nums">
          {f.departure_time || "--:--"}–{f.arrival_time || "--:--"}
        </div>
        {overnight(f.departure_time, f.arrival_time) && (
          <div className="text-[10px] mt-0.5 font-bold" style={{ color: "#6b5bd6" }}>🌙 過夜 +1</div>
        )}
      </div>
    </div>
  );
}

interface Props {
  tourId: string;
  startDate?: string;
  endDate?: string;
  fallback: TourPageFlightInfo[];   // 沒有實際航班資料時，沿用行程頁的參考航班
}

const CARD = "#fdfaf2";

/** 卡片外框（標題＋註記），內容為空時整張卡不顯示 */
function Shell({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-3xl p-7 h-full shadow-sm" style={{ background: CARD, border: "1px solid #ece3cd" }}>
      <h3 className="flex items-center gap-2 font-bold mb-5" style={{ color: RED }}>
        <Plane className="w-4.5 h-4.5" /> {note || "參考航班"}
      </h3>
      {children}
      <p className="text-[11px] mt-4 leading-relaxed" style={{ color: "#a89e86" }}>
        ※ 此航班為參考航班時間，實際航班時間與航班號可能有所變動。
      </p>
    </div>
  );
}

export default function PublicFlightGroups({ tourId, startDate, endDate, fallback }: Props) {
  const [rows, setRows] = useState<TourFlight[] | null>(null);
  useEffect(() => {
    supabase.from("tour_flights").select("*").eq("tour_id", tourId)
      .then(({ data }) => setRows((data || []) as TourFlight[]));
  }, [tourId]);

  // 尚未載入 → 先用參考航班避免閃爍
  const cards = rows && rows.length > 0 ? computeFlightCards(rows) : [];

  if (cards.length === 0) {
    if (fallback.length === 0) return null;
    return (
      <Shell>
      <div className="divide-y" style={{ borderColor: "#ece4d0" }}>
        {fallback.map((f, i) => (
          <div key={i} className="py-3.5 flex items-center gap-4">
            <div className="shrink-0 w-16 text-center">
              <div className="serif-tc font-black text-2xl leading-none" style={{ color: RED }}>{md(f.date)}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[15px]">{f.flight_no}</div>
              <div className="text-xs mt-0.5" style={{ color: "#8a8268" }}>
                {f.from}{f.from_terminal ? ` ${f.from_terminal}` : ""} → {f.to}{f.to_terminal ? ` ${f.to_terminal}` : ""}
              </div>
            </div>
            <div className="font-semibold text-sm whitespace-nowrap shrink-0">{f.depart}–{f.arrive}</div>
          </div>
        ))}
      </div>
      </Shell>
    );
  }

  const multi = cards.length > 1;
  return (
    <Shell note={multi ? `航班資訊（${cards.length} 組）` : "參考航班"}>
    <div className="space-y-4">
      {multi && (
        <p className="text-xs leading-relaxed rounded-xl px-3 py-2"
          style={{ background: "#f3ecda", color: "#6b6248" }}>
          本團共有 <span className="font-bold" style={{ color: RED }}>{cards.length} 組</span>不同航班安排，
          請對照您的電子機票確認所屬組別。
        </p>
      )}
      {cards.map((card, ci) => {
        const legs = card.flights.slice().sort(sortLegs);
        const route = Array.from(new Set(legs.flatMap(f => [
          airportInfo(f.departure_airport)?.city || resolveAirportCode(f.departure_airport),
          airportInfo(f.arrival_airport)?.city || resolveAirportCode(f.arrival_airport),
        ]).filter(Boolean)));
        return (
          <div key={ci} className={multi ? "rounded-2xl p-4" : ""}
            style={multi ? { background: "#f8f3e6", border: "1px solid #ece3cd" } : undefined}>
            {multi && (
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-black px-2.5 py-1 rounded-full"
                  style={{ background: RED, color: "#fff" }}>
                  航班 {String.fromCharCode(65 + ci)}
                </span>
                <span className="text-xs font-semibold" style={{ color: "#6b6248" }}>
                  {route.join(" · ")}
                </span>
                <span className="ml-auto text-[11px]" style={{ color: "#a89e86" }}>
                  {legs.length} 個航段
                </span>
              </div>
            )}
            <div className="divide-y" style={{ borderColor: "#ece4d0" }}>
              {legs.map((f, i) => <Leg key={f.id || i} f={f} start={startDate} end={endDate} />)}
            </div>
          </div>
        );
      })}
    </div>
    </Shell>
  );
}
