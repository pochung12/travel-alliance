"use client";
import { useEffect, useState } from "react";
import { supabase, Tour, TourStatus } from "@/lib/supabase";
import { Plus, Search, Map, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

const STATUS_OPTIONS: { value: TourStatus | "all"; label: string }[] = [
  { value: "all",       label: "全部" },
  { value: "planning",  label: "規劃中" },
  { value: "confirmed", label: "已確認" },
  { value: "ongoing",   label: "進行中" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
];

const STATUS_COLOR: Record<string, string> = {
  planning:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  ongoing:   "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  completed: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const STATUS_LABEL: Record<string, string> = {
  planning: "規劃中", confirmed: "已確認", ongoing: "進行中",
  completed: "已完成", cancelled: "已取消",
};

// ── 可選欄位定義 ───────────────────────────────────────────────
type ExtraColKey = "selling_price" | "revenue" | "cost" | "profit" | "income" | "expense";

const EXTRA_COLS: { key: ExtraColKey; label: string; header: string }[] = [
  { key: "selling_price", label: "售價/人",  header: "售價/人"  },
  { key: "revenue",       label: "預估收入", header: "預估收入" },
  { key: "cost",          label: "估算成本", header: "估算成本" },
  { key: "profit",        label: "毛利",     header: "毛利"     },
  { key: "income",        label: "實收款",   header: "實收款"   },
  { key: "expense",       label: "已付支出", header: "已付支出" },
];

const DEFAULT_EXTRA: ExtraColKey[] = ["revenue", "cost", "profit"];

// ── 財務數字格式 ───────────────────────────────────────────────
const fmt = (n: number) => n === 0 ? "—" : `NT$${Math.round(n).toLocaleString()}`;

const EMPTY: Omit<Tour, "id"|"created_at"> = {
  name: "", destination: "", start_date: "", end_date: "",
  pax: 0,
  pax_adult: 0, pax_tour_only: 0, pax_child: 0, pax_infant: 0,
  selling_price: 0, price_tour_only: 0, price_child: 0, price_infant: 0,
  status: "planning", notes: "",
};

interface TourFinancial {
  cost:    number; // 估算成本（tour_costs 加總）
  income:  number; // 實收款（payments income）
  expense: number; // 已付支出（payments expense, 不含應付）
}

export default function GroupsPage() {
  const [tours, setTours]         = useState<Tour[]>([]);
  const [search, setSearch]       = useState("");
  const [filter, setFilter]       = useState<TourStatus | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState({ ...EMPTY });
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);
  // 財務資料
  const [financials, setFinancials] = useState<Record<string, TourFinancial>>({});
  // 可選欄位
  const [visibleCols, setVisibleCols] = useState<ExtraColKey[]>(DEFAULT_EXTRA);
  const [showColPicker, setShowColPicker] = useState(false);

  const load = async () => {
    const [{ data: toursData }, { data: costsData }, { data: paymentsData }] = await Promise.all([
      supabase.from("tours").select("*").order("start_date", { ascending: false }),
      supabase.from("tour_costs").select("tour_id, unit_price, quantity"),
      supabase.from("tour_payments").select("tour_id, type, amount, is_payable"),
    ]);

    setTours(toursData || []);

    // 聚合財務數據
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
    const matchSearch = t.name.includes(search) || t.destination.includes(search);
    const matchFilter = filter === "all" || t.status === filter;
    return matchSearch && matchFilter;
  });

  // 計算預估收入
  const calcRevenue = (t: Tour) =>
    (t.pax_adult     || 0) * (t.selling_price   || 0) +
    (t.pax_tour_only || 0) * (t.price_tour_only || 0) +
    (t.pax_child     || 0) * (t.price_child     || 0) +
    (t.pax_infant    || 0) * (t.price_infant    || 0) +
    (t.custom_price_tiers || []).reduce((s, ct) => s + ct.pax * ct.price, 0);

  const toggleCol = (key: ExtraColKey) =>
    setVisibleCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );

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

  // 彙總列（篩選結果的合計）
  const totals = (() => {
    let revenue = 0, cost = 0, income = 0, expense = 0;
    for (const t of filtered) {
      revenue += calcRevenue(t);
      const fin = financials[t.id];
      if (fin) { cost += fin.cost; income += fin.income; expense += fin.expense; }
    }
    return { revenue, cost, profit: revenue - cost, income, expense };
  })();

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Map className="w-5 h-5 md:w-6 md:h-6 text-blue-600" /> 團管理
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 md:px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">新增出發團</span><span className="sm:hidden">新增</span>
        </button>
      </div>

      {/* Filter + Search + Col picker */}
      <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-3 sm:items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm w-full sm:w-52 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-400"
            placeholder="搜尋團名、目的地…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === opt.value
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* 欄位選擇器 */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowColPicker(s => !s)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              showColPicker
                ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            欄位
          </button>
          {showColPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColPicker(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-3 min-w-[160px]">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1 pb-2">顯示欄位</p>
                {EXTRA_COLS.map(col => (
                  <label key={col.key} className="flex items-center gap-2 px-1 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer">
                    <input type="checkbox"
                      checked={visibleCols.includes(col.key)}
                      onChange={() => toggleCol(col.key)}
                      className="w-3.5 h-3.5 accent-blue-600" />
                    <span className="text-xs text-slate-700 dark:text-slate-300">{col.label}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Table — desktop / Card list — mobile */}
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
                    {(visibleCols.includes("revenue") || visibleCols.includes("profit")) && (revenue > 0 || fin.cost > 0) && (
                      <div className="flex gap-3 flex-wrap pt-1">
                        {visibleCols.includes("revenue")  && revenue > 0  && <span className="text-blue-600 dark:text-blue-400 font-medium">收 {fmt(revenue)}</span>}
                        {visibleCols.includes("cost")     && fin.cost > 0 && <span className="text-orange-600 font-medium">成 {fmt(fin.cost)}</span>}
                        {visibleCols.includes("profit")   && revenue > 0  && (
                          <span className={profit >= 0 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                            利 {profit >= 0 ? "+" : ""}{fmt(profit)}
                          </span>
                        )}
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
              <table className="w-full text-sm min-w-[600px]">
                <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">團名</th>
                    <th className="text-left px-4 py-3">目的地</th>
                    <th className="text-left px-4 py-3">出發日</th>
                    <th className="text-left px-4 py-3">回程日</th>
                    <th className="text-right px-4 py-3">人數</th>
                    {visibleCols.includes("selling_price") && <th className="text-right px-4 py-3">售價/人</th>}
                    {visibleCols.includes("revenue")       && <th className="text-right px-4 py-3 text-blue-500 dark:text-blue-400">預估收入</th>}
                    {visibleCols.includes("cost")          && <th className="text-right px-4 py-3 text-orange-500 dark:text-orange-400">估算成本</th>}
                    {visibleCols.includes("profit")        && <th className="text-right px-4 py-3 text-emerald-600 dark:text-emerald-400">毛利</th>}
                    {visibleCols.includes("income")        && <th className="text-right px-4 py-3 text-emerald-500">實收款</th>}
                    {visibleCols.includes("expense")       && <th className="text-right px-4 py-3 text-orange-500">已付支出</th>}
                    <th className="text-center px-4 py-3">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {filtered.map(tour => {
                    const fin     = financials[tour.id] ?? { cost: 0, income: 0, expense: 0 };
                    const revenue = calcRevenue(tour);
                    const profit  = revenue - fin.cost;
                    return (
                      <tr key={tour.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/admin/groups/${tour.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                            {tour.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{tour.destination || "—"}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{tour.start_date || "—"}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{tour.end_date || "—"}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{tour.pax}</td>
                        {visibleCols.includes("selling_price") && (
                          <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                            {tour.selling_price ? `NT$${tour.selling_price.toLocaleString()}` : "—"}
                          </td>
                        )}
                        {visibleCols.includes("revenue") && (
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                            {revenue > 0 ? fmt(revenue) : <span className="text-slate-300 dark:text-slate-600 font-normal">—</span>}
                          </td>
                        )}
                        {visibleCols.includes("cost") && (
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                            {fin.cost > 0 ? fmt(fin.cost) : <span className="text-slate-300 dark:text-slate-600 font-normal">—</span>}
                          </td>
                        )}
                        {visibleCols.includes("profit") && (
                          <td className={`px-4 py-3 text-right font-bold tabular-nums ${
                            revenue === 0 && fin.cost === 0
                              ? "text-slate-300 dark:text-slate-600"
                              : profit >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-500 dark:text-red-400"
                          }`}>
                            {revenue === 0 && fin.cost === 0 ? "—" : `${profit >= 0 ? "+" : ""}${fmt(profit)}`}
                          </td>
                        )}
                        {visibleCols.includes("income") && (
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                            {fin.income > 0 ? fmt(fin.income) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                          </td>
                        )}
                        {visibleCols.includes("expense") && (
                          <td className="px-4 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400">
                            {fin.expense > 0 ? fmt(fin.expense) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                          </td>
                        )}
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[tour.status]}`}>
                            {STATUS_LABEL[tour.status]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* 合計列 */}
                {filtered.length > 1 && (
                  <tfoot className="bg-slate-50 dark:bg-slate-700/50 border-t-2 border-slate-200 dark:border-slate-600 text-xs font-bold">
                    <tr>
                      <td colSpan={5} className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                        合計（{filtered.length} 團）
                      </td>
                      {visibleCols.includes("selling_price") && <td />}
                      {visibleCols.includes("revenue") && (
                        <td className="px-4 py-2.5 text-right text-blue-600 dark:text-blue-400 tabular-nums">{fmt(totals.revenue)}</td>
                      )}
                      {visibleCols.includes("cost") && (
                        <td className="px-4 py-2.5 text-right text-orange-600 dark:text-orange-400 tabular-nums">{fmt(totals.cost)}</td>
                      )}
                      {visibleCols.includes("profit") && (
                        <td className={`px-4 py-2.5 text-right tabular-nums ${totals.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                          {totals.profit >= 0 ? "+" : ""}{fmt(totals.profit)}
                        </td>
                      )}
                      {visibleCols.includes("income") && (
                        <td className="px-4 py-2.5 text-right text-emerald-600 tabular-nums">{fmt(totals.income)}</td>
                      )}
                      {visibleCols.includes("expense") && (
                        <td className="px-4 py-2.5 text-right text-orange-600 tabular-nums">{fmt(totals.expense)}</td>
                      )}
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
                <input className={input} value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})} placeholder="例：2024 日本北海道 5 天" />
              </Field>
              <Field label="目的地">
                <input className={input} value={form.destination}
                  onChange={e => setForm({...form, destination: e.target.value})} placeholder="例：日本北海道" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="出發日">
                  <input type="date" className={input} value={form.start_date}
                    onChange={e => setForm({...form, start_date: e.target.value})} />
                </Field>
                <Field label="回程日">
                  <input type="date" className={input} value={form.end_date}
                    onChange={e => setForm({...form, end_date: e.target.value})} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="預計人數">
                  <input type="number" className={input} value={form.pax}
                    onChange={e => setForm({...form, pax: +e.target.value})} min="0" />
                </Field>
                <Field label="每人售價 (NT$)">
                  <input type="number" className={input} value={form.selling_price}
                    onChange={e => setForm({...form, selling_price: +e.target.value})} min="0" />
                </Field>
              </div>
              <Field label="狀態">
                <select className={input} value={form.status}
                  onChange={e => setForm({...form, status: e.target.value as TourStatus})}>
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

const input = "w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
