"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase, Tour, TourStatus } from "@/lib/supabase";
import { Plus, Search, Map, SlidersHorizontal, GripVertical } from "lucide-react";
import Link from "next/link";

const STATUS_OPTIONS: { value: TourStatus | "all"; label: string }[] = [
  { value: "all",       label: "全部" },
  { value: "planning",  label: "規劃中" },
  { value: "confirmed", label: "已確認" },
  { value: "ongoing",   label: "進行中" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
  { value: "settled",   label: "已結團" },
];

const STATUS_COLOR: Record<string, string> = {
  planning:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  ongoing:   "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  completed: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  settled:   "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

const STATUS_LABEL: Record<string, string> = {
  planning: "規劃中", confirmed: "已確認", ongoing: "進行中",
  completed: "已完成", cancelled: "已取消", settled: "已結團",
};

// ── 可選欄位定義 ───────────────────────────────────────────────
type ExtraColKey = "selling_price" | "revenue" | "cost" | "profit" | "realized" | "income" | "expense";

const EXTRA_COLS: { key: ExtraColKey; label: string }[] = [
  { key: "selling_price", label: "售價/人"    },
  { key: "revenue",       label: "預估收入"   },
  { key: "cost",          label: "估算成本"   },
  { key: "profit",        label: "預估毛利"   },
  { key: "realized",      label: "已實現利潤" },
  { key: "income",        label: "實收款"     },
  { key: "expense",       label: "已付支出"   },
];

// ── localStorage keys ──────────────────────────────────────────
const LS_COLS   = "groups_visible_cols";
const LS_WIDTHS = "groups_col_widths";

// ── 預設欄位寬度 ───────────────────────────────────────────────
const COL_WIDTHS_DEFAULT: Record<string, number> = {
  name: 180, destination: 110, start_date: 90, end_date: 90, pax: 60,
  selling_price: 90, revenue: 110, cost: 110,
  profit: 110, realized: 125, income: 110, expense: 110,
  status: 110,
};

const DEFAULT_EXTRA: ExtraColKey[] = ["revenue", "cost", "profit"];

// ── 財務數字格式 ───────────────────────────────────────────────
const fmt = (n: number) => n === 0 ? "—" : `NT$${Math.round(n).toLocaleString()}`;

const EMPTY: Omit<Tour, "id"|"created_at"> = {
  name: "", destination: "", start_date: "", end_date: "",
  pax: 0, pax_adult: 0, pax_tour_only: 0, pax_child: 0, pax_infant: 0,
  selling_price: 0, price_tour_only: 0, price_child: 0, price_infant: 0,
  status: "planning", notes: "",
};

interface TourFinancial {
  cost: number; income: number; expense: number;
}

function loadLS<T>(key: string, fallback: T): T {
  try {
    const s = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    return s ? (JSON.parse(s) as T) : fallback;
  } catch { return fallback; }
}
function saveLS(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
}

export default function GroupsPage() {
  const [tours,     setTours]     = useState<Tour[]>([]);
  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState<TourStatus | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [form,      setForm]      = useState({ ...EMPTY });
  const [saving,    setSaving]    = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [financials, setFinancials] = useState<Record<string, TourFinancial>>({});

  // ── 可選欄位（順序 = visibleCols 陣列順序）
  const [visibleCols, setVisibleColsRaw] = useState<ExtraColKey[]>(() =>
    loadLS<ExtraColKey[]>(LS_COLS, DEFAULT_EXTRA)
      .filter(k => EXTRA_COLS.some(c => c.key === k))
  );
  const setVisibleCols = useCallback((upd: ExtraColKey[] | ((p: ExtraColKey[]) => ExtraColKey[])) => {
    setVisibleColsRaw(prev => {
      const next = typeof upd === "function" ? upd(prev) : upd;
      saveLS(LS_COLS, next);
      return next;
    });
  }, []);

  // ── 欄位寬度
  const [colWidths, setColWidthsRaw] = useState<Record<string, number>>(() => ({
    ...COL_WIDTHS_DEFAULT,
    ...loadLS<Record<string, number>>(LS_WIDTHS, {}),
  }));
  const setColWidths = useCallback((upd: Record<string, number> | ((p: Record<string, number>) => Record<string, number>)) => {
    setColWidthsRaw(prev => {
      const next = typeof upd === "function" ? upd(prev) : upd;
      saveLS(LS_WIDTHS, next);
      return next;
    });
  }, []);

  // ── resize drag
  const resizeDrag = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const startResize = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    resizeDrag.current = { key, startX: e.clientX, startW: colWidths[key] ?? 110 };
    const onMove = (ev: MouseEvent) => {
      if (!resizeDrag.current) return;
      const w = Math.max(50, resizeDrag.current.startW + ev.clientX - resizeDrag.current.startX);
      setColWidths(p => ({ ...p, [resizeDrag.current!.key]: w }));
    };
    const onUp = () => {
      resizeDrag.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [colWidths, setColWidths]);

  // ── 欄位選擇器 drag-to-reorder
  const [showColPicker, setShowColPicker] = useState(false);
  const [dragColIdx,    setDragColIdx]    = useState<number | null>(null);

  // ── 載入資料
  const load = async () => {
    const [{ data: toursData }, { data: costsData }, { data: paymentsData }] = await Promise.all([
      supabase.from("tours").select("*").order("start_date", { ascending: false }),
      supabase.from("tour_costs").select("tour_id, unit_price, quantity"),
      supabase.from("tour_payments").select("tour_id, type, amount, is_payable"),
    ]);
    setTours(toursData || []);
    const fin: Record<string, TourFinancial> = {};
    for (const c of (costsData || [])) {
      if (!fin[c.tour_id]) fin[c.tour_id] = { cost: 0, income: 0, expense: 0 };
      fin[c.tour_id].cost += (c.unit_price || 0) * (c.quantity || 0);
    }
    for (const p of (paymentsData || [])) {
      if (!fin[p.tour_id]) fin[p.tour_id] = { cost: 0, income: 0, expense: 0 };
      if (p.type === "income") fin[p.tour_id].income += p.amount || 0;
      if (p.type === "expense" && !p.is_payable) fin[p.tour_id].expense += p.amount || 0;
    }
    setFinancials(fin);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = tours.filter(t => {
    const q = search.toLowerCase();
    return (t.name.toLowerCase().includes(q) || t.destination.toLowerCase().includes(q))
      && (filter === "all" || t.status === filter);
  });

  const calcRevenue = (t: Tour) =>
    (t.pax_adult || 0) * (t.selling_price || 0) +
    (t.pax_tour_only || 0) * (t.price_tour_only || 0) +
    (t.pax_child || 0) * (t.price_child || 0) +
    (t.pax_infant || 0) * (t.price_infant || 0) +
    (t.custom_price_tiers || []).reduce((s, ct) => s + ct.pax * ct.price, 0);

  const totals = (() => {
    let revenue = 0, cost = 0, income = 0, expense = 0;
    for (const t of filtered) {
      revenue += calcRevenue(t);
      const fin = financials[t.id];
      if (fin) { cost += fin.cost; income += fin.income; expense += fin.expense; }
    }
    return { revenue, cost, profit: revenue - cost, realized: income - expense, income, expense };
  })();

  const settleGroup = async (tourId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("確定要將此團標記為「已結團」？")) return;
    const { error } = await supabase.from("tours").update({ status: "settled" }).eq("id", tourId);
    if (error) { alert("更新失敗：" + error.message); return; }
    setTours(ts => ts.map(t => t.id === tourId ? { ...t, status: "settled" as TourStatus } : t));
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return alert("請填寫團名");
    setSaving(true);
    const { error } = await supabase.from("tours").insert([form]);
    setSaving(false);
    if (error) { alert("建立失敗：" + error.message); return; }
    setShowModal(false);
    setForm({ ...EMPTY });
    load();
  };

  // ── resizable th helper
  const Th = ({ colKey, children, align = "right" }: { colKey: string; children: React.ReactNode; align?: "left"|"right"|"center" }) => (
    <th
      className={`px-3 py-3 text-${align} whitespace-nowrap relative select-none`}
      style={{ width: colWidths[colKey] ?? 110, minWidth: 50 }}>
      {children}
      <div
        onMouseDown={e => startResize(colKey, e)}
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center group z-10"
        onClick={e => e.stopPropagation()}>
        <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-400 group-hover:w-0.5 transition-all rounded-full" />
      </div>
    </th>
  );

  // ── extra col header color
  const extraColColor: Record<ExtraColKey, string> = {
    selling_price: "text-slate-500 dark:text-slate-400",
    revenue:       "text-blue-500 dark:text-blue-400",
    cost:          "text-orange-500 dark:text-orange-400",
    profit:        "text-emerald-600 dark:text-emerald-400",
    realized:      "text-teal-600 dark:text-teal-400",
    income:        "text-emerald-500",
    expense:       "text-orange-500",
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Map className="w-5 h-5 md:w-6 md:h-6 text-blue-600" /> 團管理
        </h1>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 md:px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">新增出發團</span><span className="sm:hidden">新增</span>
        </button>
      </div>

      {/* Filter + Search + Col picker */}
      <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-3 sm:items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm w-full sm:w-52 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-400"
            placeholder="搜尋團名、目的地…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setFilter(opt.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === opt.value
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* 欄位選擇器 */}
        <div className="relative ml-auto flex items-center gap-2">
          <button
            onClick={() => setColWidths(COL_WIDTHS_DEFAULT)}
            title="重設欄位寬度"
            className="text-xs text-slate-400 hover:text-blue-500 transition-colors px-1.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
            ↺ 重設寬度
          </button>
          <button onClick={() => setShowColPicker(s => !s)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              showColPicker
                ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}>
            <SlidersHorizontal className="w-3.5 h-3.5" /> 欄位
          </button>
          {showColPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColPicker(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-3 min-w-[200px]">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1 pb-2">顯示欄位 · 拖曳排序</p>
                {EXTRA_COLS.map((col, idx) => {
                  const checked = visibleCols.includes(col.key);
                  // Sort order: checked items in their visibleCols order, then unchecked
                  return (
                    <div key={col.key}
                      draggable={checked}
                      onDragStart={() => checked && setDragColIdx(visibleCols.indexOf(col.key))}
                      onDragOver={e => { if (checked) e.preventDefault(); }}
                      onDrop={() => {
                        if (dragColIdx === null || !checked) return;
                        const targetIdx = visibleCols.indexOf(col.key);
                        if (targetIdx === -1 || dragColIdx === targetIdx) return;
                        const next = [...visibleCols];
                        const [moved] = next.splice(dragColIdx, 1);
                        next.splice(targetIdx, 0, moved);
                        setVisibleCols(next);
                        setDragColIdx(null);
                      }}
                      onDragEnd={() => setDragColIdx(null)}
                      className={`flex items-center gap-2 px-1 py-1.5 rounded-lg transition-colors ${
                        dragColIdx === visibleCols.indexOf(col.key) && checked
                          ? "bg-blue-50 dark:bg-blue-900/30 opacity-60"
                          : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      }`}>
                      <GripVertical className={`w-3.5 h-3.5 flex-shrink-0 ${checked ? "text-slate-300 dark:text-slate-600 cursor-grab" : "text-slate-200 dark:text-slate-700"}`} />
                      <label className="flex items-center gap-2 cursor-pointer flex-1">
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            if (checked) setVisibleCols(p => p.filter(k => k !== col.key));
                            else setVisibleCols(p => [...p, col.key]);
                          }}
                          className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0" />
                        <span className="text-xs text-slate-700 dark:text-slate-300">{col.label}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 text-center py-12 text-slate-400 text-sm">
          {search || filter !== "all" ? "沒有符合的團" : "還沒有出發團，點右上角新增"}
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="sm:hidden space-y-2.5">
            {filtered.map(tour => {
              const fin = financials[tour.id] ?? { cost: 0, income: 0, expense: 0 };
              const revenue = calcRevenue(tour);
              const profit  = revenue - fin.cost;
              const realized = fin.income - fin.expense;
              return (
                <Link key={tour.id} href={`/admin/groups/${tour.id}`}
                  className="block bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 active:bg-slate-50 dark:active:bg-slate-700/50 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-semibold text-blue-600 dark:text-blue-400 leading-snug">{tour.name}</div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOR[tour.status]}`}>
                      {STATUS_LABEL[tour.status]}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                    {tour.destination && <div>📍 {tour.destination}</div>}
                    <div className="flex items-center gap-3 flex-wrap">
                      {tour.start_date && <span>✈ {tour.start_date}{tour.end_date ? ` ～ ${tour.end_date}` : ""}</span>}
                      <span>👥 {tour.pax} 人</span>
                    </div>
                    {(revenue > 0 || fin.cost > 0 || fin.income > 0) && (
                      <div className="flex gap-3 flex-wrap pt-1">
                        {visibleCols.includes("revenue")  && revenue   > 0 && <span className="text-blue-600 dark:text-blue-400 font-medium">收 {fmt(revenue)}</span>}
                        {visibleCols.includes("cost")     && fin.cost  > 0 && <span className="text-orange-600 font-medium">成 {fmt(fin.cost)}</span>}
                        {visibleCols.includes("profit")   && (revenue > 0 || fin.cost > 0) && <span className={profit >= 0 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>利 {profit >= 0 ? "+" : ""}{fmt(profit)}</span>}
                        {visibleCols.includes("realized") && (fin.income > 0 || fin.expense > 0) && <span className={realized >= 0 ? "text-teal-600 font-medium" : "text-red-500 font-medium"}>實 {realized >= 0 ? "+" : ""}{fmt(realized)}</span>}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-sm" style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}>
                <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                  <tr>
                    <Th colKey="name"        align="left">團名</Th>
                    <Th colKey="destination" align="left">目的地</Th>
                    <Th colKey="start_date"  align="left">出發日</Th>
                    <Th colKey="end_date"    align="left">回程日</Th>
                    <Th colKey="pax"         align="right">人數</Th>
                    {visibleCols.map(key => {
                      const col = EXTRA_COLS.find(c => c.key === key)!;
                      return (
                        <Th key={key} colKey={key} align="right">
                          <span className={extraColColor[key]}>{col.label}</span>
                        </Th>
                      );
                    })}
                    <Th colKey="status" align="center">狀態</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {filtered.map(tour => {
                    const fin      = financials[tour.id] ?? { cost: 0, income: 0, expense: 0 };
                    const revenue  = calcRevenue(tour);
                    const profit   = revenue - fin.cost;
                    const realized = fin.income - fin.expense;

                    const extraVal: Record<ExtraColKey, React.ReactNode> = {
                      selling_price: tour.selling_price ? `NT$${tour.selling_price.toLocaleString()}` : <span className="text-slate-300 dark:text-slate-600">—</span>,
                      revenue:  revenue  > 0 ? <span className="text-blue-600 dark:text-blue-400 font-semibold">{fmt(revenue)}</span>   : <span className="text-slate-300 dark:text-slate-600">—</span>,
                      cost:     fin.cost > 0 ? <span className="text-orange-600 dark:text-orange-400 font-semibold">{fmt(fin.cost)}</span> : <span className="text-slate-300 dark:text-slate-600">—</span>,
                      profit: (revenue === 0 && fin.cost === 0)
                        ? <span className="text-slate-300 dark:text-slate-600">—</span>
                        : <span className={`font-bold ${profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>{profit >= 0 ? "+" : ""}{fmt(profit)}</span>,
                      realized: (fin.income === 0 && fin.expense === 0)
                        ? <span className="text-slate-300 dark:text-slate-600">—</span>
                        : <span className={`font-bold ${realized >= 0 ? "text-teal-600 dark:text-teal-400" : "text-red-500 dark:text-red-400"}`}>{realized >= 0 ? "+" : ""}{fmt(realized)}</span>,
                      income:  fin.income  > 0 ? <span className="text-emerald-600 dark:text-emerald-400">{fmt(fin.income)}</span>  : <span className="text-slate-300 dark:text-slate-600">—</span>,
                      expense: fin.expense > 0 ? <span className="text-orange-600 dark:text-orange-400">{fmt(fin.expense)}</span> : <span className="text-slate-300 dark:text-slate-600">—</span>,
                    };

                    return (
                      <tr key={tour.id} className="group hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                        <td className="px-3 py-3 overflow-hidden text-ellipsis whitespace-nowrap" style={{ maxWidth: colWidths.name }}>
                          <Link href={`/admin/groups/${tour.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                            {tour.name}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300 overflow-hidden text-ellipsis whitespace-nowrap">{tour.destination || "—"}</td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{tour.start_date || "—"}</td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{tour.end_date || "—"}</td>
                        <td className="px-3 py-3 text-right text-slate-600 dark:text-slate-300">{tour.pax}</td>
                        {visibleCols.map(key => (
                          <td key={key} className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{extraVal[key]}</td>
                        ))}
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[tour.status]}`}>
                              {STATUS_LABEL[tour.status]}
                            </span>
                            {tour.status !== "settled" && tour.status !== "cancelled" && (
                              <button
                                onClick={e => settleGroup(tour.id, e)}
                                title="標記為已結團"
                                className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:hover:bg-purple-800/60 transition-all font-medium whitespace-nowrap"
                              >
                                結團
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* 合計列 */}
                {filtered.length > 1 && (
                  <tfoot className="bg-slate-50 dark:bg-slate-700/50 border-t-2 border-slate-200 dark:border-slate-600 text-xs font-bold">
                    <tr>
                      <td colSpan={5} className="px-3 py-2.5 text-slate-500 dark:text-slate-400">合計（{filtered.length} 團）</td>
                      {visibleCols.map(key => {
                        const v: Record<ExtraColKey, React.ReactNode> = {
                          selling_price: <td key="sp" />,
                          revenue:  <td key="rev"  className="px-3 py-2.5 text-right text-blue-600 dark:text-blue-400 tabular-nums">{fmt(totals.revenue)}</td>,
                          cost:     <td key="cost" className="px-3 py-2.5 text-right text-orange-600 dark:text-orange-400 tabular-nums">{fmt(totals.cost)}</td>,
                          profit:   <td key="pft"  className={`px-3 py-2.5 text-right tabular-nums ${totals.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{totals.profit >= 0 ? "+" : ""}{fmt(totals.profit)}</td>,
                          realized: <td key="rel"  className={`px-3 py-2.5 text-right tabular-nums ${totals.realized >= 0 ? "text-teal-600 dark:text-teal-400" : "text-red-500"}`}>{totals.realized >= 0 ? "+" : ""}{fmt(totals.realized)}</td>,
                          income:   <td key="inc"  className="px-3 py-2.5 text-right text-emerald-600 tabular-nums">{fmt(totals.income)}</td>,
                          expense:  <td key="exp"  className="px-3 py-2.5 text-right text-orange-600 tabular-nums">{fmt(totals.expense)}</td>,
                        };
                        return v[key];
                      })}
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">新增出發團</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="團名 *">
                <input className={inp} value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})} placeholder="例：2024 日本北海道 5 天" />
              </Field>
              <Field label="目的地">
                <input className={inp} value={form.destination}
                  onChange={e => setForm({...form, destination: e.target.value})} placeholder="例：日本北海道" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="出發日"><input type="date" className={inp} value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} /></Field>
                <Field label="回程日"><input type="date" className={inp} value={form.end_date}   onChange={e => setForm({...form, end_date:   e.target.value})} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="預計人數"><input type="number" className={inp} value={form.pax} onChange={e => setForm({...form, pax: +e.target.value})} min="0" /></Field>
                <Field label="每人售價 (NT$)"><input type="number" className={inp} value={form.selling_price} onChange={e => setForm({...form, selling_price: +e.target.value})} min="0" /></Field>
              </div>
              <Field label="狀態">
                <select className={inp} value={form.status} onChange={e => setForm({...form, status: e.target.value as TourStatus})}>
                  {STATUS_OPTIONS.slice(1).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">取消</button>
              <button onClick={handleCreate} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                {saving ? "建立中…" : "建立"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp = "w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
