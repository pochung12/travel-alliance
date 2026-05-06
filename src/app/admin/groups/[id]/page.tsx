"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, Tour, TourStatus, Customer, CustomerTour } from "@/lib/supabase";
import CostSpreadsheet from "@/components/CostSpreadsheet";
import PaymentsTab from "@/components/PaymentsTab";
import { ArrowLeft, Save, Trash2, UserPlus, X, Search } from "lucide-react";
import Link from "next/link";

const STATUS_OPTIONS: { value: TourStatus; label: string }[] = [
  { value: "planning",  label: "規劃中" },
  { value: "confirmed", label: "已確認" },
  { value: "ongoing",   label: "進行中" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
];

const STATUS_COLOR: Record<string, string> = {
  planning:"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  confirmed:"bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  ongoing:"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  completed:"bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  cancelled:"bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const input = "w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400";

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [tour, setTour]               = useState<Tour | null>(null);
  const [form, setForm]               = useState<Partial<Tour>>({});
  const [participants, setParticipants] = useState<(CustomerTour & { customer: Customer })[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCids, setSelectedCids] = useState<Set<string>>(new Set());
  const [addSearch, setAddSearch]       = useState("");
  const [saving, setSaving]            = useState(false);
  const [activeTab, setActiveTab]      = useState<"info"|"costs"|"payments"|"participants">("info");

  const loadTour = async () => {
    const { data } = await supabase.from("tours").select("*").eq("id", id).single();
    if (!data) { router.push("/admin/groups"); return; }
    setTour(data);
    setForm(data);
  };

  const loadParticipants = async () => {
    const { data } = await supabase
      .from("customer_tours")
      .select("*, customer:customers(*)")
      .eq("tour_id", id);
    setParticipants((data || []) as (CustomerTour & { customer: Customer })[]);
  };

  useEffect(() => {
    loadTour();
    loadParticipants();
    supabase.from("customers").select("id,name,phone,email").order("name")
      .then(({ data }) => setAllCustomers((data || []) as Customer[]));
  }, [id]);

  const saveTour = async () => {
    setSaving(true);
    const { error } = await supabase.from("tours").update({
      name: form.name, destination: form.destination,
      start_date: form.start_date, end_date: form.end_date,
      pax: form.pax, selling_price: form.selling_price,
      status: form.status, notes: form.notes,
    }).eq("id", id);
    setSaving(false);
    if (error) { alert("儲存失敗"); return; }
    await loadTour();
  };

  const deleteTour = async () => {
    if (!confirm(`確定刪除「${tour?.name}」？此操作無法復原。`)) return;
    await supabase.from("tours").delete().eq("id", id);
    router.push("/admin/groups");
  };

  const toggleCid = (cid: string) => {
    const next = new Set(selectedCids);
    if (next.has(cid)) next.delete(cid); else next.add(cid);
    setSelectedCids(next);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setSelectedCids(new Set());
    setAddSearch("");
  };

  const addParticipants = async () => {
    if (selectedCids.size === 0) return;
    const rows = Array.from(selectedCids).map(cid => ({ customer_id: cid, tour_id: id }));
    await supabase.from("customer_tours").insert(rows);
    closeAddModal();
    loadParticipants();
  };

  const removeParticipant = async (ctId: string) => {
    if (!confirm("移除此旅客？")) return;
    await supabase.from("customer_tours").delete().eq("id", ctId);
    loadParticipants();
  };

  if (!tour) return (
    <div className="flex justify-center items-center h-64">
      <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const unjoined = allCustomers.filter(c => !participants.find(p => p.customer_id === c.id));

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Back + title */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/groups" className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{tour.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-slate-500 dark:text-slate-400">{tour.destination}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[tour.status]}`}>
                {STATUS_OPTIONS.find(s => s.value === tour.status)?.label}
              </span>
            </div>
          </div>
        </div>
        <button onClick={deleteTour} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 gap-1">
        {([["info","基本資料"],["costs","費用試算"],["payments","收付款"],["participants","報名旅客"]] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {label}
            {tab === "participants" && participants.length > 0 && (
              <span className="ml-1.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-full">
                {participants.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Info ── */}
      {activeTab === "info" && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={lbl}>團名 *</label>
              <input className={input} value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>目的地</label>
              <input className={input} value={form.destination || ""} onChange={e => setForm({...form, destination: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>狀態</label>
              <select className={input} value={form.status} onChange={e => setForm({...form, status: e.target.value as TourStatus})}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>出發日</label>
              <input type="date" className={input} value={form.start_date || ""} onChange={e => setForm({...form, start_date: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>回程日</label>
              <input type="date" className={input} value={form.end_date || ""} onChange={e => setForm({...form, end_date: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>人數</label>
              <input type="number" className={input} value={form.pax || 0} min="0"
                onChange={e => setForm({...form, pax: +e.target.value})} />
            </div>
            <div>
              <label className={lbl}>每人售價 (NT$)</label>
              <input type="number" className={input} value={form.selling_price || 0} min="0"
                onChange={e => setForm({...form, selling_price: +e.target.value})} />
            </div>
            <div className="col-span-2">
              <label className={lbl}>備註</label>
              <textarea className={input + " h-20 resize-none"} value={form.notes || ""}
                onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={saveTour} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors">
              <Save className="w-4 h-4" />
              {saving ? "儲存中…" : "儲存資料"}
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Costs ── */}
      {activeTab === "costs" && (
        <CostSpreadsheet
          tourId={id}
          pax={tour.pax}
          sellingPrice={tour.selling_price}
        />
      )}

      {/* ── Tab: Payments ── */}
      {activeTab === "payments" && (
        <PaymentsTab
          tourId={id}
          pax={tour.pax}
          sellingPrice={tour.selling_price}
        />
      )}

      {/* ── Tab: Participants ── */}
      {activeTab === "participants" && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">報名旅客 ({participants.length} 人)</h3>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <UserPlus className="w-3.5 h-3.5" /> 加入旅客
            </button>
          </div>
          {participants.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">還沒有旅客報名此團</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-500 dark:text-slate-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">姓名</th>
                  <th className="text-left px-4 py-3">電話</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-right px-4 py-3">已付款</th>
                  <th className="w-8 px-2 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                {participants.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <Link href={`/admin/crm/${p.customer_id}`} className="font-medium text-blue-600 hover:underline">
                        {p.customer.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.customer.phone || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.customer.email || "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                      {p.paid_amount ? `NT$${p.paid_amount.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <button onClick={() => removeParticipant(p.id)}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add participant modal */}
      {showAddModal && (() => {
        const filtered = unjoined.filter(c =>
          !addSearch || c.name.includes(addSearch) || (c.phone || "").includes(addSearch));
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
              <div className="px-5 py-4 border-b dark:border-slate-700 flex items-center justify-between">
                <h2 className="font-bold text-slate-800 dark:text-slate-100">加入旅客</h2>
                <button onClick={closeAddModal} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-3">
                {unjoined.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">所有旅客都已加入此團</p>
                ) : (
                  <>
                    {/* 搜尋 */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        className="pl-9 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="搜尋姓名或電話…"
                        value={addSearch}
                        onChange={e => setAddSearch(e.target.value)}
                        autoFocus
                      />
                    </div>

                    {/* 全選列 */}
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <button
                        onClick={() => setSelectedCids(new Set(filtered.map(c => c.id as string)))}
                        className="hover:text-blue-600 hover:underline">全選</button>
                      {selectedCids.size > 0
                        ? <span className="font-medium text-blue-600">已選 {selectedCids.size} 位</span>
                        : <span>共 {filtered.length} 位旅客</span>}
                      <button
                        onClick={() => setSelectedCids(new Set())}
                        className="hover:text-slate-700 hover:underline">取消全選</button>
                    </div>

                    {/* 旅客清單 */}
                    {filtered.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-4">找不到符合的旅客</p>
                    ) : (
                      <div className="max-h-60 overflow-y-auto -mx-1 space-y-0.5">
                        {filtered.map(c => (
                          <label
                            key={c.id}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedCids.has(c.id)}
                              onChange={() => toggleCid(c.id)}
                              className="w-4 h-4 accent-blue-600"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</div>
                              {c.phone && <div className="text-xs text-slate-400 dark:text-slate-500">{c.phone}</div>}
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="px-5 py-4 border-t dark:border-slate-700 flex justify-end gap-3">
                <button onClick={closeAddModal}
                  className="text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 px-4 py-2 rounded-lg">取消</button>
                <button
                  onClick={addParticipants}
                  disabled={selectedCids.size === 0}
                  className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                  {selectedCids.size > 0 ? `加入 ${selectedCids.size} 位旅客` : "加入旅客"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const lbl = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";
