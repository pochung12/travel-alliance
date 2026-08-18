"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  FileText, FileArchive, Globe, Upload, Save, X, ExternalLink, Loader2, CheckCircle2,
  Eye, Download, Trash2, StickyNote,
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

interface ItineraryAttachment {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  memo: string;
  created_at: string;
}

interface AttachmentPreview extends ItineraryAttachment {
  blob_url?: string;
  html?: string;
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
  const attachmentRef = useRef<HTMLInputElement>(null);
  const previewBlobRef = useRef<string | null>(null);
  const [attachments, setAttachments] = useState<ItineraryAttachment[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentLoadingId, setAttachmentLoadingId] = useState<string|null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview|null>(null);
  const [memoDrafts, setMemoDrafts] = useState<Record<string,string>>({});

  useEffect(() => () => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    if (previewBlobRef.current) URL.revokeObjectURL(previewBlobRef.current);
  }, []);

  // reset state when variant switches (same component, different prop)
  useEffect(() => {
    setRec(null);
    setDocInput(""); setEmbedUrl("");
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
    setPdfBlob(null);
    setMode("doc");
    setAttachments([]); setMemoDrafts({}); setAttachmentPreview(null);
    load();
  }, [tourId, variant]);

  const load = async () => {
    setLoading(true);
    const [{data},{data:attachmentRows,error:attachmentError}] = await Promise.all([
      supabase.from("tour_itinerary")
        .select("id, doc_url, pdf_name, pdf_data")
        .eq("tour_id", tourId).eq("variant", variant).limit(1),
      variant === "trade"
        ? supabase.from("tour_itinerary_attachments")
            .select("id,file_name,file_type,file_size,memo,created_at")
            .eq("tour_id",tourId).eq("variant",variant).order("created_at",{ascending:false})
        : Promise.resolve({data:[],error:null}),
    ]);

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
    if (!attachmentError) {
      const rows=(attachmentRows||[]) as ItineraryAttachment[];
      setAttachments(rows);
      setMemoDrafts(Object.fromEntries(rows.map(item=>[item.id,item.memo||""])));
    }
    setLoading(false);
  };

  const b64ToArrayBuffer = (base64:string) => {
    const binary=atob(base64);
    const bytes=new Uint8Array(binary.length);
    for(let index=0;index<binary.length;index++) bytes[index]=binary.charCodeAt(index);
    return bytes.buffer;
  };

  const sanitizeWordHtml = (html:string) => {
    const doc=new DOMParser().parseFromString(html,"text/html");
    doc.querySelectorAll("script,iframe,object,embed").forEach(node=>node.remove());
    doc.querySelectorAll("*").forEach(node=>Array.from(node.attributes).forEach(attr=>{
      if(attr.name.toLowerCase().startsWith("on")) node.removeAttribute(attr.name);
    }));
    return doc.body.innerHTML;
  };

  const handleAttachmentUpload = async (event:React.ChangeEvent<HTMLInputElement>) => {
    const files=Array.from(event.target.files||[]);
    event.target.value="";
    if(files.length===0) return;
    const invalid=files.find(file=>!(/\.pdf$/i.test(file.name)||/\.docx?$/i.test(file.name)));
    if(invalid) { alert(`「${invalid.name}」格式不支援，請上傳 PDF、DOCX 或 DOC。`); return; }
    const oversized=files.find(file=>file.size>8*1024*1024);
    if(oversized) { alert(`「${oversized.name}」超過 8MB，請先壓縮。`); return; }
    setAttachmentUploading(true);
    const payloads=await Promise.all(files.map(file=>new Promise<Record<string,unknown>>((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve({
        tour_id:tourId,variant,file_name:file.name,
        file_type:/\.pdf$/i.test(file.name)?"pdf":/\.docx$/i.test(file.name)?"docx":"doc",
        file_size:file.size,file_data:String(reader.result).split(",")[1],memo:"",
      });
      reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(file);
    })));
    const {data,error}=await supabase.from("tour_itinerary_attachments").insert(payloads)
      .select("id,file_name,file_type,file_size,memo,created_at");
    setAttachmentUploading(false);
    if(error) {
      alert(error.message.includes("tour_itinerary_attachments")
        ? "附件資料表尚未建立，請先執行 tour_itinerary_attachments_migration.sql。"
        : "上傳附件失敗："+error.message);
      return;
    }
    const rows=(data||[]) as ItineraryAttachment[];
    setAttachments(prev=>[...rows,...prev]);
    setMemoDrafts(prev=>({...prev,...Object.fromEntries(rows.map(item=>[item.id,""]))}));
    flash();
  };

  const saveAttachmentMemo = async (item:ItineraryAttachment) => {
    const memo=memoDrafts[item.id]||"";
    if(memo===item.memo) return;
    const {error}=await supabase.from("tour_itinerary_attachments").update({memo}).eq("id",item.id).eq("tour_id",tourId);
    if(error) { alert("儲存備忘失敗："+error.message); return; }
    setAttachments(prev=>prev.map(row=>row.id===item.id?{...row,memo}:row));
    flash();
  };

  const openAttachmentPreview = async (item:ItineraryAttachment) => {
    setAttachmentLoadingId(item.id);
    const {data,error}=await supabase.from("tour_itinerary_attachments")
      .select("file_data").eq("id",item.id).eq("tour_id",tourId).single();
    setAttachmentLoadingId(null);
    if(error||!data?.file_data) { alert("載入附件失敗："+(error?.message||"檔案內容不存在")); return; }
    if(previewBlobRef.current) { URL.revokeObjectURL(previewBlobRef.current); previewBlobRef.current=null; }
    if(item.file_type==="pdf") {
      const url=URL.createObjectURL(new Blob([b64ToArrayBuffer(data.file_data)],{type:"application/pdf"}));
      previewBlobRef.current=url;
      setAttachmentPreview({...item,blob_url:url});
    } else if(item.file_type==="docx") {
      try {
        const mammoth=await import("mammoth");
        const result=await mammoth.convertToHtml({arrayBuffer:b64ToArrayBuffer(data.file_data)});
        setAttachmentPreview({...item,html:sanitizeWordHtml(result.value)});
      } catch { alert("Word 預覽轉換失敗，請下載後查看原始檔案。"); }
    } else {
      alert("舊版 .doc 無法在瀏覽器內預覽，請使用下載功能查看；建議另存為 .docx。");
    }
  };

  const downloadAttachment = async (item:ItineraryAttachment) => {
    setAttachmentLoadingId(item.id);
    const {data,error}=await supabase.from("tour_itinerary_attachments")
      .select("file_data").eq("id",item.id).eq("tour_id",tourId).single();
    setAttachmentLoadingId(null);
    if(error||!data?.file_data) { alert("下載附件失敗："+(error?.message||"檔案內容不存在")); return; }
    const mime=item.file_type==="pdf"?"application/pdf":item.file_type==="docx"
      ?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":"application/msword";
    const url=URL.createObjectURL(new Blob([b64ToArrayBuffer(data.file_data)],{type:mime}));
    const link=document.createElement("a"); link.href=url; link.download=item.file_name; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

  const deleteAttachment = async (item:ItineraryAttachment) => {
    if(!confirm(`確定刪除附件「${item.file_name}」？`)) return;
    const {error}=await supabase.from("tour_itinerary_attachments").delete().eq("id",item.id).eq("tour_id",tourId);
    if(error) { alert("刪除附件失敗："+error.message); return; }
    setAttachments(prev=>prev.filter(row=>row.id!==item.id));
    setAttachmentPreview(prev=>prev?.id===item.id?null:prev);
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

      {variant === "trade" && (
        <section className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-slate-800 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-4 border-b border-amber-100 dark:border-amber-900/40">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"><FileArchive className="w-5 h-5" /></div>
              <div><h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">檔案備忘</h3><p className="text-[11px] text-slate-500 dark:text-slate-400">保存同業報價、行程版本及往來文件</p></div>
            </div>
            <button onClick={()=>attachmentRef.current?.click()} disabled={attachmentUploading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold disabled:opacity-50 shrink-0">
              {attachmentUploading?<Loader2 className="w-4 h-4 animate-spin"/>:<Upload className="w-4 h-4"/>}
              {attachmentUploading?"上傳中…":"上傳檔案"}
            </button>
            <input ref={attachmentRef} type="file" multiple accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handleAttachmentUpload}/>
          </div>
          {attachments.length===0 ? (
            <button onClick={()=>attachmentRef.current?.click()} className="w-full py-10 text-center text-slate-400 hover:bg-amber-50/60 dark:hover:bg-amber-950/20 transition-colors">
              <Upload className="w-7 h-7 mx-auto mb-2 opacity-50"/><span className="text-sm font-medium">尚無附件，點此上傳 Word 或 PDF</span><span className="block text-xs mt-1">每個檔案最大 8MB，檔案內容按預覽時才載入</span>
            </button>
          ) : (
            <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
              {attachments.map(item=><div key={item.id} className="p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex items-center gap-3 min-w-0 md:w-64">
                  <FileText className={`w-7 h-7 shrink-0 ${item.file_type==='pdf'?'text-red-500':'text-blue-600'}`}/>
                  <div className="min-w-0"><p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate" title={item.file_name}>{item.file_name}</p><p className="text-[10px] text-slate-400">{item.file_type.toUpperCase()} · {(item.file_size/1024/1024).toFixed(2)} MB · {new Date(item.created_at).toLocaleDateString("zh-TW")}</p></div>
                </div>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <StickyNote className="w-4 h-4 text-amber-500 shrink-0"/>
                  <input value={memoDrafts[item.id]||""} onChange={event=>setMemoDrafts(prev=>({...prev,[item.id]:event.target.value}))}
                    onBlur={()=>saveAttachmentMemo(item)} onKeyDown={event=>event.key==="Enter"&&event.currentTarget.blur()}
                    placeholder="輸入這份檔案的備忘…" className="w-full bg-white/70 dark:bg-slate-700/70 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                </div>
                <div className="flex items-center gap-1 justify-end shrink-0">
                  <button onClick={()=>openAttachmentPreview(item)} disabled={attachmentLoadingId===item.id||item.file_type==='doc'} title="預覽" className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-30">{attachmentLoadingId===item.id?<Loader2 className="w-4 h-4 animate-spin"/>:<Eye className="w-4 h-4"/>}</button>
                  <button onClick={()=>downloadAttachment(item)} disabled={attachmentLoadingId===item.id} title="下載" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"><Download className="w-4 h-4"/></button>
                  <button onClick={()=>deleteAttachment(item)} title="刪除" className="p-2 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"><Trash2 className="w-4 h-4"/></button>
                </div>
              </div>)}
            </div>
          )}
        </section>
      )}

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

      {attachmentPreview && (
        <div className="fixed inset-0 z-50 bg-black/70 p-2 md:p-6 flex items-center justify-center" onClick={()=>setAttachmentPreview(null)}>
          <div className="w-full max-w-6xl h-[94vh] bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col" onClick={event=>event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <div className="min-w-0"><p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{attachmentPreview.file_name}</p>{attachmentPreview.memo&&<p className="text-xs text-amber-600 truncate">{attachmentPreview.memo}</p>}</div>
              <div className="flex gap-1"><button onClick={()=>downloadAttachment(attachmentPreview)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Download className="w-5 h-5"/></button><button onClick={()=>setAttachmentPreview(null)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5"/></button></div>
            </div>
            <div className="flex-1 min-h-0 bg-slate-100 dark:bg-slate-950 overflow-auto">
              {attachmentPreview.blob_url?<embed src={attachmentPreview.blob_url} type="application/pdf" className="w-full h-full"/>:<article className="max-w-4xl mx-auto my-4 md:my-8 bg-white text-slate-900 min-h-full p-6 md:p-12 shadow prose prose-slate" dangerouslySetInnerHTML={{__html:attachmentPreview.html||""}}/>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
