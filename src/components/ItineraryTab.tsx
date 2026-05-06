"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  FileText, Globe, Upload, Save, X, ExternalLink, Loader2, CheckCircle2,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toEmbedUrl(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/docs\.google\.com\/document\/d\/(?:e\/)?([^/?#]+)/);
  if (!m) return raw;
  if (raw.includes("/d/e/")) {
    return `https://docs.google.com/document/d/e/${m[1]}/pub?embedded=true`;
  }
  return `https://docs.google.com/document/d/${m[1]}/preview`;
}

function b64ToBlobUrl(b64: string): string {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
}

// ── Component ─────────────────────────────────────────────────────────────────

type Mode = "doc" | "pdf";

interface ItinRecord {
  id: string;
  doc_url: string;
  pdf_name: string;
  pdf_data: string;
}

interface Props {
  tourId: string;
  variant: "customer" | "trade";
}

export default function ItineraryTab({ tourId, variant }: Props) {
  const [mode, setMode]           = useState<Mode>("doc");
  const [rec, setRec]             = useState<ItinRecord | null>(null);
  const [docInput, setDocInput]   = useState("");
  const [embedUrl, setEmbedUrl]   = useState("");
  const [pdfBlob, setPdfBlob]     = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved]         = useState(false);
  const blobRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current); }, []);

  // reset state when variant switches (same component, different prop)
  useEffect(() => {
    setRec(null);
    setDocInput(""); setEmbedUrl("");
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
    setPdfBlob(null);
    setMode("doc");
    load();
  }, [tourId, variant]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tour_itinerary")
      .select("id, doc_url, pdf_name, pdf_data")
      .eq("tour_id", tourId)
      .eq("variant", variant)
      .limit(1);

    const row = data?.[0] as ItinRecord | undefined;
    if (row) {
      setRec(row);
      setDocInput(row.doc_url || "");
      if (row.doc_url) setEmbedUrl(toEmbedUrl(row.doc_url));
      if (row.pdf_data) {
        const url = b64ToBlobUrl(row.pdf_data);
        blobRef.current = url;
        setPdfBlob(url);
        if (!row.doc_url) setMode("pdf");
      }
    }
    setLoading(false);
  };

  const upsert = async (patch: Partial<ItinRecord>) => {
    const payload = { tour_id: tourId, variant, ...patch };
    if (rec?.id) {
      await supabase.from("tour_itinerary").update(payload).eq("id", rec.id);
      setRec(prev => prev ? { ...prev, ...patch } : prev);
    } else {
      const { data } = await supabase
        .from("tour_itinerary").insert([payload]).select("id").single();
      if (data?.id) setRec({ id: data.id, doc_url: "", pdf_name: "", pdf_data: "", ...patch });
    }
  };

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800); };

  // ── Google Doc ──

  const applyDoc = async () => {
    const url = docInput.trim();
    if (!url) return;
    setSaving(true);
    setEmbedUrl(toEmbedUrl(url));
    await upsert({ doc_url: url });
    setSaving(false);
    flash();
  };

  const clearDoc = async () => {
    setDocInput(""); setEmbedUrl("");
    await upsert({ doc_url: "" });
  };

  // ── PDF ──

  const handlePdfSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { alert("請選擇 PDF 檔案"); return; }
    if (file.size > 12 * 1024 * 1024) { alert("PDF 超過 12MB，請先壓縮後再上傳"); return; }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      const b64 = (ev.target?.result as string).split(",")[1];
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      const url = b64ToBlobUrl(b64);
      blobRef.current = url;
      setPdfBlob(url);
      await upsert({ pdf_data: b64, pdf_name: file.name });
      setUploading(false);
      flash();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const removePdf = async () => {
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
    setPdfBlob(null);
    await upsert({ pdf_data: "", pdf_name: "" });
  };

  // ── Render ──

  if (loading) return (
    <div className="flex justify-center items-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );

  const hasDoc = !!(rec?.doc_url || embedUrl);
  const hasPdf = !!(rec?.pdf_name || pdfBlob);

  return (
    <div className="space-y-4">

      {/* Mode switcher */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["doc", "pdf"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${
              mode === m
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            }`}
          >
            {m === "doc" ? <Globe className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            {m === "doc" ? "Google Doc" : "PDF"}
            {((m === "doc" && hasDoc) || (m === "pdf" && hasPdf)) && (
              <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 ${
                mode === m ? "border-blue-600 bg-white" : "border-white dark:border-slate-800 bg-blue-500"
              }`} />
            )}
          </button>
        ))}
        {saved && (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> 已儲存
          </span>
        )}
      </div>

      {/* ── Google Doc mode ────────────────────────────────────────────────── */}
      {mode === "doc" && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Google Doc 連結</p>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="貼上 Google Doc 分享連結…"
                value={docInput}
                onChange={e => setDocInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyDoc()}
              />
              {embedUrl && (
                <button onClick={clearDoc} className="p-2 text-slate-300 hover:text-red-500 dark:hover:text-red-400 transition-colors" title="清除連結">
                  <X className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={applyDoc}
                disabled={saving || !docInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-40 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                套用
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
              請先將 Google Doc 分享設定為「知道連結的人可以查看」，再複製連結貼上
            </p>
          </div>

          {embedUrl ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">文件預覽</span>
                <a href={rec?.doc_url || docInput} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  <ExternalLink className="w-3.5 h-3.5" /> 在新視窗開啟
                </a>
              </div>
              <iframe
                src={embedUrl}
                className="w-full"
                style={{ height: "72vh" }}
                title="行程內容"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 py-20 text-center">
              <Globe className="w-10 h-10 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">尚未設定 Google Doc</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">貼上連結後點「套用」即可嵌入預覽</p>
            </div>
          )}
        </div>
      )}

      {/* ── PDF mode ───────────────────────────────────────────────────────── */}
      {mode === "pdf" && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {rec?.pdf_name ? (
                  <>
                    <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{rec.pdf_name}</span>
                    <button onClick={removePdf} className="p-0.5 text-slate-300 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0" title="移除 PDF">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <span className="text-sm text-slate-400 dark:text-slate-500">尚未上傳 PDF</span>
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm rounded-lg transition-colors disabled:opacity-50 shrink-0"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "上傳中…" : rec?.pdf_name ? "更換 PDF" : "上傳 PDF"}
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handlePdfSelect} />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">支援 PDF 格式，檔案大小上限 12MB，上傳後自動儲存</p>
          </div>

          {pdfBlob ? (
            <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
              <embed src={pdfBlob} type="application/pdf" className="w-full" style={{ height: "76vh" }} />
            </div>
          ) : (
            <div
              className="bg-white dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 py-20 text-center cursor-pointer hover:border-blue-300 dark:hover:border-blue-500 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <FileText className="w-10 h-10 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">點此上傳行程 PDF</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">或將 PDF 拖放到此處（最大 12MB）</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
