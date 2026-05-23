"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, Save, Stamp, PenLine, Pencil, FileText,
  Trash2, CheckCircle2, Upload, X, AlertCircle, Move, Star,
} from "lucide-react";
import Link from "next/link";

// ── 型別 ─────────────────────────────────────────────────────────────────────

export type ZoneType = "stamp_a" | "sig_a" | "sig_b" | "field";

export interface Zone {
  id: string;
  type: ZoneType;
  label: string;
  page: number;    // 1-indexed
  x: number;       // % 左 (0-100)
  y: number;       // % 上 (0-100)
  w: number;       // % 寬
  h: number;       // % 高
  preset_image?: string;  // base64（stamp_a, sig_a 用）
  preset_text?: string;   // 預設文字（field 用）
}

// ── 設定 ─────────────────────────────────────────────────────────────────────

export const ZONE_META: Record<ZoneType, {
  label: string; icon: React.ElementType;
  border: string; bg: string; text: string;
  w: number; h: number;
}> = {
  stamp_a: { label: "甲方印章", icon: Stamp,    border: "border-red-500",    bg: "bg-red-50/80",    text: "text-red-600",    w: 14, h: 14 },
  sig_a:   { label: "甲方簽名", icon: PenLine,  border: "border-orange-500", bg: "bg-orange-50/80", text: "text-orange-600", w: 22, h: 10 },
  sig_b:   { label: "乙方簽名", icon: Pencil,   border: "border-blue-500",   bg: "bg-blue-50/80",   text: "text-blue-600",   w: 26, h: 12 },
  field:   { label: "自訂欄位", icon: FileText, border: "border-green-500",  bg: "bg-green-50/80",  text: "text-green-600",  w: 30, h:  7 },
};

// ── 工具函式 ─────────────────────────────────────────────────────────────────

function compressImg(file: File, maxW = 500): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onerror = rej;
    reader.onload = () => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        const s = Math.min(1, maxW / img.width);
        const c = document.createElement("canvas");
        c.width = img.width * s; c.height = img.height * s;
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/png", 0.92));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ── 區塊 Overlay ──────────────────────────────────────────────────────────────

function ZoneBox({
  zone, selected, onClick, onDelete,
}: {
  zone: Zone; selected: boolean;
  onClick: () => void; onDelete: () => void;
}) {
  const meta = ZONE_META[zone.type];
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`absolute border-2 ${meta.border} ${meta.bg} rounded cursor-pointer transition-all ${
        selected ? "ring-2 ring-offset-1 ring-slate-700 shadow-lg" : "hover:shadow-md"
      }`}
      style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` }}
    >
      {/* 圖片（甲方） */}
      {zone.preset_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={zone.preset_image} alt="" className="w-full h-full object-contain pointer-events-none" />
      )}
      {/* 標籤 */}
      {!zone.preset_image && (
        <div className={`flex items-center justify-center h-full text-[11px] font-medium ${meta.text} pointer-events-none leading-tight px-1`}>
          {zone.label}
        </div>
      )}
      {/* 標籤 chip */}
      <div className={`absolute -top-5 left-0 text-[10px] px-1.5 py-0.5 rounded ${meta.border} ${meta.bg} ${meta.text} font-semibold whitespace-nowrap shadow-sm`}>
        {zone.label}
      </div>
      {/* 刪除 */}
      {selected && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-3 -right-3 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow hover:bg-red-600 z-10"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ── 主元件 ───────────────────────────────────────────────────────────────────

export default function ContractZoneEditor() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [title,      setTitle]      = useState("");
  const [zones,      setZones]      = useState<Zone[]>([]);
  const [numPages,   setNumPages]   = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [isTemplate, setIsTemplate] = useState(false);
  const [tplToggling, setTplToggling] = useState(false);

  // PDF rendering
  const canvasRefs  = useRef<(HTMLCanvasElement | null)[]>([]);
  const pdfDocRef   = useRef<unknown>(null);

  // 新增模式
  const [addType,   setAddType]   = useState<ZoneType | null>(null);
  const [addImage,  setAddImage]  = useState<string | null>(null);
  const [addLabel,  setAddLabel]  = useState("");
  const imgInputRef = useRef<HTMLInputElement>(null);

  // 選取
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = zones.find(z => z.id === selectedId) ?? null;

  // ── 載入合約 + PDF ─────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("contracts")
        .select("title, pdf_data, zones, is_template")
        .eq("id", id)
        .single();
      if (!data) { router.push("/admin/contracts"); return; }
      setTitle(data.title as string);
      setIsTemplate(!!(data as { is_template?: boolean }).is_template);
      const rawZones = data.zones;
      setZones(Array.isArray(rawZones) ? rawZones as Zone[] : []);
      setLoading(false);
      await renderPdf(data.pdf_data as string);
    })();
  }, [id, router]);

  const renderPdf = async (pdfDataUrl: string) => {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

    let b64 = pdfDataUrl;
    const ci = b64.indexOf(",");
    if (ci !== -1) b64 = b64.slice(ci + 1);
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);

    const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
    pdfDocRef.current = pdf;
    setNumPages(pdf.numPages);

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await (pdf as {getPage:(n:number)=>Promise<unknown>}).getPage(p);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vp   = (page as any).getViewport({ scale: 1.5 });
      // wait for canvas ref
      await new Promise<void>(r => setTimeout(r, 50));
      const canvas = canvasRefs.current[p - 1];
      if (canvas) {
        canvas.width  = vp.width;
        canvas.height = vp.height;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (page as any).render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      }
    }
  };

  // ── 放置區塊 ───────────────────────────────────────────────────────────────

  const handlePageClick = useCallback((e: React.MouseEvent<HTMLDivElement>, pageNum: number) => {
    if (!addType) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width)  * 100;
    const yPct = ((e.clientY - rect.top)  / rect.height) * 100;
    const meta = ZONE_META[addType];
    const z: Zone = {
      id:    crypto.randomUUID(),
      type:  addType,
      label: addLabel.trim() || meta.label,
      page:  pageNum,
      x: Math.max(0, Math.min(100 - meta.w, xPct - meta.w / 2)),
      y: Math.max(0, Math.min(100 - meta.h, yPct - meta.h / 2)),
      w: meta.w,
      h: meta.h,
      ...(addImage ? { preset_image: addImage } : {}),
    };
    setZones(prev => [...prev, z]);
    setSelectedId(z.id);
    setAddType(null);
    setAddImage(null);
    setAddLabel("");
  }, [addType, addImage, addLabel]);

  // ── 上傳印章/簽名圖 ────────────────────────────────────────────────────────

  const handleImgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImg(file, 500);
    setAddImage(compressed);
  };

  const updateZonePresetImg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImg(file, 500);
    setZones(prev => prev.map(z => z.id === selectedId ? { ...z, preset_image: compressed } : z));
  };

  // ── 儲存 ───────────────────────────────────────────────────────────────────

  const saveZones = async () => {
    setSaving(true);
    const { error } = await supabase.from("contracts").update({ zones }).eq("id", id);
    setSaving(false);
    if (error) { alert("儲存失敗：" + error.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // ── 設為公版 ───────────────────────────────────────────────────────────────

  const toggleTemplate = async () => {
    setTplToggling(true);
    const next = !isTemplate;
    const { error } = await supabase.from("contracts").update({ is_template: next }).eq("id", id);
    setTplToggling(false);
    if (error) { alert("更新失敗：" + error.message); return; }
    setIsTemplate(next);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">

      {/* ── 頂部 Bar ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0 z-20">
        <Link href="/admin/contracts" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400">設定簽名欄位</p>
          <p className="font-semibold text-slate-800 truncate text-sm">{title}</p>
        </div>
        <a href={`/sign/${id}`} target="_blank" rel="noopener"
          className="text-xs text-blue-600 hover:underline hidden sm:block">
          預覽簽署頁 ↗
        </a>
        {/* 設為公版 */}
        <button
          onClick={toggleTemplate}
          disabled={tplToggling}
          title={isTemplate ? "取消公版" : "設為公版"}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isTemplate
              ? "bg-amber-400 hover:bg-amber-500 text-white"
              : "bg-slate-100 hover:bg-slate-200 text-slate-600"
          }`}>
          <Star className={`w-4 h-4 ${isTemplate ? "fill-white" : ""}`} />
          <span className="hidden sm:inline">{isTemplate ? "公版" : "設為公版"}</span>
        </button>
        <button onClick={saveZones} disabled={saving}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            saved
              ? "bg-emerald-500 text-white"
              : "bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
          }`}>
          {saved ? <><CheckCircle2 className="w-4 h-4" /> 已儲存</> : saving ? "儲存中…" : <><Save className="w-4 h-4" /> 儲存</>}
        </button>
      </div>

      {/* ── 主體 ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── PDF 區域 ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {/* 放置提示 Banner */}
          {addType && (
            <div className="sticky top-0 z-10 bg-blue-600 text-white px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-lg mx-0">
              <Move className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">
                點擊 PDF 上要放置「{ZONE_META[addType].label}
                {addLabel ? `（${addLabel}）` : ""}」的位置
              </span>
              <button onClick={() => { setAddType(null); setAddImage(null); setAddLabel(""); }}
                className="ml-auto p-1 rounded-lg hover:bg-blue-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {numPages === 0 && (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
              PDF 載入中…
            </div>
          )}

          {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
            <div key={pageNum}>
              <p className="text-xs text-slate-400 mb-1.5 text-center">第 {pageNum} 頁</p>
              <div
                className={`relative shadow-md rounded-xl overflow-hidden bg-white ${
                  addType ? "cursor-crosshair ring-2 ring-blue-400 ring-offset-2" : ""
                }`}
                onClick={addType ? (e) => handlePageClick(e, pageNum) : undefined}
              >
                <canvas
                  ref={el => { canvasRefs.current[pageNum - 1] = el; }}
                  className="w-full"
                  style={{ display: "block" }}
                />
                {/* Zone overlays */}
                {zones.filter(z => z.page === pageNum).map(z => (
                  <ZoneBox
                    key={z.id}
                    zone={z}
                    selected={selectedId === z.id}
                    onClick={() => setSelectedId(z.id === selectedId ? null : z.id)}
                    onDelete={() => {
                      setZones(prev => prev.filter(x => x.id !== z.id));
                      setSelectedId(null);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── 右側控制面板 ── */}
        <div className="w-72 shrink-0 border-l border-slate-200 bg-white overflow-y-auto flex flex-col">

          {/* 新增區塊 */}
          <div className="p-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">新增區塊</p>
            <div className="space-y-2">
              {(["stamp_a", "sig_a", "sig_b", "field"] as ZoneType[]).map(type => {
                const meta   = ZONE_META[type];
                const Icon   = meta.icon;
                const active = addType === type;
                return (
                  <button
                    key={type}
                    onClick={() => {
                      if (active) { setAddType(null); setAddImage(null); setAddLabel(""); return; }
                      setAddType(type);
                      setAddLabel("");
                      setAddImage(null);
                      setSelectedId(null);
                      // For stamp/sig_a, open image upload
                      if (type === "stamp_a" || type === "sig_a") {
                        setTimeout(() => imgInputRef.current?.click(), 50);
                      }
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                      active
                        ? `${meta.border} ${meta.bg} ${meta.text}`
                        : "border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{meta.label}</span>
                    {active && <span className="ml-auto text-xs">點 PDF 放置 →</span>}
                  </button>
                );
              })}
            </div>

            {/* 自訂欄位 label 輸入 */}
            {addType === "field" && (
              <div className="mt-3">
                <label className="text-xs text-slate-500 font-medium block mb-1">欄位名稱</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="例：日期、地址、身分證…"
                  value={addLabel}
                  onChange={e => setAddLabel(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {/* 印章/簽名圖預覽 */}
            {(addType === "stamp_a" || addType === "sig_a") && (
              <div className="mt-3">
                {addImage ? (
                  <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={addImage} alt="" className="w-full max-h-24 object-contain p-2" />
                    <button
                      onClick={() => { setAddImage(null); imgInputRef.current && (imgInputRef.current.value = ""); }}
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-white/80 text-slate-500 hover:text-red-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => imgInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                    <Upload className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                    <p className="text-xs text-slate-400">上傳{addType === "stamp_a" ? "印章圖片" : "簽名圖片"}</p>
                    <p className="text-[10px] text-slate-300 mt-0.5">PNG 透明背景最佳</p>
                  </div>
                )}
              </div>
            )}

            <input ref={imgInputRef} type="file" accept="image/*" onChange={handleImgUpload} className="hidden" />
          </div>

          {/* 已設定區塊 */}
          <div className="p-4 flex-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              已設定區塊（{zones.length}）
            </p>

            {zones.length === 0 && (
              <div className="text-center py-6 text-slate-300 text-sm">
                <AlertCircle className="w-6 h-6 mx-auto mb-1 opacity-50" />
                尚無區塊<br/>
                <span className="text-xs">點上方按鈕後，在 PDF 上點擊放置</span>
              </div>
            )}

            <div className="space-y-2">
              {zones.map(z => {
                const meta = ZONE_META[z.type];
                const Icon = meta.icon;
                return (
                  <div
                    key={z.id}
                    onClick={() => setSelectedId(z.id === selectedId ? null : z.id)}
                    className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                      selectedId === z.id
                        ? `${meta.border} ${meta.bg}`
                        : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                    }`}>
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${meta.text}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{z.label}</p>
                      <p className="text-[10px] text-slate-400">
                        第 {z.page} 頁 · {z.x.toFixed(0)}%,{z.y.toFixed(0)}%
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setZones(prev => prev.filter(x => x.id !== z.id)); setSelectedId(null); }}
                      className="p-0.5 rounded text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* 選取後的詳細設定 */}
            {selected && (
              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <p className="text-xs font-semibold text-slate-600">選取的區塊設定</p>
                <div>
                  <label className="text-[10px] text-slate-400 font-medium block mb-1">標籤名稱</label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={selected.label}
                    onChange={e => setZones(prev => prev.map(z => z.id === selectedId ? { ...z, label: e.target.value } : z))}
                  />
                </div>
                {(selected.type === "stamp_a" || selected.type === "sig_a") && (
                  <div>
                    <label className="text-[10px] text-slate-400 font-medium block mb-1">圖片</label>
                    {selected.preset_image ? (
                      <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={selected.preset_image} alt="" className="w-full max-h-20 object-contain p-1" />
                        <button
                          onClick={() => {
                            const fi = document.createElement("input");
                            fi.type = "file"; fi.accept = "image/*";
                            fi.onchange = async (ev) => {
                              const f = (ev.target as HTMLInputElement).files?.[0];
                              if (f) { const c = await compressImg(f, 500); setZones(prev => prev.map(z => z.id === selectedId ? { ...z, preset_image: c } : z)); }
                            };
                            fi.click();
                          }}
                          className="absolute bottom-1 right-1 text-[10px] bg-white/90 text-blue-600 px-1.5 py-0.5 rounded shadow">
                          更換
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { const fi = document.createElement("input"); fi.type = "file"; fi.accept = "image/*"; fi.onchange = async (ev) => { const f = (ev.target as HTMLInputElement).files?.[0]; if (f) { const c = await compressImg(f, 500); setZones(prev => prev.map(z => z.id === selectedId ? { ...z, preset_image: c } : z)); } }; fi.click(); }}
                        className="w-full border border-dashed border-slate-200 rounded-lg py-2 text-xs text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                        上傳圖片
                      </button>
                    )}
                  </div>
                )}
                {selected.type === "field" && (
                  <div>
                    <label className="text-[10px] text-slate-400 font-medium block mb-1">預設文字（選填）</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="留空則由旅客填寫"
                      value={selected.preset_text || ""}
                      onChange={e => setZones(prev => prev.map(z => z.id === selectedId ? { ...z, preset_text: e.target.value } : z))}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 說明 */}
          <div className="px-4 pb-4 pt-2 border-t border-slate-100">
            <div className="text-[10px] text-slate-400 space-y-1 leading-relaxed">
              <p>🔴 <b>甲方印章</b>：預先蓋好印章，客戶看到時已有印章</p>
              <p>✒️ <b>甲方簽名</b>：預先放入您的簽名圖</p>
              <p>✍️ <b>乙方簽名</b>：客戶在手機上觸控簽名的位置</p>
              <p>📝 <b>自訂欄位</b>：客戶填寫文字的欄位</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
