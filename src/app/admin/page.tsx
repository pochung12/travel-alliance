"use client";
import { useEffect, useState } from "react";
import { supabase, Tour } from "@/lib/supabase";
import {
  Map, Users, CalendarDays, TrendingUp,
  BarChart2, ChevronLeft, ChevronRight,
  Settings, Plus, Trash2, Check,
} from "lucide-react";
import Link from "next/link";

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; badge: string; bar: string }> = {
  planning:  { label: "規劃中", badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300", bar: "bg-yellow-400" },
  confirmed: { label: "已確認", badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",         bar: "bg-blue-500" },
  ongoing:   { label: "進行中", badge: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",      bar: "bg-emerald-500" },
  completed: { label: "已完成", badge: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",         bar: "bg-slate-400" },
  cancelled: { label: "已取消", badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",             bar: "bg-red-400" },
};

const STEP_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-purple-500",
  "bg-pink-500",  "bg-rose-500",   "bg-orange-500",
  "bg-amber-500", "bg-green-500",  "bg-teal-500", "bg-cyan-500",
];

const DEFAULT_STAGES = ["收訂", "付訂", "開票", "收尾款", "付尾款", "行前說明會"];
const LS_STAGES   = "ta_stages";
const LS_PROGRESS = "ta_progress";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

// ── CalendarView ───────────────────────────────────────────────────────────────

function CalendarView({ tours }: { tours: Tour[] }) {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const prevMonth = () => { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month===11) { setYear(y => y+1); setMonth(0); } else setMonth(m => m+1); };

  const days      = daysInMonth(year, month);
  const startDow  = new Date(year, month, 1).getDay();
  const totalCells = Math.ceil((startDow + days) / 7) * 7;
  const todayStr  = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = toDateStr(year, month, 1);
  const monthEnd   = toDateStr(year, month, days);

  // Tours overlapping this month
  const visible = tours
    .filter(t => t.status !== "cancelled" && t.start_date <= monthEnd && t.end_date >= monthStart)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  // Gantt: position relative to month days (not grid cells)
  function ganttBar(tour: Tour) {
    const cs = tour.start_date < monthStart ? monthStart : tour.start_date;
    const ce = tour.end_date   > monthEnd   ? monthEnd   : tour.end_date;
    const sd = parseInt(cs.split("-")[2]);
    const ed = parseInt(ce.split("-")[2]);
    const left  = ((sd - 1) / days) * 100;
    const width = ((ed - sd + 1) / days) * 100;
    return { left, width };
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
      {/* Month nav */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
          <ChevronLeft className="w-4 h-4 text-slate-500" />
        </button>
        <span className="font-semibold text-slate-800 dark:text-slate-100">
          {year} 年 {month + 1} 月
        </span>
        <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      <div className="p-4">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={`text-center text-xs font-medium py-1.5 ${i===0?"text-red-400":i===6?"text-blue-400":"text-slate-400 dark:text-slate-500"}`}>{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 border-l border-t border-slate-100 dark:border-slate-700">
          {Array.from({ length: totalCells }, (_, i) => {
            const day = i - startDow + 1;
            const inMonth = day >= 1 && day <= days;
            const dateStr = inMonth ? toDateStr(year, month, day) : "";
            const isToday = dateStr === todayStr;
            const isWeekend = i % 7 === 0 || i % 7 === 6;
            const starts = inMonth
              ? tours.filter(t => t.start_date === dateStr && t.status !== "cancelled")
              : [];

            return (
              <div key={i}
                className={`min-h-[80px] border-r border-b border-slate-100 dark:border-slate-700 p-1.5 ${
                  !inMonth ? "bg-slate-50/60 dark:bg-slate-800/40" :
                  isWeekend ? "bg-blue-50/20 dark:bg-slate-800" : "bg-white dark:bg-slate-800"
                }`}
              >
                {inMonth && (
                  <>
                    <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs mb-1 ${
                      isToday
                        ? "bg-blue-600 text-white font-bold"
                        : isWeekend
                          ? "text-blue-500 dark:text-blue-400 font-medium"
                          : "text-slate-600 dark:text-slate-300"
                    }`}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {starts.map(t => {
                        const s = STATUS[t.status] ?? STATUS.planning;
                        return (
                          <Link key={t.id} href={`/admin/groups/${t.id}`}
                            className={`block truncate text-[10px] leading-4 px-1.5 rounded font-medium ${s.badge}`}
                            title={`${t.name} (出發)`}
                          >
                            ✈ {t.name}
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Gantt timeline */}
        {visible.length > 0 && (
          <div className="mt-5">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
              本月出團時間軸
            </div>

            {/* Day ruler */}
            <div className="relative h-4 mb-1 select-none">
              {[1, 5, 10, 15, 20, 25, days].map(d => (
                <span
                  key={d}
                  className="absolute text-[9px] text-slate-400 dark:text-slate-600 -translate-x-1/2"
                  style={{ left: `${((d-1) / days) * 100}%` }}
                >
                  {d}日
                </span>
              ))}
            </div>

            {/* Bars */}
            <div className="space-y-1.5">
              {visible.map(tour => {
                const { left, width } = ganttBar(tour);
                const s = STATUS[tour.status] ?? STATUS.planning;
                return (
                  <div key={tour.id} className="relative h-8">
                    <Link
                      href={`/admin/groups/${tour.id}`}
                      className={`absolute top-0 h-full rounded-lg ${s.bar} flex items-center px-2.5 text-white text-[11px] font-medium truncate shadow-sm hover:brightness-110 transition-all`}
                      style={{ left: `${left}%`, width: `${Math.max(width, 3)}%` }}
                      title={`${tour.name}｜${tour.start_date} ～ ${tour.end_date}`}
                    >
                      {width > 8 ? tour.name : ""}
                    </Link>
                    {width <= 8 && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 dark:text-slate-400 pl-1 truncate max-w-[80px]"
                        style={{ left: `calc(${left}% + ${Math.max(width, 3)}% + 4px)` }}
                      >
                        {tour.name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
              {Object.entries(STATUS).filter(([k]) => k !== "cancelled").map(([, v]) => (
                <div key={v.label} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-sm ${v.bar}`} />
                  <span className="text-xs text-slate-500 dark:text-slate-400">{v.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {visible.length === 0 && (
          <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm">本月無出團行程</div>
        )}
      </div>
    </div>
  );
}

// ── ProgressView ───────────────────────────────────────────────────────────────

function ProgressView({ tours }: { tours: Tour[] }) {
  const [stages,   setStages]   = useState<string[]>(DEFAULT_STAGES);
  const [progress, setProgress] = useState<Record<string, boolean[]>>({});
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState<string[]>([]);
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const s = localStorage.getItem(LS_STAGES);
      if (s) setStages(JSON.parse(s));
    } catch {}
    try {
      const p = localStorage.getItem(LS_PROGRESS);
      if (p) setProgress(JSON.parse(p));
    } catch {}
  }, []);

  const saveStages = (next: string[]) => {
    const filtered = next.filter(s => s.trim());
    setStages(filtered);
    localStorage.setItem(LS_STAGES, JSON.stringify(filtered));
    setEditing(false);
  };

  const toggleStep = (tourId: string, idx: number) => {
    setProgress(prev => {
      const cur = Array.isArray(prev[tourId]) ? [...prev[tourId]] : Array(stages.length).fill(false);
      while (cur.length < stages.length) cur.push(false);
      cur[idx] = !cur[idx];
      const next = { ...prev, [tourId]: cur };
      localStorage.setItem(LS_PROGRESS, JSON.stringify(next));
      return next;
    });
  };

  const activeTours    = tours.filter(t => !["cancelled","completed"].includes(t.status))
                              .sort((a,b) => a.start_date.localeCompare(b.start_date));
  const completedTours = tours.filter(t => t.status === "completed")
                              .sort((a,b) => b.start_date.localeCompare(a.start_date));

  const TourCard = ({ tour, dimmed }: { tour: Tour; dimmed?: boolean }) => {
    const steps = Array.isArray(progress[tour.id]) ? progress[tour.id] : [];
    const done  = stages.reduce((acc, _, i) => acc + (steps[i] ? 1 : 0), 0);
    const pct   = stages.length > 0 ? Math.round((done / stages.length) * 100) : 0;
    const s     = STATUS[tour.status] ?? STATUS.planning;

    return (
      <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-5 transition-opacity ${dimmed ? "opacity-60" : ""}`}>
        {/* Tour header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <Link href={`/admin/groups/${tour.id}`}
              className="font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors block truncate"
            >
              {tour.name}
            </Link>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
              {tour.destination} ・ {tour.start_date} ～ {tour.end_date} ・ {tour.pax} 人
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${s.badge}`}>{s.label}</span>
        </div>

        {/* Progress bar */}
        {mounted && stages.length > 0 && (
          <>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-500 dark:text-slate-400">進度</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{done} / {stages.length}　{pct}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-4">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: pct === 100
                    ? "linear-gradient(90deg,#10b981,#059669)"
                    : "linear-gradient(90deg,#3b82f6,#6366f1)",
                }}
              />
            </div>

            {/* Stage buttons */}
            <div className="flex flex-wrap gap-2">
              {stages.map((stage, idx) => {
                const checked = steps[idx] ?? false;
                const color   = STEP_COLORS[idx % STEP_COLORS.length];
                return (
                  <button
                    key={idx}
                    onClick={() => toggleStep(tour.id, idx)}
                    className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border font-medium transition-all select-none ${
                      checked
                        ? `${color} text-white border-transparent shadow-sm`
                        : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"
                    }`}
                  >
                    {checked && <Check className="w-3 h-3" />}
                    {stage}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header + edit button */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-slate-500" /> 出團進度追蹤
        </h2>
        <button
          onClick={() => { setDraft([...stages]); setEditing(v => !v); }}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            editing
              ? "bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-200"
              : "border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          {editing ? "關閉編輯" : "編輯階段"}
        </button>
      </div>

      {/* Stage editor */}
      {editing && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-600 p-5 shadow-md">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">進度階段設定</p>
          <div className="space-y-2 mb-3">
            {draft.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold shrink-0 ${STEP_COLORS[i % STEP_COLORS.length]}`}>
                  {i+1}
                </span>
                <input
                  value={s}
                  onChange={e => { const n=[...draft]; n[i]=e.target.value; setDraft(n); }}
                  className="flex-1 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button onClick={() => setDraft(draft.filter((_,j)=>j!==i))}
                  className="text-slate-300 hover:text-red-400 dark:text-slate-600 dark:hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setDraft([...draft, "新階段"])}
            className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4"
          >
            <Plus className="w-3.5 h-3.5" /> 新增階段
          </button>
          <div className="flex gap-2">
            <button onClick={() => saveStages(draft)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg py-2 transition-colors">
              儲存
            </button>
            <button onClick={() => setEditing(false)}
              className="flex-1 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm rounded-lg py-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Active tours */}
      {activeTours.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
          目前沒有進行中的出團
        </div>
      ) : (
        <div className="space-y-4">
          {activeTours.map(t => <TourCard key={t.id} tour={t} />)}
        </div>
      )}

      {/* Completed tours */}
      {completedTours.length > 0 && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700" />
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">已完成出團</span>
            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700" />
          </div>
          <div className="space-y-3">
            {completedTours.map(t => <TourCard key={t.id} tour={t} dimmed />)}
          </div>
        </>
      )}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [tours, setTours]         = useState<Tour[]>([]);
  const [customerCount, setCount] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<"calendar"|"progress">("calendar");

  useEffect(() => {
    (async () => {
      const [{ data }, { count }] = await Promise.all([
        supabase.from("tours").select("*").order("start_date", { ascending: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
      ]);
      setTours(data || []);
      setCount(count || 0);
      setLoading(false);
    })();
  }, []);

  const active    = tours.filter(t => ["confirmed","ongoing"].includes(t.status)).length;
  const completed = tours.filter(t => t.status === "completed").length;

  const stats = [
    { label: "總出團數",    value: tours.length,                 icon: Map,          color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-900/30" },
    { label: "旅客人數",    value: customerCount,                icon: Users,        color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/30" },
    { label: "確認/進行中", value: active,                       icon: CalendarDays, color: "text-amber-600",  bg: "bg-amber-50 dark:bg-amber-900/30" },
    { label: "已完成出團",  value: completed,                    icon: TrendingUp,   color: "text-green-600",  bg: "bg-green-50 dark:bg-green-900/30" },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">儀表板</h1>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700/60 rounded-xl p-1">
          {([
            { key: "calendar", label: "日曆模式",   Icon: CalendarDays },
            { key: "progress", label: "進度條模式",  Icon: BarChart2 },
          ] as const).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                view === key
                  ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Main content */}
      {view === "calendar"
        ? <CalendarView tours={tours} />
        : <ProgressView tours={tours} />
      }
    </div>
  );
}
