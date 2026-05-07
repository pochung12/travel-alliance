"use client";
import { useEffect, useState } from "react";
import { supabase, Tour, TourStatus } from "@/lib/supabase";
import { Plus, Search, Map } from "lucide-react";
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

const EMPTY: Omit<Tour, "id"|"created_at"> = {
  name: "", destination: "", start_date: "", end_date: "",
  pax: 0,
  pax_adult: 0, pax_tour_only: 0, pax_child: 0, pax_infant: 0,
  selling_price: 0, price_tour_only: 0, price_child: 0, price_infant: 0,
  status: "planning", notes: "",
};

export default function GroupsPage() {
  const [tours, setTours]         = useState<Tour[]>([]);
  const [search, setSearch]       = useState("");
  const [filter, setFilter]       = useState<TourStatus | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState({ ...EMPTY });
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);

  const load = async () => {
    const { data } = await supabase.from("tours").select("*").order("start_date", { ascending: false });
    setTours(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = tours.filter(t => {
    const matchSearch = t.name.includes(search) || t.destination.includes(search);
    const matchFilter = filter === "all" || t.status === filter;
    return matchSearch && matchFilter;
  });

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

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Map className="w-6 h-6 text-blue-600" /> 團管理
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> 新增出發團
        </button>
      </div>

      {/* Filter + Search */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm w-56 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-400"
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === opt.value
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            {search || filter !== "all" ? "沒有符合的團" : "還沒有出發團，點右上角新增"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">團名</th>
                <th className="text-left px-4 py-3">目的地</th>
                <th className="text-left px-4 py-3">出發日</th>
                <th className="text-left px-4 py-3">回程日</th>
                <th className="text-right px-4 py-3">人數</th>
                <th className="text-right px-4 py-3">售價/人</th>
                <th className="text-center px-4 py-3">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {filtered.map(tour => (
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
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                    {tour.selling_price ? `NT$${tour.selling_price.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[tour.status]}`}>
                      {STATUS_LABEL[tour.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
