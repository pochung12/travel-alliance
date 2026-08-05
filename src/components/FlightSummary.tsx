"use client";
import { useState } from "react";
import { supabase, TourFlight } from "@/lib/supabase";
import { airportInfo, terminalLabel, knownTerminal } from "@/lib/airports";
import { computeFlightCards, assignPassengerToCard } from "@/lib/flightGroups";
import { PlaneTakeoff, PlaneLanding, Users, ArrowRight, Search, Loader2, UserPlus, X, Check } from "lucide-react";

interface Props {
  flights: TourFlight[];
  tourId: string;
  startDate?: string;   // 團出發日（用來判斷去程/回程）
  endDate?: string;     // 團回程日
  onUpdated?: () => void;  // 自動查航廈/指派旅客寫回 DB 後通知父層重載
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

// 機場端點：時間 / 城市+代碼 / 機場全名 / 航廈
function Endpoint({
  time, code, terminal, align, accent, overnight, flightNo, otherCode,
}: {
  time?: string | null; code?: string | null; terminal?: string | null;
  align: "left" | "right"; accent: string; overnight?: boolean;
  flightNo?: string | null; otherCode?: string | null;
}) {
  const info = airportInfo(code);
  // 沒填航廈時，套用機場官網公布的航空公司→航廈對照
  const official = (terminal || "").trim() ? "" : knownTerminal(code, flightNo, otherCode);
  const term = terminalLabel((terminal || "").trim() || official);
  const right = align === "right";
  return (
    <div className={`min-w-0 flex-1 ${right ? "text-right" : "text-left"}`}>
      <div className="text-2xl font-black leading-none tabular-nums text-slate-800 dark:text-slate-100">
        {time || "--:--"}
        {overnight && <sup className="text-[10px] font-bold text-orange-500 ml-0.5">+1</sup>}
      </div>
      {/* 城市 + 機場代碼 */}
      <div className={`flex items-baseline gap-1.5 mt-1.5 flex-wrap ${right ? "justify-end" : ""}`}>
        {info?.city && (
          <span className="text-base font-bold text-slate-800 dark:text-slate-100 leading-tight">
            {info.city}
          </span>
        )}
        <span
          className="text-[11px] font-bold font-mono px-1.5 py-0.5 rounded"
          style={{ color: accent, background: `${accent}18` }}
        >
          {(code || "—").toUpperCase()}
        </span>
      </div>
      {/* 機場全名 */}
      {info?.name && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
          {info.name}
        </div>
      )}
      {/* 航廈 */}
      <div className={`mt-1 flex ${right ? "justify-end" : ""}`}>
        {term ? (
          <span
            className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
            title={official ? "依機場官網航空公司航廈對照推定" : undefined}
          >
            {term}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">航廈待查</span>
        )}
      </div>
    </div>
  );
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
      <div className="flex items-start gap-2">
        <Endpoint
          time={f.departure_time} code={f.departure_airport} terminal={f.departure_terminal}
          align="left" accent={accent}
          flightNo={f.flight_number} otherCode={f.arrival_airport}
        />
        <div className="flex items-center gap-1 px-1 shrink-0 w-12 sm:w-16 pt-2.5">
          <span className="h-px flex-1" style={{ background: `${accent}55` }} />
          <PlaneTakeoff className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} />
          <span className="h-px flex-1" style={{ background: `${accent}55` }} />
        </div>
        <Endpoint
          time={f.arrival_time} code={f.arrival_airport} terminal={f.arrival_terminal}
          align="right" accent={accent} overnight={overnight}
          flightNo={f.flight_number} otherCode={f.departure_airport}
        />
      </div>
    </div>
  );
}

export default function FlightSummary({ flights, tourId, startDate, endDate, onUpdated }: Props) {
  const [looking, setLooking] = useState(false);
  const [lookMsg, setLookMsg] = useState("");
  // 指派旅客到航班組
  const [assignIdx, setAssignIdx] = useState<number | null>(null);
  const [partNames, setPartNames] = useState<string[]>([]);
  const [selNames, setSelNames] = useState<Set<string>>(new Set());
  const [assignSaving, setAssignSaving] = useState(false);

  // 缺航廈的航班
  const missing = flights.filter(f =>
    (f.departure_airport || f.arrival_airport) &&
    (!(f.departure_terminal || "").trim() || !(f.arrival_terminal || "").trim())
  );

  // 有航班資訊的所有航班（重查時的目標）
  const lookupable = flights.filter(f => f.departure_airport || f.arrival_airport);

  const lookupTerminals = async () => {
    if (looking || lookupable.length === 0) return;
    // 已經全部填好 → 視為「重新查詢並覆蓋」，先確認
    const overwrite = missing.length === 0;
    if (overwrite && !window.confirm("航廈都已填好，要重新上網查詢並覆蓋現有資料嗎？")) return;
    const targets = overwrite ? lookupable : missing;

    setLooking(true);
    setLookMsg("上網搜尋中…");
    try {
      const res = await fetch("/api/flight-terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flights: targets.map(f => ({
            id: f.id,
            flight_number: f.flight_number,
            flight_date: f.flight_date,
            departure_airport: f.departure_airport,
            arrival_airport: f.arrival_airport,
          })),
        }),
      });
      const j = await res.json() as {
        results?: Array<{ id: string; departure_terminal: string; arrival_terminal: string }>;
        error?: string;
      };
      if (!res.ok) { setLookMsg(j.error || "查詢失敗"); return; }

      let n = 0, failed = 0, empty = 0;
      for (const r of j.results || []) {
        const f = flights.find(x => x.id === r.id);
        if (!f) { empty++; continue; }
        const patch: Record<string, string> = {};
        const depEmpty = !(f.departure_terminal || "").trim();
        const arrEmpty = !(f.arrival_terminal || "").trim();
        if ((depEmpty || overwrite) && r.departure_terminal && r.departure_terminal !== f.departure_terminal) {
          patch.departure_terminal = r.departure_terminal;
        }
        if ((arrEmpty || overwrite) && r.arrival_terminal && r.arrival_terminal !== f.arrival_terminal) {
          patch.arrival_terminal = r.arrival_terminal;
        }
        if (Object.keys(patch).length === 0) { empty++; continue; }
        const { error } = await supabase.from("tour_flights").update(patch).eq("id", r.id);
        if (error) { failed++; console.error("[terminal] update failed", r.id, error); } else n++;
      }
      setLookMsg(
        n > 0 ? `已更新 ${n} 筆航廈，請對照電子機票核對`
        : failed > 0 ? `寫入失敗 ${failed} 筆（見 Console）`
        : overwrite ? "查詢結果與現有資料相同"
        : `查不到明確航廈資料（${empty} 筆）`
      );
      if (n > 0) onUpdated?.();
    } catch {
      setLookMsg("查詢失敗，請重試");
    } finally {
      setLooking(false);
      setTimeout(() => setLookMsg(""), 6000);
    }
  };

  if (flights.length === 0) return null;

  // 依旅客分組 → 相同行程併卡（與旅客分頁的航班組下拉共用同一套邏輯）
  const cards = computeFlightCards(flights);

  // ── 指派旅客 ──────────────────────────────────────────────
  // 每位旅客目前所屬的組（依 passenger_name 分組的卡片索引；不在任何組 = 預設）
  const groupOf = (name: string): number | null => {
    const i = cards.findIndex(c => c.names.includes(name));
    return i >= 0 ? i : null;
  };

  const openAssign = async (ci: number) => {
    setAssignIdx(ci);
    setSelNames(new Set(
      cards[ci].names.length > 0
        ? cards[ci].names
        : []  // 預設組：初始不勾，勾誰 = 把誰移回預設
    ));
    const { data } = await supabase
      .from("customer_tours")
      .select("customer:customers(name)")
      .eq("tour_id", tourId);
    const names = ((data || []) as unknown as Array<{ customer: { name: string } | null }>)
      .map(r => (r.customer?.name || "").trim()).filter(Boolean);
    setPartNames(Array.from(new Set(names)));
  };

  const saveAssign = async () => {
    if (assignIdx === null || assignSaving) return;
    const card = cards[assignIdx];
    const isDefault = card.names.length === 0;
    const before = new Set(card.names);
    const added = Array.from(selNames).filter(n => !before.has(n));
    const removed = Array.from(before).filter(n => !selNames.has(n));
    if (added.length === 0 && removed.length === 0) { setAssignIdx(null); return; }

    setAssignSaving(true);
    try {
      // 新勾選：複製本組航段給他（預設組 = 只清除個人航班）
      for (const name of added) {
        const err = await assignPassengerToCard(tourId, name, isDefault ? null : card);
        if (err) { alert("指派失敗：" + err); return; }
      }
      // 取消勾選：刪掉個人航班（回到預設航班）
      for (const name of removed) {
        const err = await assignPassengerToCard(tourId, name, null);
        if (err) { alert("指派失敗：" + err); return; }
      }
      setAssignIdx(null);
      onUpdated?.();
    } finally {
      setAssignSaving(false);
    }
  };

  const ACCENT_OUT = "#0284c7";   // 去程：天藍
  const ACCENT_BACK = "#ea580c";  // 回程：橘

  return (
    <div className="bg-gradient-to-br from-sky-50 to-white dark:from-slate-800 dark:to-slate-800 rounded-xl border border-sky-100 dark:border-slate-700 shadow-sm p-4 md:p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <PlaneTakeoff className="w-4.5 h-4.5 text-sky-600" />
        <h3 className="font-bold text-slate-800 dark:text-slate-100">航班總覽</h3>
        <span className="text-[11px] text-slate-400">
          {cards.length > 1 ? `${cards.length} 組不同航班` : "全團同一航班"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {lookMsg && <span className="text-[11px] text-slate-500 dark:text-slate-400">{lookMsg}</span>}
          {lookupable.length > 0 && (
            <button
              onClick={lookupTerminals}
              disabled={looking}
              title={missing.length > 0 ? "上網查詢缺少的航廈" : "重新上網查詢並覆蓋現有航廈"}
              className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-sm transition disabled:opacity-60 text-white ${
                missing.length > 0
                  ? "bg-amber-500 hover:bg-amber-600"
                  : "bg-slate-400 hover:bg-slate-500 dark:bg-slate-600 dark:hover:bg-slate-500"
              }`}
            >
              {looking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              自動查航廈{missing.length > 0 ? `（${missing.length}）` : ""}
            </button>
          )}
        </div>
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
                {cards.length > 1 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                    {card.names.length === 0 ? "預設" : `組 ${ci + 1}`}
                  </span>
                )}
                {card.names.length === 0 ? (
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {cards.length > 1 ? "未指派旅客搭此航班" : "全團適用"}
                  </span>
                ) : (
                  <span className="text-xs text-slate-600 dark:text-slate-300" title={card.names.join("、")}>
                    <span className="font-semibold">{card.names.slice(0, 4).join("、")}</span>
                    {card.names.length > 4 && <span className="text-slate-400"> 等 {card.names.length} 人</span>}
                  </span>
                )}
                {cards.length > 1 && (
                  <button
                    onClick={() => openAssign(ci)}
                    className="ml-auto flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border border-sky-300 dark:border-sky-600 text-sky-600 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition"
                  >
                    <UserPlus className="w-3 h-3" /> 指派旅客
                  </button>
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

      {/* 指派旅客彈窗 */}
      {assignIdx !== null && cards[assignIdx] && (() => {
        const card = cards[assignIdx];
        const isDefault = card.names.length === 0;
        // 名單 = 本團旅客 ∪ 已出現在各航班組的名字（可能有非團員名字，也列出讓你清理）
        const allNames = Array.from(new Set([...partNames, ...cards.flatMap(c => c.names)]));
        const toggle = (n: string) => setSelNames(s => {
          const next = new Set(s);
          if (next.has(n)) next.delete(n); else next.add(n);
          return next;
        });
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAssignIdx(null)}>
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-sky-600" />
                  指派旅客到{isDefault ? "預設航班" : `組 ${assignIdx + 1}`}
                </h4>
                <button onClick={() => setAssignIdx(null)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"><X className="w-4.5 h-4.5" /></button>
              </div>
              <p className="px-4 pt-2 text-[11px] text-slate-400 shrink-0">
                {isDefault
                  ? "勾選的旅客會移除個人航班，改搭預設航班。"
                  : "勾選 = 搭這組航班；取消勾選 = 回到預設航班。指派會複製這組航段給該旅客。"}
              </p>
              <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-1.5">
                {allNames.length === 0 && <p className="col-span-2 text-xs text-slate-400 p-2">載入中…</p>}
                {allNames.map(n => {
                  const g = groupOf(n);
                  const inThisCard = isDefault ? g === null : g === assignIdx;
                  const checked = selNames.has(n) || (isDefault && g === null);
                  const disabled = isDefault && g === null;  // 已是預設，不能從預設「取消」
                  const notMember = !partNames.includes(n);
                  return (
                    <button
                      key={n}
                      disabled={disabled}
                      onClick={() => toggle(n)}
                      className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-left text-xs transition ${
                        checked
                          ? "border-sky-400 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold"
                          : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-sky-300"
                      } ${disabled ? "opacity-60 cursor-default" : ""}`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        checked ? "bg-sky-500 border-sky-500" : "border-slate-300 dark:border-slate-500"}`}>
                        {checked && <Check className="w-3 h-3 text-white" />}
                      </span>
                      <span className="truncate">{n}</span>
                      <span className="ml-auto text-[10px] text-slate-400 shrink-0">
                        {notMember ? "非團員" : g === null ? "預設" : inThisCard && !isDefault ? "" : `組${g + 1}`}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2 shrink-0">
                <button onClick={() => setAssignIdx(null)} className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition">取消</button>
                <button onClick={saveAssign} disabled={assignSaving}
                  className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50 transition">
                  {assignSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} 儲存指派
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
