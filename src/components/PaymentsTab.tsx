"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  supabase, TourPayment, PaymentType,
  INCOME_CATEGORIES, EXPENSE_CATEGORIES, COST_CATEGORIES,
} from "@/lib/supabase";
import {
  Plus, X, Upload, ZoomIn, TrendingUp, TrendingDown,
  Scale, Receipt, ChevronDown, ChevronUp, Trash2, ImageIcon,
} from "lucide-react";

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
  sellingPrice: number;
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

export default function PaymentsTab({ tourId, pax, sellingPrice }: Props) {
  const [payments,   setPayments]   = useState<TourPayment[]>([]);
  const [tourCosts,  setTourCosts]  = useState<TourCost[]>([]);
  const [filter,     setFilter]     = useState<"all" | "income" | "expense">("all");
  const [showModal,  setShowModal]  = useState(false);
  const [lightbox,   setLightbox]   = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Modal form state
  const emptyForm = (): Partial<TourPayment> => ({
    type: "income", category: "deposit",
    description: "", amount: 0, payment_date: new Date().toISOString().slice(0, 10),
    note: "", image: "",
  });
  const [form, setForm] = useState<Partial<TourPayment>>(emptyForm());

  // ── Load data ──
  const loadPayments = useCallback(async () => {
    const { data } = await supabase
      .from("tour_payments")
      .select("*")
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
  const expectedRevenue = sellingPrice * pax;
  const actualIncome    = payments.filter(p => p.type === "income").reduce((s, p) => s + p.amount, 0);
  const actualExpense   = payments.filter(p => p.type === "expense").reduce((s, p) => s + p.amount, 0);
  const netBalance      = actualIncome - actualExpense;
  const incomeGap       = expectedRevenue - actualIncome;   // 尚未收到
  const expenseGap      = estimatedCost   - actualExpense;  // 尚未付出

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
    const { error } = await supabase.from("tour_payments").insert([{
      tour_id: tourId,
      type: form.type,
      category: form.category,
      description: form.description || "",
      amount: form.amount,
      payment_date: form.payment_date || null,
      note: form.note || "",
      image: form.image || "",
    }]);
    setSaving(false);
    if (error) { alert("儲存失敗：" + error.message); return; }
    setShowModal(false);
    setForm(emptyForm());
    await loadPayments();
  };

  // ── Delete record ──
  const deleteRecord = async (id: string) => {
    if (!confirm("確定刪除此紀錄？")) return;
    await supabase.from("tour_payments").delete().eq("id", id);
    setExpandedId(null);
    await loadPayments();
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
          sub={`已付支出 ${fmt(actualExpense)}`}
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
          onClick={() => { setForm(emptyForm()); setShowModal(true); }}
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
            onClick={() => { setForm(emptyForm()); setShowModal(true); }}
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
                <th className="w-8 px-2 py-3"></th>
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
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-orange-100 text-orange-700"
                      }`}>
                        {p.type === "income" ? "收入" : "支出"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{categoryLabel(p.type, p.category)}</span>
                      {p.description && (
                        <span className="text-slate-400 dark:text-slate-500 ml-1.5">{p.description}</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${
                      p.type === "income" ? "text-emerald-600" : "text-orange-600"
                    }`}>
                      {p.type === "income" ? "+" : "-"}{fmt(p.amount)}
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
                      {expandedId === p.id
                        ? <ChevronUp className="w-4 h-4 text-slate-400" />
                        : <ChevronDown className="w-4 h-4 text-slate-300" />}
                    </td>
                  </tr>

                  {expandedId === p.id && (
                    <tr key={`${p.id}-exp`} className="bg-slate-50/60 dark:bg-slate-700/20">
                      <td colSpan={6} className="px-5 py-4">
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
                          <button
                            onClick={() => deleteRecord(p.id)}
                            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded transition-colors self-start"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> 刪除
                          </button>
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
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-xs">支出小計</td>
                  <td className="px-4 py-2.5 text-right text-orange-600 tabular-nums">
                    -{fmt(actualExpense)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
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
              <h2 className="font-bold text-slate-800 dark:text-slate-100">新增收付款紀錄</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1">
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
                      onClick={() => setForm(f => ({
                        ...f, type: t,
                        category: t === "income" ? "deposit" : "flight"
                      }))}
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
                onClick={() => setShowModal(false)}
                className="text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveRecord}
                disabled={saving}
                className="text-sm bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "儲存中…" : "儲存"}
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
