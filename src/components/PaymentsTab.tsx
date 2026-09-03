"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  supabase, TourPayment, PaymentType,
  INCOME_CATEGORIES, EXPENSE_CATEGORIES, COST_CATEGORIES,
} from "@/lib/supabase";
import {
  Plus, X, Upload, ZoomIn, TrendingUp, TrendingDown,
  Scale, Receipt, ChevronDown, ChevronUp, Trash2, ImageIcon, Users, AlertCircle, Printer, Pencil,
} from "lucide-react";
import { buildReceivables, receivableTotals } from "@/lib/receivables";
import type { Tour } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TourCost {
  id: string;
  tour_id: string;
  category: string;
  description: string;
  unit_price: number;
  quantity: number;
}

interface Props {
  tourId: string;
  pax: number;
  revenue: number;   // 預估收入（各類別人數×售價加總，由父層計算傳入）
  /** 本團所有報名旅客（用於款項關聯與應收明細） */
  participants?: {
    customer_id: string;
    customer: { name: string };
    participant_type?: string | null;
    deposit_amount?: number | null;
    balance_amount?: number | null;
  }[];
  /** 團資料（用於依身份類別計算每人應收）*/
  tour?: Pick<Tour, "selling_price" | "price_tour_only" | "price_child" | "price_infant" | "custom_price_tiers">;
  /** 新增/刪除紀錄時通知父層重新載入 */
  onChanged?: () => void;
  /** 更新 customer_ids 時即時通知父層（optimistic，不需重新 fetch）*/
  onPaymentCustsChanged?: (payId: string, newIds: string[]) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function compressImage(file: File, maxPx = 2400, quality = 0.92): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = url;
  });
}

const fmt = (n: number) => `NT$${Math.round(n).toLocaleString()}`;

const input = "w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400";
const lbl   = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, color, icon,
}: { label: string; value: string; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${color}`}>
      <div className="mt-0.5 opacity-70">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium opacity-60 mb-0.5">{label}</p>
        <p className="text-lg font-bold">{value}</p>
        {sub && <p className="text-xs opacity-50 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PaymentsTab({ tourId, pax, revenue, participants = [], tour, onChanged, onPaymentCustsChanged }: Props) {
  const [payments,   setPayments]   = useState<TourPayment[]>([]);
  const [tourCosts,  setTourCosts]  = useState<TourCost[]>([]);
  const [filter,     setFilter]     = useState<"all" | "income" | "expense">("all");
  // 應收客款明細
  const [rcvOpen,  setRcvOpen]  = useState(false);
  const [rcvSort,  setRcvSort]  = useState<"outstanding" | "name">("outstanding");
  const [feeMode,  setFeeMode]  = useState<"summary" | "detail">("summary");
  const [showModal,  setShowModal]  = useState(false);
  const [lightbox,   setLightbox]   = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [formIsPayable, setFormIsPayable] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 旅客對應（新增款項時多選）
  const [formCustIds, setFormCustIds] = useState<string[]>([]);
  const toggleFormCust = (cid: string) =>
    setFormCustIds(prev => prev.includes(cid) ? prev.filter(x => x !== cid) : [...prev, cid]);

  // Modal form state
  const emptyForm = (): Partial<TourPayment> => ({
    type: "income", category: "deposit",
    description: "", amount: 0, payment_date: new Date().toISOString().slice(0, 10),
    note: "", image: "", customer_ids: [],
  });
  const [form, setForm] = useState<Partial<TourPayment>>(emptyForm());
  // 非 null＝正在編輯既有紀錄的 id；null＝新增
  const [editingId, setEditingId] = useState<string | null>(null);

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormCustIds([]);
    setFormIsPayable(false);
  };
  const openCreate = () => { closeModal(); setShowModal(true); };
  const openEdit = (p: TourPayment) => {
    setEditingId(p.id);
    setForm({
      type: p.type, category: p.category, description: p.description || "",
      amount: p.amount, payment_date: p.payment_date || "",
      note: p.note || "", image: p.image || "", customer_ids: p.customer_ids || [],
    });
    setFormCustIds(p.customer_ids || []);
    setFormIsPayable(!!p.is_payable);
    setShowModal(true);
  };

  // ── Load data ──
  const loadPayments = useCallback(async () => {
    const { data } = await supabase
      .from("tour_payments")
      .select("id,tour_id,type,category,description,amount,payment_date,note,image,customer_ids,is_payable,created_at")
      .eq("tour_id", tourId)
      .order("payment_date", { ascending: false });
    setPayments(data || []);
  }, [tourId]);

  const loadCosts = useCallback(async () => {
    const { data } = await supabase
      .from("tour_costs")
      .select("id,tour_id,category,description,unit_price,quantity")
      .eq("tour_id", tourId);
    setTourCosts(data || []);
  }, [tourId]);

  useEffect(() => { loadPayments(); loadCosts(); }, [loadPayments, loadCosts]);

  // ── Derived numbers ──
  const estimatedCost   = tourCosts.reduce((s, c) => s + c.unit_price * c.quantity, 0);
  const expectedRevenue = revenue;
  const actualIncome    = payments.filter(p => p.type === "income").reduce((s, p) => s + p.amount, 0);
  const actualExpense   = payments.filter(p => p.type === "expense" && !p.is_payable).reduce((s, p) => s + p.amount, 0);
  const payableExpense  = payments.filter(p => p.type === "expense" &&  p.is_payable).reduce((s, p) => s + p.amount, 0);
  const netBalance      = actualIncome - actualExpense;
  const incomeGap       = expectedRevenue - actualIncome;   // 尚未收到
  const expenseGap      = estimatedCost   - actualExpense;  // 尚未付出

  // ── 應收客款明細（與旅客分頁共用同一套口徑）──
  const rcvRows = tour
    ? buildReceivables(tour, participants, payments.map(p => ({
        type: p.type, category: p.category, amount: p.amount, customer_ids: p.customer_ids || [],
      })))
    : [];
  const rcvTotal = receivableTotals(rcvRows);
  const rcvSorted = rcvRows.slice().sort((a, b) =>
    rcvSort === "name"
      ? a.name.localeCompare(b.name, "zh-Hant")
      : (b.outstanding - a.outstanding) || a.name.localeCompare(b.name, "zh-Hant"));

  // ── Filtered list ──
  const filtered = payments.filter(p =>
    filter === "all" ? true : p.type === filter
  );

  // ── Image pick ──
  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await compressImage(file);
    setForm(f => ({ ...f, image: b64 }));
    e.target.value = "";
  };

  // ── Save record ──
  const saveRecord = async () => {
    if (!form.amount || form.amount <= 0) { alert("請輸入金額"); return; }
    if (!form.category) { alert("請選擇類別"); return; }
    setSaving(true);
    const basePayload = {
      tour_id: tourId,
      type: form.type,
      category: form.category,
      description: form.description || "",
      amount: form.amount,
      payment_date: form.payment_date || null,
      note: form.note || "",
      image: form.image || "",
      customer_ids: formCustIds,
    };
    const fullPayload = {
      ...basePayload,
      is_payable: form.type === "expense" ? formIsPayable : false,
    };
    // 編輯既有紀錄不改 tour_id
    const { tour_id: _tid, ...updateFull } = fullPayload;
    const { tour_id: _tid2, ...updateBase } = basePayload;

    const write = (payload: Record<string, unknown>) =>
      editingId
        ? supabase.from("tour_payments").update(payload).eq("id", editingId)
        : supabase.from("tour_payments").insert([payload]);

    const { error } = await write(editingId ? updateFull : fullPayload);
    if (error) {
      const isMissingCol = error.message?.includes("schema cache") || error.message?.includes("Could not find") || error.code === "42703";
      if (isMissingCol) {
        // 降級：不帶 is_payable 欄位儲存
        const { error: e2 } = await write(editingId ? updateBase : basePayload);
        setSaving(false);
        if (e2) { alert("儲存失敗：" + e2.message); return; }
        alert("已儲存（應付欄位尚未建立）。\n請在 Supabase SQL Editor 執行：\n\nALTER TABLE tour_payments\n  ADD COLUMN IF NOT EXISTS is_payable BOOLEAN NOT NULL DEFAULT FALSE;");
        const wasEditing = editingId;
        closeModal();
        await loadPayments();
        if (wasEditing) onPaymentCustsChanged?.(wasEditing, formCustIds);
        onChanged?.();
        return;
      }
      setSaving(false);
      alert("儲存失敗：" + error.message);
      return;
    }
    setSaving(false);
    const wasEditing = editingId;
    closeModal();
    await loadPayments();
    if (wasEditing) onPaymentCustsChanged?.(wasEditing, formCustIds);
    onChanged?.();
  };

  // ── Update customer_ids on existing record ──
  const updatePaymentCusts = async (payId: string, newIds: string[]) => {
    await supabase.from("tour_payments").update({ customer_ids: newIds }).eq("id", payId);
    setPayments(prev => prev.map(p => p.id === payId ? { ...p, customer_ids: newIds } : p));
    // optimistic：直接把新 ids 傳給父層，不需要重新 fetch
    onPaymentCustsChanged?.(payId, newIds);
  };

  // ── Mark payable as paid ──
  const markAsPaid = async (id: string) => {
    await supabase.from("tour_payments").update({ is_payable: false }).eq("id", id);
    setPayments(prev => prev.map(p => p.id === id ? { ...p, is_payable: false } : p));
    onChanged?.();
  };

  // ── Delete record ──
  const deleteRecord = async (id: string) => {
    const t = payments.find(x => x.id === id);
    const desc = t
      ? `${t.payment_date || "無日期"}　${t.type === "income" ? "收入" : t.is_payable ? "應付" : "支出"}　`
        + `${categoryLabel(t.type, t.category)}${t.description ? "／" + t.description : ""}　NT$${(t.amount || 0).toLocaleString()}`
      : "";
    if (!confirm(`確定刪除這筆紀錄？此操作無法復原。\n\n${desc}`)) return;
    await supabase.from("tour_payments").delete().eq("id", id);
    setExpandedId(null);
    await loadPayments();
    onChanged?.();
  };

  // ── Category label lookup ──
  const categoryLabel = (type: PaymentType, key: string) => {
    const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    return (cats as readonly { key: string; label: string }[]).find(c => c.key === key)?.label ?? key;
  };

  // ── Form category options ──
  const catOptions = form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="space-y-5">
      {/* ── Summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="費用試算總成本"
          value={fmt(estimatedCost)}
          sub={pax > 0 ? `每人 ${fmt(estimatedCost / pax)}` : undefined}
          color="bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-700/50 dark:border-slate-600 dark:text-slate-200"
          icon={<Receipt className="w-5 h-5" />}
        />
        <SummaryCard
          label="應收客款"
          value={fmt(expectedRevenue)}
          sub={incomeGap > 0 ? `尚差 ${fmt(incomeGap)}` : "已全數收齊 ✓"}
          color="bg-blue-50 border-blue-100 text-blue-800 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-200"
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <SummaryCard
          label="實際收入"
          value={fmt(actualIncome)}
          sub={`已付支出 ${fmt(actualExpense)}${payableExpense > 0 ? ` ／ 應付 ${fmt(payableExpense)}` : ""}`}
          color="bg-emerald-50 border-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-200"
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <SummaryCard
          label={netBalance >= 0 ? "目前淨餘" : "目前缺口"}
          value={fmt(Math.abs(netBalance))}
          sub={expenseGap > 0 ? `估算尚須付 ${fmt(expenseGap)}` : undefined}
          color={netBalance >= 0
            ? "bg-green-50 border-green-100 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-200"
            : "bg-red-50 border-red-100 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300"}
          icon={<Scale className="w-5 h-5" />}
        />
      </div>

      {/* ── 一鍵生成應收單據（可選全團總額／逐人明細）── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Printer className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">一鍵生成應收單據</span>
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700 p-0.5 rounded-lg ml-1">
            {([
              ["summary", "全團總額", "只列一筆：應收 − 已收 = 本次應收"],
              ["detail",  "逐人明細", "每位旅客一列，含已繳／尚欠"],
            ] as const).map(([m, label, tip]) => (
              <button key={m} type="button" title={tip}
                onClick={() => setFeeMode(m)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  feeMode === m
                    ? "bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => window.open(`/admin/groups/${tourId}/print?layout=deposit&mode=${feeMode}`, "_blank")}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">
            <Printer className="w-3.5 h-3.5" /> 訂金{feeMode === "summary" ? "請款單" : "明細表"}
          </button>
          <button onClick={() => window.open(`/admin/groups/${tourId}/print?layout=balance&mode=${feeMode}`, "_blank")}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
            <Printer className="w-3.5 h-3.5" /> 尾款{feeMode === "summary" ? "請款單" : "明細表"}
          </button>
          <span className="text-[11px] text-slate-400">
            {feeMode === "summary"
              ? "全團一筆總額，適合給公司行號或團體窗口"
              : (rcvRows.length > 0
                  ? `${rcvRows.length} 位旅客逐人列出，適合對帳與催款`
                  : "本團尚未加入旅客，明細會是空白表格")}
          </span>
        </div>
      </div>

      {/* ── 應收客款明細 ── */}
      {rcvRows.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-blue-100 dark:border-blue-900/40 shadow-sm overflow-hidden">
          <button onClick={() => setRcvOpen(v => !v)}
            className="w-full px-4 py-3 flex items-center gap-2 flex-wrap text-left hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors">
            <Users className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">應收客款明細</span>
            <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
              {rcvRows.length} 人
            </span>
            {rcvTotal.outstanding > 0 ? (
              <span className="text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full font-semibold">
                未收 {fmt(rcvTotal.outstanding)}・{rcvTotal.unpaidCount} 人
              </span>
            ) : (
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-semibold">
                已全數收齊 ✓
              </span>
            )}
            <span className="ml-auto text-xs text-slate-400 flex items-center gap-1">
              {rcvOpen ? "收合" : "展開"}
              {rcvOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </button>


          {rcvOpen && (
            <div className="border-t border-slate-100 dark:border-slate-700">
              <div className="px-4 py-2 flex items-center gap-2 text-xs text-slate-400 border-b border-slate-50 dark:border-slate-700/50">
                排序：
                {([["outstanding","未收多的優先"],["name","依姓名"]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setRcvSort(k)}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      rcvSort === k ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold"
                                    : "hover:bg-slate-100 dark:hover:bg-slate-700"}`}>
                    {label}
                  </button>
                ))}
                <span className="ml-auto flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  已收金額優先採用收付款紀錄勾選的分攤結果，未勾選時採用旅客分頁手動填寫的金額
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-[10px] uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">旅客</th>
                      <th className="px-3 py-2 text-right font-semibold">應收</th>
                      <th className="px-3 py-2 text-right font-semibold">已收訂金</th>
                      <th className="px-3 py-2 text-right font-semibold">已收尾款</th>
                      <th className="px-3 py-2 text-right font-semibold">已收合計</th>
                      <th className="px-3 py-2 text-right font-semibold">未收</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                    {rcvSorted.map(r => (
                      <tr key={r.customer_id} className={r.outstanding > 0 ? "" : "opacity-60"}>
                        <td className="px-3 py-2">
                          <span className="font-medium text-slate-700 dark:text-slate-200">{r.name}</span>
                          {r.participant_type !== "adult" && (
                            <span className="ml-1.5 text-[10px] text-slate-400">{r.participant_type}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{fmt(r.expected)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {r.depositPaid > 0 ? fmt(r.depositPaid) : "—"}
                          {r.depositLinked && <span className="ml-1 text-[9px] text-emerald-500" title="來自收付款紀錄">●</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {r.balancePaid > 0 ? fmt(r.balancePaid) : "—"}
                          {r.balanceLinked && <span className="ml-1 text-[9px] text-emerald-500" title="來自收付款紀錄">●</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{fmt(r.received)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-bold ${
                          r.outstanding > 0 ? "text-red-600 dark:text-red-400" : "text-slate-300 dark:text-slate-600"}`}>
                          {r.outstanding > 0 ? fmt(r.outstanding) : "✓"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-800 text-white font-bold">
                    <tr>
                      <td className="px-3 py-2.5">合計（{rcvRows.length} 人）</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(rcvTotal.expected)}</td>
                      <td colSpan={2} className="px-3 py-2.5 text-right text-[10px] font-normal text-slate-300">
                        已收齊 {rcvTotal.paidCount} 人／未繳清 {rcvTotal.unpaidCount} 人
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300">{fmt(rcvTotal.received)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-yellow-300">{fmt(rcvTotal.outstanding)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Controls ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden text-sm">
          {(["all","income","expense"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              {f === "all" ? "全部" : f === "income" ? "💰 收入" : "💸 支出"}
              {f !== "all" && (
                <span className="ml-1 text-xs opacity-70">
                  ({payments.filter(p => p.type === f).length})
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 text-sm px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> 新增紀錄
        </button>
      </div>

      {/* ── Records List ── */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 py-14 text-center">
          <Receipt className="w-8 h-8 text-slate-200 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400 dark:text-slate-500">還沒有{filter === "income" ? "收款" : filter === "expense" ? "付款" : "收付款"}紀錄</p>
          <button
            onClick={openCreate}
            className="mt-3 text-xs text-blue-600 hover:underline"
          >
            + 新增第一筆
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-500 dark:text-slate-400 uppercase">
              <tr>
                <th className="text-left px-4 py-3 whitespace-nowrap">日期</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">類型</th>
                <th className="text-left px-4 py-3">類別 / 說明</th>
                <th className="text-right px-4 py-3 whitespace-nowrap">金額</th>
                <th className="text-center px-4 py-3 whitespace-nowrap">佐證</th>
                <th className="w-24 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
              {filtered.map(p => (
                <>
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  >
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {p.payment_date || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        p.type === "income"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : p.is_payable
                            ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300"
                            : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                      }`}>
                        {p.type === "income" ? "收入" : p.is_payable ? "應付" : "支出"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{categoryLabel(p.type, p.category)}</span>
                      {p.description && (
                        <span className="text-slate-400 dark:text-slate-500 ml-1.5">{p.description}</span>
                      )}
                      {/* 旅客對應 chips */}
                      {p.customer_ids && p.customer_ids.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {p.customer_ids.map(cid => {
                            const part = participants.find(x => x.customer_id === cid);
                            return part ? (
                              <span key={cid}
                                className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 border border-blue-100 dark:border-blue-800/60 px-1.5 py-0.5 rounded-md font-medium">
                                👤 {part.customer.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${
                      p.type === "income"
                        ? "text-emerald-600"
                        : p.is_payable
                          ? "text-red-500 dark:text-red-400"
                          : "text-orange-600"
                    }`}>
                      {p.type === "income" ? "+" : "-"}{fmt(p.amount)}
                      {p.is_payable && <span className="ml-1 text-[9px] font-normal opacity-70">未付</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.image ? (
                        <button
                          onClick={e => { e.stopPropagation(); setLightbox(p.image); }}
                          className="inline-flex items-center justify-center w-7 h-7 rounded bg-slate-100 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-500 dark:text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-slate-200 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); openEdit(p); }}
                          title="編輯這筆紀錄"
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); deleteRecord(p.id); }}
                          title="刪除這筆紀錄"
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {expandedId === p.id
                          ? <ChevronUp className="w-4 h-4 text-slate-400" />
                          : <ChevronDown className="w-4 h-4 text-slate-300" />}
                      </div>
                    </td>
                  </tr>

                  {expandedId === p.id && (
                    <tr key={`${p.id}-exp`} className="bg-slate-50/60 dark:bg-slate-700/20">
                      <td colSpan={6} className="px-5 py-4">
                        <div className="space-y-3">
                          {/* 旅客對應管理 */}
                          {participants.length > 0 && (
                            <div>
                              <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">對應旅客</p>
                              <div className="flex flex-wrap gap-1.5">
                                {participants.map(pt => {
                                  const linked = (p.customer_ids || []).includes(pt.customer_id);
                                  return (
                                    <button key={pt.customer_id}
                                      onClick={() => {
                                        const cur = p.customer_ids || [];
                                        const next = linked
                                          ? cur.filter(x => x !== pt.customer_id)
                                          : [...cur, pt.customer_id];
                                        updatePaymentCusts(p.id, next);
                                      }}
                                      className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all font-medium ${
                                        linked
                                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                          : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-blue-400 hover:text-blue-500"
                                      }`}>
                                      {linked ? "✓" : "+"} {pt.customer.name}
                                    </button>
                                  );
                                })}
                                {(p.customer_ids || []).length > 0 && (
                                  <button onClick={() => updatePaymentCusts(p.id, [])}
                                    className="text-xs text-slate-300 hover:text-red-400 px-2 py-1.5 transition-colors">
                                    清除全部
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                          {/* 已付清（應付項目才顯示）*/}
                          {p.is_payable && (
                            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/60 rounded-xl">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-red-700 dark:text-red-300">此筆為應付（未付）紀錄</p>
                                <p className="text-[11px] text-red-400 dark:text-red-500 mt-0.5">確認付款後點擊右側按鈕標記為已付清</p>
                              </div>
                              <button
                                onClick={() => markAsPaid(p.id)}
                                className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow-sm transition-colors whitespace-nowrap flex-shrink-0"
                              >
                                ✓ 已付清
                              </button>
                            </div>
                          )}
                          {/* Note + image + delete */}
                          <div className="flex items-start gap-5 flex-wrap">
                            <div className="flex-1 min-w-0 space-y-1.5 text-sm">
                              {p.note && (
                                <p className="text-slate-600 dark:text-slate-300"><span className="text-slate-400 dark:text-slate-500 text-xs">備註</span>　{p.note}</p>
                              )}
                              <p className="text-slate-400 dark:text-slate-500 text-xs">
                                建立時間：{new Date(p.created_at).toLocaleString("zh-TW")}
                              </p>
                            </div>
                            {p.image && (
                              <img
                                src={p.image}
                                alt="佐證截圖"
                                className="h-24 rounded-lg border border-slate-200 dark:border-slate-600 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => setLightbox(p.image)}
                              />
                            )}
                            <div className="flex items-center gap-2 self-start">
                              <button
                                onClick={() => openEdit(p)}
                                className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-1.5 rounded-lg transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" /> 編輯
                              </button>
                              <button
                                onClick={() => deleteRecord(p.id)}
                                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1.5 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> 刪除
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
            {/* ── Footer totals ── */}
            <tfoot className="bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-600 text-sm font-semibold">
              {filter !== "expense" && (
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-xs">收入小計</td>
                  <td className="px-4 py-2.5 text-right text-emerald-600 tabular-nums">
                    +{fmt(actualIncome)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              )}
              {filter !== "income" && (
                <>
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-slate-500 dark:text-slate-400 text-xs">已付支出小計</td>
                    <td className="px-4 py-2 text-right text-orange-600 tabular-nums">-{fmt(actualExpense)}</td>
                    <td colSpan={2}></td>
                  </tr>
                  {payableExpense > 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-slate-500 dark:text-slate-400 text-xs">應付（未付）小計</td>
                      <td className="px-4 py-2 text-right text-red-500 dark:text-red-400 tabular-nums font-semibold">-{fmt(payableExpense)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  )}
                </>
              )}
              {filter === "all" && (
                <tr className="border-t border-slate-200 dark:border-slate-600">
                  <td colSpan={3} className="px-4 py-2.5 text-slate-700 dark:text-slate-200 text-xs font-bold">淨餘</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${
                    netBalance >= 0 ? "text-green-600" : "text-red-600"
                  }`}>
                    {netBalance >= 0 ? "+" : ""}{fmt(netBalance)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tfoot>
          </table>
          </div>{/* end overflow-x-auto */}
        </div>
      )}

      {/* ── Add Record Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-800 px-5 py-4 border-b dark:border-slate-700 flex items-center justify-between z-10">
              <h2 className="font-bold text-slate-800 dark:text-slate-100">{editingId ? "編輯收付款紀錄" : "新增收付款紀錄"}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Type toggle */}
              <div>
                <label className={lbl}>類型</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["income","expense"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => { setForm(f => ({
                        ...f, type: t,
                        category: t === "income" ? "deposit" : "deposit"
                      })); if (t === "income") setFormIsPayable(false); }}
                      className={`py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                        form.type === t
                          ? t === "income"
                            ? "bg-emerald-500 text-white border-emerald-500"
                            : "bg-orange-500 text-white border-orange-500"
                          : "border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      {t === "income" ? "💰 收入" : "💸 支出"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className={lbl}>類別</label>
                <select
                  className={input}
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                >
                  {catOptions.map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className={lbl}>說明（選填）</label>
                <input
                  className={input}
                  placeholder="e.g. 王小明 訂金、長榮 EX301..."
                  value={form.description || ""}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>金額 (NT$) *</label>
                  <input
                    type="number"
                    className={input}
                    min="0"
                    placeholder="0"
                    value={form.amount || ""}
                    onChange={e => setForm(f => ({ ...f, amount: +e.target.value }))}
                  />
                </div>
                <div>
                  <label className={lbl}>日期</label>
                  <input
                    type="date"
                    className={input}
                    value={form.payment_date || ""}
                    onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
                  />
                </div>
              </div>

              {/* 應付 checkbox（支出才顯示）*/}
              {form.type === "expense" && (
                <label className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/60 rounded-xl cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formIsPayable}
                    onChange={e => setFormIsPayable(e.target.checked)}
                    className="w-4 h-4 accent-red-600 flex-shrink-0"
                  />
                  <div>
                    <span className="text-sm font-semibold text-red-700 dark:text-red-300">應付（未付）</span>
                    <p className="text-[11px] text-red-400 dark:text-red-500 mt-0.5">勾選代表此筆支出尚未實際付款，僅作為應付紀錄</p>
                  </div>
                </label>
              )}

              {/* Note */}
              <div>
                <label className={lbl}>備註（選填）</label>
                <textarea
                  className={input + " h-16 resize-none"}
                  placeholder="付款方式、轉帳帳號末四碼..."
                  value={form.note || ""}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                />
              </div>

              {/* 旅客對應（多選）*/}
              {participants.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={lbl + " mb-0"}>對應旅客（可多選）</label>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {formCustIds.length > 0 && (
                        <span className="text-blue-600 dark:text-blue-400 font-medium">{formCustIds.length} 位已選</span>
                      )}
                      <button type="button"
                        onClick={() => setFormCustIds(participants.map(p => p.customer_id))}
                        className="hover:text-blue-600 hover:underline">全選</button>
                      <button type="button"
                        onClick={() => setFormCustIds([])}
                        className="hover:text-slate-600 hover:underline">清除</button>
                    </div>
                  </div>
                  <div className="border border-slate-200 dark:border-slate-600 rounded-xl max-h-44 overflow-y-auto">
                    {participants.map(pt => {
                      const checked = formCustIds.includes(pt.customer_id);
                      return (
                        <label key={pt.customer_id}
                          className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                            checked
                              ? "bg-blue-50 dark:bg-blue-900/20"
                              : "hover:bg-slate-50 dark:hover:bg-slate-700/30"
                          }`}>
                          <input type="checkbox"
                            checked={checked}
                            onChange={() => toggleFormCust(pt.customer_id)}
                            className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                          <span className={`text-sm font-medium ${checked ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-200"}`}>
                            {pt.customer.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Screenshot upload */}
              <div>
                <label className={lbl}>佐證截圖（選填）</label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
                {form.image ? (
                  <div className="relative inline-block">
                    <img
                      src={form.image}
                      alt="截圖預覽"
                      className="h-28 rounded-lg border border-slate-200 dark:border-slate-600 object-cover"
                    />
                    <button
                      onClick={() => setForm(f => ({ ...f, image: "" }))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full h-20 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-400 dark:text-slate-500 hover:border-blue-300 hover:text-blue-500 transition-colors"
                  >
                    <Upload className="w-5 h-5" />
                    <span className="text-xs">上傳截圖 / 匯款憑證</span>
                  </button>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t dark:border-slate-700 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveRecord}
                disabled={saving}
                className="text-sm bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "儲存中…" : editingId ? "更新" : "儲存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="佐證截圖"
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-9 h-9 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
