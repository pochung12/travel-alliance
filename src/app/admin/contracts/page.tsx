"use client";
import { useEffect, useState, useRef } from "react";
import { supabase, Tour, Customer, Contract, ContractStatus } from "@/lib/supabase";
import {
  Plus, Search, FilePen, Copy, Eye, Trash2,
  CheckCircle2, Clock, X, Upload, ExternalLink,
  Download, AlertCircle, Settings2, Star, Send, Mail, MessageCircle,
} from "lucide-react";
import Link from "next/link";
import type { Zone } from "@/app/admin/contracts/[id]/page";

// ── 類型 ─────────────────────────────────────────────────────────────────────

type ContractListItem = Omit<Contract, "pdf_data"> & {
  is_template: boolean;
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

// ── 工具函式 ──────────────────────────────────────────────────────────────────

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
  zones JSONB NOT NULL DEFAULT '[]',
  zone_responses JSONB,
  is_template BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);`;

// ── 主元件 ───────────────────────────────────────────────────────────────────

type FilterType = ContractStatus | "all" | "template";

export default function ContractsPage() {
  const [contracts,  setContracts]  = useState<ContractListItem[]>([]);
  const [tours,      setTours]      = useState<Pick<Tour, "id" | "name">[]>([]);
  const [customers,  setCustomers]  = useState<Pick<Customer, "id" | "name">[]>([]);
  const [filter,     setFilter]     = useState<FilterType>("all");
  const [search,     setSearch]     = useState("");
  const [loading,    setLoading]    = useState(true);
  const [tableErr,   setTableErr]   = useState(false);
  const [showSQL,    setShowSQL]    = useState(false);
  const [copied,     setCopied]     = useState<string | null>(null);

  // ── 建立 Modal ──
  const [showCreate,  setShowCreate]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const [form, setForm] = useState({
    title: "", pdf_data: "", pdf_name: "", tour_id: "", customer_id: "", notes: "",
  });
  const [formZones,   setFormZones]   = useState<Zone[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── 公版選擇 ──
  const [selectedTplId, setSelectedTplId] = useState<string | null>(null);
  const [tplLoading,    setTplLoading]    = useState(false);

  // ── 發送 Modal ──
  const [sendTarget,   setSendTarget]   = useState<ContractListItem | null>(null);
  const [sendCopied,   setSendCopied]   = useState(false);

  // ── 查看 Modal ──
  const [showView,     setShowView]     = useState(false);
  const [viewItem,     setViewItem]     = useState<ContractListItem | null>(null);
  const [viewSig,      setViewSig]      = useState<string | null>(null);
  const [viewPdfUrl,   setViewPdfUrl]   = useState<string | null>(null);

  // ── 公版列表（from contracts state）──
  const templates = contracts.filter(c => c.is_template);

  // ── 載入 ─────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    const [{ data: cData, error: cErr }, { data: tData }, { data: cuData }] = await Promise.all([
      supabase.from("contracts")
        .select("id,title,pdf_name,status,sign_token,signed_at,signer_name,notes,created_at,is_template,tour_id,customer_id,tour:tours(name),customer:customers(name)")
        .order("is_template", { ascending: false })  // 公版排最前
        .order("created_at", { ascending: false }),
      supabase.from("tours").select("id,name").order("start_date", { ascending: false }),
      supabase.from("customers").select("id,name").order("name"),
    ]);
    if (cErr) {
      if (cErr.message?.includes("does not exist") || cErr.message?.includes("relation")) setTableErr(true);
    }
    setContracts((cData || []) as unknown as ContractListItem[]);
    setTours(tData || []);
    setCustomers(cuData || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── 切換公版 ────────────────────────────────────────────────────────────

  const toggleTemplate = async (id: string, toTemplate: boolean) => {
    const { error } = await supabase.from("contracts").update({ is_template: toTemplate }).eq("id", id);
    if (error) { alert("更新失敗：" + error.message); return; }
    setContracts(cs => cs.map(c => c.id === id ? { ...c, is_template: toTemplate } : c));
  };

  // ── 從公版建立：載入 pdf_data + zones ──────────────────────────────────

  const applyTemplate = async (tplId: string) => {
    if (tplId === selectedTplId) {
      // 取消選擇
      setSelectedTplId(null);
      setForm(f => ({ ...f, pdf_data: "", pdf_name: "" }));
      setFormZones([]);
      return;
    }
    setTplLoading(true);
    setSelectedTplId(tplId);
    const { data } = await supabase.from("contracts")
      .select("pdf_data, pdf_name, zones, title")
      .eq("id", tplId).single();
    setTplLoading(false);
    if (!data) return;
    setForm(f => ({
      ...f,
      pdf_data: data.pdf_data as string,
      pdf_name: data.pdf_name as string,
      // pre-fill title only if current title is empty
      ...(f.title ? {} : { title: data.title as string }),
    }));
    setFormZones(Array.isArray(data.zones) ? data.zones as Zone[] : []);
  };

  // ── PDF 上傳 ─────────────────────────────────────────────────────────────

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { alert("請選擇 PDF 檔案"); return; }
    if (file.size > 10 * 1024 * 1024) { alert("PDF 不可超過 10MB"); return; }
    setPdfLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setForm(f => ({ ...f, pdf_data: reader.result as string, pdf_name: file.name }));
      setPdfLoading(false);
      // 上傳新 PDF 後，取消公版關聯
      setSelectedTplId(null);
    };
    reader.readAsDataURL(file);
  };

  // ── 建立合約 ─────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.title.trim()) { alert("請填寫合約標題"); return; }
    if (!form.pdf_data)     { alert("請上傳 PDF 或選擇公版"); return; }
    setSaving(true);
    const payload: Record<string, unknown> = {
      title:    form.title.trim(),
      pdf_data: form.pdf_data,
      pdf_name: form.pdf_name,
      notes:    form.notes,
      zones:    formZones,
    };
    if (form.tour_id)     payload.tour_id     = form.tour_id;
    if (form.customer_id) payload.customer_id = form.customer_id;
    const { error } = await supabase.from("contracts").insert([payload]);
    setSaving(false);
    if (error) { alert("建立失敗：" + error.message); return; }
    setShowCreate(false);
    setForm({ title: "", pdf_data: "", pdf_name: "", tour_id: "", customer_id: "", notes: "" });
    setFormZones([]);
    setSelectedTplId(null);
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  // ── 複製連結 ─────────────────────────────────────────────────────────────

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/sign/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  // ── 發送連結 / 文案 ──────────────────────────────────────────────────────

  const getSignUrl  = (token: string) => `${window.location.origin}/sign/${token}`;

  const buildEmailHref = (c: ContractListItem) => {
    const signUrl = getSignUrl(c.sign_token);
    const subject = encodeURIComponent(`【暖心旅行社】合約簽署通知 ─《${c.title}》`);
    const body    = encodeURIComponent(
      `您好！\n\n暖心旅行社已為您準備好合約，請點擊以下連結，使用手機即可完成線上電子簽名：\n\n🔗 簽署連結：\n${signUrl}\n\n操作說明：\n1. 點擊上方連結\n2. 閱讀合約內容\n3. 在指定位置用手指完成簽名\n4. 點擊「確認簽署」送出\n\n如有任何問題，歡迎與我們聯繫。\n\n暖心旅行社 敬上`
    );
    return `mailto:?subject=${subject}&body=${body}`;
  };

  const buildLineHref = (c: ContractListItem) => {
    const signUrl = getSignUrl(c.sign_token);
    const text = encodeURIComponent(
      `您好！📋\n\n暖心旅行社的合約《${c.title}》已準備好，請點擊連結在手機上完成電子簽名 ✍️\n\n${signUrl}\n\n操作很簡單，點進去用手指畫一畫就完成了！\n有問題歡迎告知 🙏`
    );
    return `https://line.me/R/share?text=${text}`;
  };

  // ── 查看合約 ─────────────────────────────────────────────────────────────

  const openView = async (c: ContractListItem) => {
    setViewItem(c);
    setViewSig(null);
    setViewPdfUrl(null);
    setShowView(true);
    const { data } = await supabase.from("contracts").select("signature_image,pdf_data,pdf_name").eq("id", c.id).single();
    if (data?.signature_image) setViewSig(data.signature_image as string);
    if (data?.pdf_data) {
      try {
        let b64 = data.pdf_data as string;
        const ci = b64.indexOf(","); if (ci !== -1) b64 = b64.slice(ci + 1);
        const bin = atob(b64); const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        setViewPdfUrl(URL.createObjectURL(new Blob([arr], { type: "application/pdf" })));
      } catch { /* ignore */ }
    }
  };

  const closeView = () => {
    setShowView(false);
    if (viewPdfUrl) { URL.revokeObjectURL(viewPdfUrl); setViewPdfUrl(null); }
    setViewItem(null); setViewSig(null);
  };

  // ── 刪除 ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm("確定刪除此合約？此操作無法復原。")) return;
    const { error } = await supabase.from("contracts").delete().eq("id", id);
    if (error) { alert("刪除失敗：" + error.message); return; }
    setContracts(cs => cs.filter(c => c.id !== id));
  };

  // ── 篩選 ─────────────────────────────────────────────────────────────────

  const filtered = contracts.filter(c => {
    const q = search.toLowerCase();
    const ok = !q || c.title.toLowerCase().includes(q)
      || (c.tour?.name || "").toLowerCase().includes(q)
      || (c.customer?.name || "").toLowerCase().includes(q)
      || c.signer_name.toLowerCase().includes(q);
    if (!ok) return false;
    if (filter === "template") return c.is_template;
    if (filter === "all")      return true;
    return c.status === filter;
  });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <FilePen className="w-5 h-5 md:w-6 md:h-6 text-blue-600" /> 線上簽約
        </h1>
        <button onClick={() => { setSelectedTplId(null); setFormZones([]); setForm({ title:"",pdf_data:"",pdf_name:"",tour_id:"",customer_id:"",notes:"" }); setShowCreate(true); }}
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
          <p className="text-xs text-amber-600 dark:text-amber-400">請到 Supabase → SQL Editor 執行：</p>
          <button onClick={() => setShowSQL(s => !s)} className="text-xs text-amber-700 dark:text-amber-300 underline">
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
        {([
          ["all",      "全部"],
          ["pending",  "待簽署"],
          ["signed",   "已簽署"],
          ["template", "⭐ 公版"],
        ] as const).map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v as FilterType)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === v
                ? v === "template"
                  ? "bg-amber-500 text-white"
                  : "bg-blue-600 text-white"
                : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}>
            {l}
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
                  className={`bg-white dark:bg-slate-800 rounded-xl border shadow-sm p-4 space-y-2 ${
                    c.is_template
                      ? "border-amber-200 dark:border-amber-700"
                      : "border-slate-100 dark:border-slate-700"
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {c.is_template && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
                      <p className="font-semibold text-slate-800 dark:text-slate-100 leading-snug truncate">{c.title}</p>
                    </div>
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
                  </div>
                  <div className="flex gap-1.5 pt-1 flex-wrap">
                    <button
                      onClick={() => toggleTemplate(c.id, !c.is_template)}
                      title={c.is_template ? "取消公版" : "設為公版"}
                      className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg transition-colors ${
                        c.is_template
                          ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 hover:bg-amber-200"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-amber-50 hover:text-amber-500"
                      }`}>
                      <Star className={`w-3 h-3 ${c.is_template ? "fill-amber-400" : ""}`} />
                      {c.is_template ? "公版" : "設為公版"}
                    </button>
                    <Link href={`/admin/contracts/${c.id}`}
                      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 transition-colors">
                      <Settings2 className="w-3 h-3" /> 設定
                    </Link>
                    <button onClick={() => copyLink(c.sign_token)}
                      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors">
                      {copied === c.sign_token ? <><CheckCircle2 className="w-3 h-3" /> 已複製</> : <><Copy className="w-3 h-3" /> 連結</>}
                    </button>
                    <button onClick={() => { setSendCopied(false); setSendTarget(c); }}
                      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition-colors">
                      <Send className="w-3 h-3" /> 發送
                    </button>
                    <button onClick={() => openView(c)}
                      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 hover:bg-slate-200 transition-colors">
                      <Eye className="w-3 h-3" /> 查看
                    </button>
                    <button onClick={() => handleDelete(c.id)}
                      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 transition-colors ml-auto">
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
                    <th className="px-4 py-3 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {filtered.map(c => {
                    const SIcon = STATUS_ICON[c.status as ContractStatus];
                    return (
                      <tr key={c.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${
                        c.is_template ? "bg-amber-50/40 dark:bg-amber-900/10" : ""
                      }`}>
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="flex items-center gap-1.5">
                            {c.is_template && (
                              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                            )}
                            <span className="font-medium text-slate-800 dark:text-slate-100 truncate">{c.title}</span>
                          </div>
                          {c.is_template && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">公版</span>
                          )}
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
                          {c.status === "signed"
                            ? <span className="text-emerald-600 dark:text-emerald-400">{c.signer_name || "（未填）"}<br/><span className="text-slate-400">{fmtDate(c.signed_at)}</span></span>
                            : <span className="text-slate-300 dark:text-slate-600">尚未簽署</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {/* 公版 toggle */}
                            <button
                              onClick={() => toggleTemplate(c.id, !c.is_template)}
                              title={c.is_template ? "取消公版" : "設為公版"}
                              className={`p-1.5 rounded-lg transition-colors ${
                                c.is_template
                                  ? "bg-amber-100 text-amber-500 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-400"
                                  : "bg-slate-100 text-slate-400 hover:bg-amber-50 hover:text-amber-400 dark:bg-slate-700 dark:text-slate-500"
                              }`}>
                              <Star className={`w-4 h-4 ${c.is_template ? "fill-amber-400" : ""}`} />
                            </button>
                            {/* 設定欄位 */}
                            <Link href={`/admin/contracts/${c.id}`} title="設定簽名欄位"
                              className="p-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-800/40 transition-colors">
                              <Settings2 className="w-4 h-4" />
                            </Link>
                            {/* 複製連結 */}
                            <button onClick={() => copyLink(c.sign_token)} title="複製簽署連結"
                              className={`p-1.5 rounded-lg transition-colors ${
                                copied === c.sign_token
                                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
                                  : "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400"
                              }`}>
                              {copied === c.sign_token ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                            {/* 發送合約 */}
                            <button onClick={() => { setSendCopied(false); setSendTarget(c); }} title="發送合約"
                              className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 transition-colors">
                              <Send className="w-4 h-4" />
                            </button>
                            {/* 查看 */}
                            <button onClick={() => openView(c)} title="查看合約"
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors">
                              <Eye className="w-4 h-4" />
                            </button>
                            {/* 另開 */}
                            <a href={`/sign/${c.sign_token}`} target="_blank" rel="noopener" title="開啟簽署頁"
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            {/* 刪除 */}
                            <button onClick={() => handleDelete(c.id)} title="刪除合約"
                              className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 transition-colors">
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

      {/* ══ 新增合約 Modal ══════════════════════════════════════════════════ */}
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
            <div className="px-6 py-5 space-y-5">

              {/* ── 公版選擇 ── */}
              {templates.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> 從公版建立
                    <span className="font-normal text-slate-400 normal-case tracking-normal">（自動帶入 PDF 及簽名區塊設定）</span>
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {templates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t.id)}
                        disabled={tplLoading}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-all ${
                          selectedTplId === t.id
                            ? "border-amber-400 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 shadow-sm"
                            : "border-slate-200 dark:border-slate-600 hover:border-amber-300 hover:bg-amber-50/50 dark:hover:bg-amber-900/20 text-slate-600 dark:text-slate-300"
                        }`}>
                        <Star className={`w-3.5 h-3.5 ${selectedTplId === t.id ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                        <span className="max-w-[120px] truncate">{t.title}</span>
                        {selectedTplId === t.id && <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      </button>
                    ))}
                  </div>
                  {tplLoading && (
                    <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                      <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin inline-block" />
                      載入公版中…
                    </p>
                  )}
                  {selectedTplId && !tplLoading && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      已套用公版 PDF 及 {formZones.length} 個簽名區塊設定
                    </p>
                  )}
                  <div className="border-t border-slate-100 dark:border-slate-700 mt-3" />
                </div>
              )}

              {/* ── 基本資料 ── */}
              <Field label="合約標題 *">
                <input className={inp} value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="例：2025 日本 9 天出團同意書" />
              </Field>

              {/* PDF 上傳 */}
              <Field label={selectedTplId ? "PDF 檔案（已從公版帶入，可重新上傳覆蓋）" : "PDF 檔案 *"}>
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl px-4 py-4 text-center cursor-pointer transition-colors ${
                    form.pdf_data
                      ? selectedTplId
                        ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20"
                        : "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20"
                      : "border-slate-200 dark:border-slate-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  }`}>
                  {pdfLoading ? (
                    <div className="flex items-center justify-center gap-2 text-slate-500">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">讀取中…</span>
                    </div>
                  ) : form.pdf_data ? (
                    <div className="flex items-center justify-center gap-2">
                      {selectedTplId
                        ? <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                        : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{form.pdf_name}</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">點此上傳 PDF（最大 10MB）</p>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="application/pdf" onChange={handlePdfChange} className="hidden" />
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

      {/* ══ 查看 Modal ══════════════════════════════════════════════════════ */}
      {showView && viewItem && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate pr-4 flex items-center gap-2">
                {viewItem.is_template && <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />}
                {viewItem.title}
              </h2>
              <button onClick={closeView}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">狀態</p>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[viewItem.status as ContractStatus]}`}>
                    {STATUS_LABEL[viewItem.status as ContractStatus]}
                  </span>
                  {viewItem.is_template && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 font-medium">
                      <Star className="w-2.5 h-2.5 fill-amber-400" /> 公版
                    </span>
                  )}
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
                    <div><p className="text-xs text-slate-400 mb-0.5">簽署人</p><p className="text-slate-700 dark:text-slate-200 font-semibold">{viewItem.signer_name || "（未填）"}</p></div>
                    <div><p className="text-xs text-slate-400 mb-0.5">簽署時間</p><p className="text-emerald-600 dark:text-emerald-400">{fmtDate(viewItem.signed_at)}</p></div>
                  </>
                )}
                <div className="col-span-2">
                  <p className="text-xs text-slate-400 mb-1">簽署連結</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded flex-1 truncate">
                      {typeof window !== "undefined" ? window.location.origin : ""}/sign/{viewItem.sign_token}
                    </code>
                    <button onClick={() => copyLink(viewItem.sign_token)}
                      className="shrink-0 p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 transition-colors">
                      {copied === viewItem.sign_token ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <a href={`/sign/${viewItem.sign_token}`} target="_blank" rel="noopener"
                      className="shrink-0 p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 transition-colors">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
              {viewPdfUrl && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">合約 PDF</p>
                    <a href={viewPdfUrl} download={viewItem.pdf_name || "合約.pdf"}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Download className="w-3 h-3" /> 下載
                    </a>
                  </div>
                  <iframe src={viewPdfUrl} className="w-full rounded-xl border border-slate-200 dark:border-slate-600" style={{ height: 400 }} title="合約 PDF" />
                </div>
              )}
              {viewItem.status === "signed" && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">手寫簽名</p>
                  {viewSig
                    ? <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={viewSig} alt="簽名" className="w-full max-h-48 object-contain" />
                      </div>
                    : <div className="flex justify-center py-6 text-slate-400 text-sm">
                        <div className="w-5 h-5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                      </div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ 發送合約 Modal ═══════════════════════════════════════════════════ */}
      {sendTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-500" /> 發送合約
              </h2>
              <button onClick={() => setSendTarget(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* 合約名稱 */}
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">📋 {sendTarget.title}</p>

              {/* 簽署連結 */}
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold block mb-1.5">簽署連結</label>
                <div className="flex gap-2">
                  <input readOnly
                    value={getSignUrl(sendTarget.sign_token)}
                    className="flex-1 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700 focus:outline-none truncate"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(getSignUrl(sendTarget.sign_token));
                      setSendCopied(true);
                      setTimeout(() => setSendCopied(false), 2000);
                    }}
                    className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 transition-colors ${
                      sendCopied
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400"
                    }`}>
                    <Copy className="w-3.5 h-3.5" />
                    {sendCopied ? "已複製" : "複製"}
                  </button>
                </div>
              </div>

              {/* 預設文案 */}
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold block mb-1.5">📝 預設文案（可自行修改後發送）</label>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-28 overflow-y-auto border border-slate-100 dark:border-slate-600 select-all">
                  {`您好！\n\n暖心旅行社已為您準備好合約，請點擊連結，用手機即可完成線上電子簽名 ✍️\n\n${getSignUrl(sendTarget.sign_token)}\n\n操作簡單：開啟連結 → 閱讀合約 → 手指簽名 → 送出\n\n如有疑問歡迎聯繫，謝謝！\n\n暖心旅行社`}
                </div>
              </div>

              {/* 發送按鈕 */}
              <div className="space-y-2.5 pt-1">
                <a href={buildEmailHref(sendTarget)} target="_blank" rel="noopener"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors">
                  <Mail className="w-4 h-4" /> 發送合約信件（Email）
                </a>
                <a href={buildLineHref(sendTarget)} target="_blank" rel="noopener"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#06C755] hover:bg-green-600 text-white font-semibold text-sm transition-colors">
                  <MessageCircle className="w-4 h-4" /> 用 LINE 發送
                </a>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
                已簽署的合約仍可分享連結查看，但客戶無法重新簽署
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
