"use client";
import { TourFlight } from "@/lib/supabase";
import { PlaneTakeoff, PlaneLanding, Users, ArrowRight } from "lucide-react";

interface Props {
  flights: TourFlight[];
  startDate?: string;   // 團出發日（用來判斷去程/回程）
  endDate?: string;     // 團回程日
}

function toTime(d?: string | null): number {
  if (!d) return NaN;
  const t = new Date(d).getTime();
  return isNaN(t) ? NaN : t;
}
function fmtMD(d?: string | null): string {
  const t = toTime(d);
  if (isNaN(t)) return d || "";
  const dt = new Date(t);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}
function weekday(d?: string | null): string {
  const t = toTime(d);
  if (isNaN(t)) return "";
  return new Date(t).toLocaleDateString("zh-TW", { weekday: "short" });
}
// 跨夜標記（抵達時間早於出發時間）
function isOvernight(dep?: string, arr?: string): boolean {
  if (!dep || !arr) return false;
  const [dh, dm] = dep.split(":").map(Number);
  const [ah, am] = arr.split(":").map(Number);
  if ([dh, dm, ah, am].some(isNaN)) return false;
  return ah * 60 + am < dh * 60 + dm;
}

// 依「離出發日近 or 離回程日近」判斷去程/回程
function legOf(f: TourFlight, start?: string, end?: string): "out" | "back" {
  const ft = toTime(f.flight_date);
  const st = toTime(start), et = toTime(end);
  if (isNaN(ft) || isNaN(st) || isNaN(et)) return "out";
  return Math.abs(ft - st) <= Math.abs(ft - et) ? "out" : "back";
}

// 單一航段（大字顯示）
function FlightLeg({ f, accent }: { f: TourFlight; accent: string }) {
  const overnight = isOvernight(f.departure_time, f.arrival_time);
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-600/60 px-3.5 py-3 shadow-sm">
      {/* 日期 + 航班號 */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-lg font-black tabular-nums" style={{ color: accent }}>
          {fmtMD(f.flight_date)}
        </span>
        <span className="text-[11px] text-slate-400">{weekday(f.flight_date)}</span>
        {f.flight_number && (
          <span className="text-sm font-bold font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
            {f.flight_number}
          </span>
        )}
      </div>
      {/* 航段：出發 ──✈── 抵達 */}
      <div className="flex items-center gap-2">
        <div className="text-left shrink-0">
          <div className="text-2xl font-black leading-none tabular-nums text-slate-800 dark:text-slate-100">
            {f.departure_time || "--:--"}
          </div>
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-1">
            {f.departure_airport || "—"}
            {f.departure_terminal && <span className="ml-1 text-[10px] font-normal text-slate-400">{f.departure_terminal}</span>}
          </div>
        </div>
        <div className="flex-1 flex items-center gap-1 px-1 min-w-0">
          <span className="h-px flex-1" style={{ background: `${accent}55` }} />
          <PlaneTakeoff className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} />
          <span className="h-px flex-1" style={{ background: `${accent}55` }} />
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-black leading-none tabular-nums text-slate-800 dark:text-slate-100">
            {f.arrival_time || "--:--"}
            {overnight && <sup className="text-[10px] font-bold text-orange-500 ml-0.5">+1</sup>}
          </div>
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-1">
            {f.arrival_airport || "—"}
            {f.arrival_terminal && <span className="ml-1 text-[10px] font-normal text-slate-400">{f.arrival_terminal}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FlightSummary({ flights, startDate, endDate }: Props) {
  if (flights.length === 0) return null;

  // 依旅客分組（未填姓名 → 全團共用）
  const groups = new Map<string, TourFlight[]>();
  flights.forEach(f => {
    const key = (f.passenger_name || "").trim() || "__ALL__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  });

  // 把「行程完全相同」的旅客併成同一張卡（避免每人一張重複卡）
  const sig = (fs: TourFlight[]) => fs
    .slice().sort((a, b) => (a.flight_date || "").localeCompare(b.flight_date || "") || (a.departure_time || "").localeCompare(b.departure_time || ""))
    .map(f => `${f.flight_date}|${f.flight_number}|${f.departure_airport}|${f.departure_time}|${f.arrival_airport}|${f.arrival_time}`).join("//");

  const merged = new Map<string, { names: string[]; flights: TourFlight[] }>();
  groups.forEach((fs, name) => {
    const s = sig(fs);
    if (!merged.has(s)) merged.set(s, { names: [], flights: fs });
    if (name !== "__ALL__") merged.get(s)!.names.push(name);
  });

  const cards = Array.from(merged.values());
  const ACCENT_OUT = "#0284c7";   // 去程：天藍
  const ACCENT_BACK = "#ea580c";  // 回程：橘

  return (
    <div className="bg-gradient-to-br from-sky-50 to-white dark:from-slate-800 dark:to-slate-800 rounded-xl border border-sky-100 dark:border-slate-700 shadow-sm p-4 md:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <PlaneTakeoff className="w-4.5 h-4.5 text-sky-600" />
        <h3 className="font-bold text-slate-800 dark:text-slate-100">航班總覽</h3>
        <span className="text-[11px] text-slate-400">
          {cards.length > 1 ? `${cards.length} 組不同航班` : "全團同一航班"}
        </span>
      </div>

      <div className={cards.length > 1 ? "grid lg:grid-cols-2 gap-4" : ""}>
        {cards.map((card, ci) => {
          const out  = card.flights.filter(f => legOf(f, startDate, endDate) === "out")
            .sort((a, b) => (a.flight_date || "").localeCompare(b.flight_date || "") || (a.departure_time || "").localeCompare(b.departure_time || ""));
          const back = card.flights.filter(f => legOf(f, startDate, endDate) === "back")
            .sort((a, b) => (a.flight_date || "").localeCompare(b.flight_date || "") || (a.departure_time || "").localeCompare(b.departure_time || ""));
          return (
            <div key={ci} className="rounded-xl border border-slate-200/80 dark:border-slate-600/60 bg-white/70 dark:bg-slate-800/60 p-3 space-y-3">
              {/* 適用旅客 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {card.names.length === 0 ? (
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">全團適用</span>
                ) : (
                  <span className="text-xs text-slate-600 dark:text-slate-300" title={card.names.join("、")}>
                    <span className="font-semibold">{card.names.slice(0, 4).join("、")}</span>
                    {card.names.length > 4 && <span className="text-slate-400"> 等 {card.names.length} 人</span>}
                  </span>
                )}
              </div>

              {/* 去程 */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <PlaneTakeoff className="w-4 h-4" style={{ color: ACCENT_OUT }} />
                  <span className="text-sm font-black" style={{ color: ACCENT_OUT }}>去程</span>
                  {out.length > 1 && <span className="text-[10px] text-slate-400">轉機 {out.length} 段</span>}
                </div>
                {out.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-700/40">尚未登錄去程航班</p>
                ) : (
                  <div className="space-y-1.5">
                    {out.map((f, i) => (
                      <div key={f.id || i}>
                        {i > 0 && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 pl-1 py-0.5">
                            <ArrowRight className="w-3 h-3" /> 轉機
                          </div>
                        )}
                        <FlightLeg f={f} accent={ACCENT_OUT} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 回程 */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <PlaneLanding className="w-4 h-4" style={{ color: ACCENT_BACK }} />
                  <span className="text-sm font-black" style={{ color: ACCENT_BACK }}>回程</span>
                  {back.length > 1 && <span className="text-[10px] text-slate-400">轉機 {back.length} 段</span>}
                </div>
                {back.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-700/40">尚未登錄回程航班</p>
                ) : (
                  <div className="space-y-1.5">
                    {back.map((f, i) => (
                      <div key={f.id || i}>
                        {i > 0 && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 pl-1 py-0.5">
                            <ArrowRight className="w-3 h-3" /> 轉機
                          </div>
                        )}
                        <FlightLeg f={f} accent={ACCENT_BACK} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
