"use client";
import { useEffect, useState, useRef } from "react";
import { supabase, Tour, Customer, Contract, ContractStatus } from "@/lib/supabase";
import {
  Plus, Search, FilePen, Copy, Eye, Trash2,
  CheckCircle2, Clock, X, Upload, ExternalLink,
  Download, AlertCircle, Settings2,
} from "lucide-react";
import Link from "next/link";

// ── 類型 ────────────────────────────────────────────────────────────────────

type ContractListItem = Omit<Contract, "pdf_data"> & {
  tour: { name: string } | null;
  customer: { name: string } | null;
};

const STATUS_LABEL: Record<ContractStatus, string> = {
  pending: "待簽署",
  signed:  "已簽署",
};
const STATUS_COLOR: Record<ContractStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  signed:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};
const STATUS_ICON: Record<ContractStatus, React.ElementType> = {
  pending: Clock,
  signed:  CheckCircle2,
};

// ── 工具函式 ─────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
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

// ── SQL 提示 ─────────────────────────────────────────────────────────────────

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  pdf_data TEXT NOT NULL DEFAULT '',
  pdf_name TEXT NOT NULL DEFAULT '',
  tour_id UUID REFERENCES tours(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sign_token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),
  signed_at TIMESTAMPTZ,
  signature_image TEXT,
  signer_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);`;

// ── 主元件 ───────────────────────────────────────────────────────────────────

export default function ContractsPage() {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [tours,     setTours]     = useState<Pick<Tour, "id" | "name">[]>([]);
  const [customers, setCustomers] = useState<Pick<Customer, "id" | "name">[]>([]);
  const [filter,    setFilter]    = useState<ContractStatus | "all">("all");
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(true);
  const [tableErr,  setTableErr]  = useState(false);
  const [showSQL,   setShowSQL]   = useState(false);
  const [copied,    setCopied]    = useState<string | null>(null);

  // ── 建立 Modal ──
  const [showCreate,  setShowCreate]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const [form, setForm] = useState({
    title: "", pdf_data: "", pdf_name: "", tour_id: "", customer_id: "", notes: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);

  // ── 查看 Modal ──
  const [showView,    setShowView]    = useState(false);
  const [viewItem,    setViewItem]    = useState<ContractListItem | null>(null);
  const [viewSig,     setViewSig]     = useState<string | null>(null);
  const [viewPdfUrl,  setViewPdfUrl]  = useState<string | null>(null);
  const [viewPdfLoading, setViewPdfLoading] = useState(false);

  // ── 載入 ─────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    const [{ data: cData, error: cErr }, { data: tData }, { data: cuData }] = await Promise.all([
      supabase.from("contracts")
        .select("id,title,pdf_name,status,sign_token,signed_at,signer_name,notes,created_at,tour_id,customer_id,tour:tours(name),customer:customers(name)")
        .order("created_at", { ascending: false }),
      supabase.from("tours").select("id,name").order("start_date", { ascending: false }),
      supabase.from("customers").select("id,name").order("name"),
    ]);
    if (cErr) {
      if (cErr.message?.includes("does not exist") || cErr.message?.includes("relation")) {
        setTableErr(true);
      }
    }
    setContracts((cData || []) as unknown as ContractListItem[]);
    setTours(tData || []);
    setCustomers(cuData || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── PDF 上傳 ────────────────────────────────────────────────────────────

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { alert("請選擇 PDF 檔案"); return; }
    if (file.size > 10 * 1024 * 1024) { alert("PDF 檔案不可超過 10MB"); return; }
    setPdfLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setForm(f => ({ ...f, pdf_data: reader.result as string, pdf_name: file.name }));
      setPdfLoading(false);
    };
    reader.readAsDataURL(file);
  };

  // ── 建立合約 ────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.title.trim()) { alert("請填寫合約標題"); return; }
    if (!form.pdf_data)     { alert("請上傳 PDF 檔案"); return; }
    setSaving(true);
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      pdf_data: form.pdf_data,
      pdf_name: form.pdf_name,
      notes: form.notes,
    };
    if (form.tour_id)     payload.tour_id     = form.tour_id;
    if (form.customer_id) payload.customer_id = form.customer_id;
    const { error } = await supabase.from("contracts").insert([payload]);
    setSaving(false);
    if (error) { alert("建立失敗：" + error.message); return; }
    setShowCreate(false);
    setForm({ title: "", pdf_data: "", pdf_name: "", tour_id: "", customer_id: "", notes: "" });
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  // ── 複製連結 ────────────────────────────────────────────────────────────

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/sign/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  // ── 查看合約 ────────────────────────────────────────────────────────────

  const openView = async (c: ContractListItem) => {
    setViewItem(c);
    setViewSig(null);
    setViewPdfUrl(null);
    setShowView(true);
    // Fetch signature + pdf_data
    const { data } = await supabase
      .from("contracts")
      .select("signature_image, pdf_data, pdf_name")
      .eq("id", c.id)
      .single();
    if (data?.signature_image) setViewSig(data.signature_image);
    if (data?.pdf_data) {
      try {
        let b64 = data.pdf_data as string;
        const ci = b64.indexOf(",");
        if (ci !== -1) b64 = b64.slice(ci + 1);
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([arr], { type: "application/pdf" }));
        setViewPdfUrl(url);
      } catch { /* ignore */ }
    }
  };

  const closeView = () => {
    setShowView(false);
    if (viewPdfUrl) { URL.revokeObjectURL(viewPdfUrl); setViewPdfUrl(null); }
    setViewItem(null);
    setViewSig(null);
  };

  // ── 刪除 ────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm("確定刪除此合約？此操作無法復原。")) return;
    const { error } = await supabase.from("contracts").delete().eq("id", id);
    if (error) { alert("刪除失敗：" + error.message); return; }
    setContracts(cs => cs.filter(c => c.id !== id));
  };

  // ── 篩選 ────────────────────────────────────────────────────────────────

  const filtered = contracts.filter(c => {
    const q = search.toLowerCase();
    const ok = !q || c.title.toLowerCase().includes(q)
      || (c.tour?.name || "").toLowerCase().includes(q)
      || (c.customer?.name || "").toLowerCase().includes(q)
      || c.signer_name.toLowerCase().includes(q);
    return ok && (filter === "all" || c.status === filter);
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <FilePen className="w-5 h-5 md:w-6 md:h-6 text-blue-600" /> 線上簽約
        </h1>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 md:px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">新增合約</span><span className="sm:hidden">新增</span>
        </button>
      </div>

      {/* SQL 建表提示 */}
      {tableErr && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-semibold text-sm">
            <AlertCircle className="w-4 h-4" /> 尚未建立 contracts 資料表
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400">請到 Supabase → SQL Editor 執行以下 SQL：</p>
          <button onClick={() => setShowSQL(s => !s)}
            className="text-xs text-amber-700 dark:text-amber-300 underline">
            {showSQL ? "收起" : "顯示 SQL"}
          </button>
          {showSQL && (
            <pre className="bg-amber-100 dark:bg-amber-900/40 rounded-lg p-3 text-xs text-amber-900 dark:text-amber-200 overflow-x-auto whitespace-pre-wrap break-all">
              {CREATE_SQL}
            </pre>
          )}
        </div>
      )}

      {/* Filter + Search */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm w-full sm:w-52 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-400"
            placeholder="搜尋標題、團名、旅客…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        {(["all", "pending", "signed"] as const).map(v => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === v
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}>
            {v === "all" ? "全部" : STATUS_LABEL[v]}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} 份</span>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 text-center py-12 text-slate-400 text-sm">
          {search || filter !== "all" ? "沒有符合的合約" : "尚無合約，點右上角「新增合約」"}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-2.5">
            {filtered.map(c => {
              const SIcon = STATUS_ICON[c.status as ContractStatus];
              return (
                <div key={c.id}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-800 dark:text-slate-100 leading-snug">{c.title}</p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 flex items-center gap-1 ${STATUS_COLOR[c.status as ContractStatus]}`}>
                      <SIcon className="w-2.5 h-2.5" /> {STATUS_LABEL[c.status as ContractStatus]}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                    {c.tour     && <p>✈️ {c.tour.name}</p>}
                    {c.customer && <p>👤 {c.customer.name}</p>}
                    {c.status === "signed" && c.signed_at && (
                      <p className="text-emerald-600 dark:text-emerald-400">✓ {c.signer_name} · {fmtDate(c.signed_at)}</p>
                    )}
                    <p className="text-slate-400 dark:text-slate-500">建立 {fmtDate(c.created_at)}</p>
                  </div>
                  <div className="flex gap-2 pt-1 flex-wrap">
                    <Link href={`/admin/contracts/${c.id}`}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-800/40 transition-colors">
                      <Settings2 className="w-3 h-3" /> 設定欄位
                    </Link>
                    <button onClick={() => copyLink(c.sign_token)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors">
                      {copied === c.sign_token ? <><CheckCircle2 className="w-3 h-3" /> 已複製</> : <><Copy className="w-3 h-3" /> 複製連結</>}
                    </button>
                    <button onClick={() => openView(c)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                      <Eye className="w-3 h-3" /> 查看
                    </button>
                    <button onClick={() => handleDelete(c.id)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-800/40 transition-colors ml-auto">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">合約標題</th>
                    <th className="px-4 py-3 text-left">對應團</th>
                    <th className="px-4 py-3 text-left">對應旅客</th>
                    <th className="px-4 py-3 text-left">狀態</th>
                    <th className="px-4 py-3 text-left">簽署人 / 時間</th>
                    <th className="px-4 py-3 text-left">建立時間</th>
                    <th className="px-4 py-3 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {filtered.map(c => {
                    const SIcon = STATUS_ICON[c.status as ContractStatus];
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 max-w-[200px] truncate">
                          {c.title}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {c.tour?.name || <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {c.customer?.name || <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status as ContractStatus]}`}>
                            <SIcon className="w-2.5 h-2.5" /> {STATUS_LABEL[c.status as ContractStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {c.status === "signed" ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {c.signer_name || "（未填）"}<br/>
                              <span className="text-slate-400 dark:text-slate-500">{fmtDate(c.signed_at)}</span>
                            </span>
                          ) : <span className="text-slate-300 dark:text-slate-600">尚未簽署</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                          {fmtDate(c.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <Link href={`/admin/contracts/${c.id}`} title="設定簽名欄位"
                              className="p-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-800/40 transition-colors">
                              <Settings2 className="w-4 h-4" />
                            </Link>
                            <button onClick={() => copyLink(c.sign_token)} title="複製簽署連結"
                              className={`p-1.5 rounded-lg transition-colors ${
                                copied === c.sign_token
                                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
                                  : "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-800/40"
                              }`}>
                              {copied === c.sign_token
                                ? <CheckCircle2 className="w-4 h-4" />
                                : <Copy className="w-4 h-4" />}
                            </button>
                            <button onClick={() => openView(c)} title="查看合約"
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors">
                              <Eye className="w-4 h-4" />
                            </button>
                            <a href={`/sign/${c.sign_token}`} target="_blank" rel="noopener" title="開啟簽署頁"
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <button onClick={() => handleDelete(c.id)} title="刪除合約"
                              className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-800/40 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── 新增合約 Modal ─────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">新增合約</h2>
              <button onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="合約標題 *">
                <input className={inp} value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="例：2025 日本 9 天出團同意書" />
              </Field>

              {/* PDF Upload */}
              <Field label="PDF 檔案 *">
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-colors ${
                    form.pdf_data
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20"
                      : "border-slate-200 dark:border-slate-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  }`}>
                  {pdfLoading ? (
                    <div className="flex items-center justify-center gap-2 text-slate-500">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">讀取中…</span>
                    </div>
                  ) : form.pdf_data ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-sm font-medium">{form.pdf_name}</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">點此上傳 PDF</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">最大 10MB</p>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="application/pdf"
                  onChange={handlePdfChange} className="hidden" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="對應出發團（選填）">
                  <select className={inp} value={form.tour_id}
                    onChange={e => setForm(f => ({ ...f, tour_id: e.target.value }))}>
                    <option value="">— 不對應 —</option>
                    {tours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
                <Field label="對應旅客（選填）">
                  <select className={inp} value={form.customer_id}
                    onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
                    <option value="">— 不對應 —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="備註（選填）">
                <textarea className={inp + " resize-none"} rows={2} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="給旅客看的說明文字…" />
              </Field>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                取消
              </button>
              <button onClick={handleCreate} disabled={saving || pdfLoading}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                {saving ? "建立中…" : "建立合約"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 查看 Modal ─────────────────────────────────────────────────────── */}
      {showView && viewItem && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate pr-4">
                {viewItem.title}
              </h2>
              <button onClick={closeView}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">狀態</p>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[viewItem.status as ContractStatus]}`}>
                    {STATUS_LABEL[viewItem.status as ContractStatus]}
                  </span>
                </div>
                {viewItem.tour && <div>
                  <p className="text-xs text-slate-400 mb-0.5">出發團</p>
                  <p className="text-slate-700 dark:text-slate-200">{viewItem.tour.name}</p>
                </div>}
                {viewItem.customer && <div>
                  <p className="text-xs text-slate-400 mb-0.5">對應旅客</p>
                  <p className="text-slate-700 dark:text-slate-200">{viewItem.customer.name}</p>
                </div>}
                {viewItem.status === "signed" && (
                  <>
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">簽署人</p>
                      <p className="text-slate-700 dark:text-slate-200 font-semibold">{viewItem.signer_name || "（未填）"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">簽署時間</p>
                      <p className="text-emerald-600 dark:text-emerald-400">{fmtDate(viewItem.signed_at)}</p>
                    </div>
                  </>
                )}
                <div className="col-span-2">
                  <p className="text-xs text-slate-400 mb-1">簽署連結</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded flex-1 truncate">
                      {typeof window !== "undefined" ? window.location.origin : ""}/sign/{viewItem.sign_token}
                    </code>
                    <button onClick={() => copyLink(viewItem.sign_token)}
                      className="shrink-0 p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-800/40 transition-colors">
                      {copied === viewItem.sign_token ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <a href={`/sign/${viewItem.sign_token}`} target="_blank" rel="noopener"
                      className="shrink-0 p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>

              {/* PDF Viewer */}
              {viewPdfUrl && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">合約 PDF</p>
                    <a href={viewPdfUrl} download={viewItem.pdf_name || "合約.pdf"}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Download className="w-3 h-3" /> 下載 PDF
                    </a>
                  </div>
                  <iframe src={viewPdfUrl} className="w-full rounded-xl border border-slate-200 dark:border-slate-600"
                    style={{ height: 420 }} title="合約 PDF" />
                </div>
              )}

              {/* Signature */}
              {viewItem.status === "signed" && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">手寫簽名</p>
                  {viewSig ? (
                    <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={viewSig} alt="簽名" className="w-full max-h-48 object-contain" />
                    </div>
                  ) : (
                    <div className="flex justify-center py-6 text-slate-400 text-sm">
                      <div className="w-5 h-5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
