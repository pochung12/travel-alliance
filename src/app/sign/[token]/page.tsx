"use client";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Globe, CheckCircle2, AlertCircle, RotateCcw,
  Loader2, Pen, Download, X,
} from "lucide-react";
import type { Zone } from "@/app/admin/contracts/[id]/page";
import { ZONE_META } from "@/app/admin/contracts/[id]/page";

// ── 型別 ─────────────────────────────────────────────────────────────────────

interface SignContract {
  id: string;
  title: string;
  pdf_data: string;
  pdf_name: string;
  status: string;
  signed_at: string | null;
  signer_name: string;
  notes: string;
  zones: Zone[];
  tour: { name: string; destination?: string } | null;
  customer: { name: string } | null;
}

// ── 主頁面 ────────────────────────────────────────────────────────────────────

type PageState = "loading" | "pending" | "signed" | "error";

export default function SignPage() {
  const { token } = useParams<{ token: string }>();

  const [pageState,     setPageState]     = useState<PageState>("loading");
  const [contract,      setContract]      = useState<SignContract | null>(null);
  const [signerName,    setSignerName]    = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [errMsg,        setErrMsg]        = useState("");

  // PDF 渲染狀態
  const [numPages,    setNumPages]    = useState(0);
  const [pdfReady,    setPdfReady]    = useState(false);
  const canvasRefs   = useRef<(HTMLCanvasElement | null)[]>([]);
  const pdfDocRef    = useRef<unknown>(null);

  // 簽名 canvas (for zones-less mode)
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawing      = useRef(false);
  const lastPos      = useRef<{x: number; y: number} | null>(null);
  const hasDrawn     = useRef(false);
  const onDrawRef    = useRef<(d: string | null) => void>(() => {});
  const [mainSig,    setMainSig]     = useState<string | null>(null);

  // Zone 簽名：per-zone 狀態
  const [zoneSigs,    setZoneSigs]   = useState<Record<string, string>>({}); // zoneId → base64
  const [zoneFields,  setZoneFields] = useState<Record<string, string>>({}); // zoneId → text
  // 彈出 sig canvas（點擊 sig_b zone）
  const [sigModal,    setSigModal]   = useState<string | null>(null); // zoneId
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const modalDrawing   = useRef(false);
  const modalLastPos   = useRef<{x: number; y: number} | null>(null);
  const modalHasDrawn  = useRef(false);
  const [modalSigTemp, setModalSigTemp] = useState<string | null>(null);

  const hasZones = (contract?.zones?.length ?? 0) > 0;
  const sigBZones = (contract?.zones ?? []).filter(z => z.type === "sig_b");

  // ── 舊版 PDF blob URL (iframe，無 zones 時使用) ───────────────────────────

  const pdfBlobUrl = useMemo(() => {
    if (!contract?.pdf_data || hasZones) return null;
    try {
      let b64 = contract.pdf_data;
      const ci = b64.indexOf(",");
      if (ci !== -1) b64 = b64.slice(ci + 1);
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([arr], { type: "application/pdf" }));
    } catch { return null; }
  }, [contract?.pdf_data, hasZones]);

  useEffect(() => {
    return () => { if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl); };
  }, [pdfBlobUrl]);

  // ── 載入合約 ───────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id,title,pdf_data,pdf_name,status,signed_at,signer_name,notes,zones,tour:tours(name,destination),customer:customers(name)")
        .eq("sign_token", token)
        .single();
      if (error || !data) {
        setPageState("error");
        setErrMsg("找不到此合約，連結可能已失效");
        return;
      }
      const c = data as unknown as SignContract;
      setContract(c);
      if (c.signer_name) setSignerName(c.signer_name);
      // Pre-fill field zones with preset_text
      if (Array.isArray(c.zones)) {
        const fv: Record<string, string> = {};
        c.zones.forEach((z: Zone) => { if (z.type === "field" && z.preset_text) fv[z.id] = z.preset_text; });
        setZoneFields(fv);
      }
      if (c.status === "signed") { setPageState("signed"); return; }
      setPageState("pending");
      if ((c.zones?.length ?? 0) > 0) {
        await renderPdfWithPdfjs(c.pdf_data);
      }
    })();
  }, [token]);

  const renderPdfWithPdfjs = async (pdfDataUrl: string) => {
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

    // Render page by page
    for (let p = 1; p <= pdf.numPages; p++) {
      await new Promise<void>(r => setTimeout(r, 80));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const page = await (pdf as any).getPage(p);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vp   = (page as any).getViewport({ scale: 1.5 });
      const canvas = canvasRefs.current[p - 1];
      if (canvas) {
        canvas.width  = vp.width;
        canvas.height = vp.height;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (page as any).render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      }
    }
    setPdfReady(true);
  };

  // ── 舊版簽名 Canvas 設定（無 zones 時） ────────────────────────────────────

  const setupSigCanvas = useCallback(() => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2.8;
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    const getPos = (e: TouchEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const t = (e as TouchEvent).touches?.[0];
      return {
        x: ((t ? t.clientX : (e as MouseEvent).clientX) - rect.left) * (canvas.width  / rect.width),
        y: ((t ? t.clientY : (e as MouseEvent).clientY) - rect.top)  * (canvas.height / rect.height),
      };
    };
    const start = (e: TouchEvent | MouseEvent) => { e.preventDefault(); drawing.current = true; lastPos.current = getPos(e); };
    const move  = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      if (!drawing.current || !lastPos.current) return;
      const pos = getPos(e);
      ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y); ctx.stroke();
      lastPos.current = pos; hasDrawn.current = true;
    };
    const end = (e: TouchEvent | MouseEvent) => {
      e.preventDefault(); drawing.current = false; lastPos.current = null;
      if (hasDrawn.current) onDrawRef.current(canvas.toDataURL("image/png"));
    };
    canvas.addEventListener("mousedown", start); canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end); canvas.addEventListener("mouseleave", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove",  move,  { passive: false });
    canvas.addEventListener("touchend",   end,   { passive: false });
    canvas.addEventListener("touchcancel",end,   { passive: false });
    return () => {
      canvas.removeEventListener("mousedown", start); canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", end); canvas.removeEventListener("mouseleave", end);
      canvas.removeEventListener("touchstart", start); canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end); canvas.removeEventListener("touchcancel", end);
    };
  }, []);

  useEffect(() => { onDrawRef.current = setMainSig; }, []);
  useEffect(() => { if (pageState === "pending" && !hasZones) return setupSigCanvas(); }, [pageState, hasZones, setupSigCanvas]);

  const clearMainSig = () => {
    const c = sigCanvasRef.current;
    if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    hasDrawn.current = false; setMainSig(null);
  };

  // ── Modal 簽名 Canvas ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!sigModal) return;
    const canvas = modalCanvasRef.current;
    if (!canvas) return;
    canvas.width = 600; canvas.height = 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2.8;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    modalHasDrawn.current = false;
    setModalSigTemp(null);

    const getPos = (e: TouchEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const t = (e as TouchEvent).touches?.[0];
      return {
        x: ((t ? t.clientX : (e as MouseEvent).clientX) - rect.left) * (canvas.width  / rect.width),
        y: ((t ? t.clientY : (e as MouseEvent).clientY) - rect.top)  * (canvas.height / rect.height),
      };
    };
    const start = (e: TouchEvent | MouseEvent) => { e.preventDefault(); modalDrawing.current = true; modalLastPos.current = getPos(e); };
    const move  = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      if (!modalDrawing.current || !modalLastPos.current) return;
      const pos = getPos(e);
      ctx.beginPath(); ctx.moveTo(modalLastPos.current.x, modalLastPos.current.y);
      ctx.lineTo(pos.x, pos.y); ctx.stroke();
      modalLastPos.current = pos; modalHasDrawn.current = true;
    };
    const end = (e: TouchEvent | MouseEvent) => {
      e.preventDefault(); modalDrawing.current = false; modalLastPos.current = null;
      if (modalHasDrawn.current) setModalSigTemp(canvas.toDataURL("image/png"));
    };
    canvas.addEventListener("mousedown", start); canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end); canvas.addEventListener("mouseleave", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove",  move,  { passive: false });
    canvas.addEventListener("touchend",   end,   { passive: false });
    canvas.addEventListener("touchcancel",end,   { passive: false });
    return () => {
      canvas.removeEventListener("mousedown", start); canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", end); canvas.removeEventListener("mouseleave", end);
      canvas.removeEventListener("touchstart", start); canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end); canvas.removeEventListener("touchcancel", end);
    };
  }, [sigModal]);

  const confirmModalSig = () => {
    if (sigModal && modalSigTemp) {
      setZoneSigs(prev => ({ ...prev, [sigModal]: modalSigTemp }));
    }
    setSigModal(null);
  };

  const clearModalSig = () => {
    const c = modalCanvasRef.current;
    if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    modalHasDrawn.current = false;
    setModalSigTemp(null);
  };

  // ── 提交 ───────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!signerName.trim()) { alert("請輸入您的姓名"); return; }

    // 驗證：所有 sig_b zones 必須有簽名
    if (hasZones) {
      const unsigned = sigBZones.filter(z => !zoneSigs[z.id]);
      if (unsigned.length > 0) {
        alert(`請在「${unsigned.map(z => z.label).join("、")}」處完成簽名`);
        return;
      }
    } else {
      if (!mainSig) { alert("請在下方空白處手寫簽名"); return; }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/contracts/sign", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          signer_name:     signerName.trim(),
          signature_image: hasZones ? (Object.values(zoneSigs)[0] ?? null) : mainSig,
          zone_responses:  hasZones ? { sigs: zoneSigs, fields: zoneFields } : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { alert("簽署失敗：" + (json.error || "請稍後再試")); return; }
      setPageState("signed");
    } finally {
      setSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Renders
  // ═══════════════════════════════════════════════════════════════════════════

  if (pageState === "loading") return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
        <p className="text-slate-500 text-sm">載入合約中…</p>
      </div>
    </div>
  );

  if (pageState === "error") return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="text-center space-y-4 max-w-sm">
        <AlertCircle className="w-14 h-14 text-red-400 mx-auto" />
        <h1 className="text-xl font-bold text-slate-800">無效連結</h1>
        <p className="text-slate-500 text-sm">{errMsg}</p>
        <p className="text-xs text-slate-400">如有疑問請聯繫旅行社</p>
      </div>
    </div>
  );

  if (pageState === "signed") return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-50 to-slate-50 p-6">
      <div className="text-center space-y-5 max-w-sm w-full">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">簽署完成！</h1>
          <p className="text-slate-500 text-sm mt-1">感謝您的電子簽名，已成功送出。</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-left space-y-2.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">合約資訊</p>
          <p className="font-semibold text-slate-700">{contract?.title}</p>
          {(contract?.signer_name || signerName) && (
            <p className="text-sm text-slate-500">簽署人：{contract?.signer_name || signerName}</p>
          )}
          {contract?.tour && (
            <p className="text-sm text-slate-500">✈️ {(contract.tour as {name: string}).name}</p>
          )}
        </div>
        <p className="text-xs text-slate-400">如有疑問請聯繫旅行社</p>
      </div>
    </div>
  );

  // ── Pending ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <Globe className="w-5 h-5 text-blue-500 shrink-0" />
          <span className="font-semibold text-slate-700 text-sm">暖心旅行社 — 線上合約簽署</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-12">

        {/* 合約資訊 */}
        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 space-y-2">
          <h1 className="font-bold text-lg text-slate-800 leading-snug">{contract?.title}</h1>
          {contract?.tour && (
            <p className="text-sm text-slate-500">
              ✈️ {(contract.tour as {name:string}).name}
              {(contract.tour as {destination?:string}).destination && `（${(contract.tour as {destination?:string}).destination}）`}
            </p>
          )}
          {contract?.customer && (
            <p className="text-sm text-slate-500">👤 {(contract.customer as {name:string}).name}</p>
          )}
          {contract?.notes && (
            <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-2 mt-1">{contract.notes}</p>
          )}
        </div>

        {/* ── 有 zones：PDF.js 渲染 + 區塊疊加 ── */}
        {hasZones ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-700 text-sm">📄 合約內容</h2>
                <p className="text-xs text-slate-400">
                  {!pdfReady ? "PDF 載入中…" : `共 ${numPages} 頁`}
                </p>
              </div>

              {/* PDF pages with zone overlays */}
              <div className="p-3 space-y-3">
                {!pdfReady && (
                  <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> PDF 渲染中…
                  </div>
                )}
                {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                  <div key={pageNum} className="relative rounded-xl overflow-hidden shadow-sm">
                    <canvas
                      ref={el => { canvasRefs.current[pageNum - 1] = el; }}
                      className="w-full"
                      style={{ display: "block" }}
                    />
                    {/* Zone overlays */}
                    {pdfReady && (contract?.zones ?? []).filter((z: Zone) => z.page === pageNum).map((zone: Zone) => {
                      const meta = ZONE_META[zone.type];
                      const isSigB = zone.type === "sig_b";
                      const signed = isSigB && zoneSigs[zone.id];
                      return (
                        <div
                          key={zone.id}
                          className={`absolute border-2 rounded overflow-hidden ${meta.border} ${
                            isSigB && !signed ? "cursor-pointer hover:shadow-lg transition-shadow" : ""
                          } ${signed ? "border-emerald-400" : meta.bg}`}
                          style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` }}
                          onClick={isSigB && !signed ? () => setSigModal(zone.id) : undefined}
                        >
                          {/* 甲方印章/簽名 → 顯示預設圖 */}
                          {(zone.type === "stamp_a" || zone.type === "sig_a") && zone.preset_image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={zone.preset_image} alt="" className="w-full h-full object-contain pointer-events-none" />
                          )}
                          {/* 乙方簽名 → 顯示已簽 or 提示 */}
                          {isSigB && (
                            signed ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={signed} alt="" className="w-full h-full object-contain pointer-events-none" />
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full gap-0.5">
                                <Pen className={`w-3 h-3 ${meta.text}`} />
                                <span className={`text-[10px] font-semibold ${meta.text} text-center leading-tight px-1`}>
                                  點此簽名<br/>{zone.label}
                                </span>
                              </div>
                            )
                          )}
                          {/* 自訂欄位 → input */}
                          {zone.type === "field" && (
                            <input
                              className="w-full h-full bg-transparent text-xs text-slate-700 px-1 py-0.5 border-none focus:outline-none"
                              placeholder={zone.label}
                              value={zoneFields[zone.id] || ""}
                              onChange={e => setZoneFields(prev => ({ ...prev, [zone.id]: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* 進度指示 */}
            {sigBZones.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">✍️ 簽名進度</p>
                <div className="space-y-2">
                  {sigBZones.map(z => (
                    <div key={z.id} className="flex items-center gap-2.5">
                      {zoneSigs[z.id]
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        : <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />}
                      <span className={`text-sm ${zoneSigs[z.id] ? "text-emerald-600 line-through" : "text-slate-600"}`}>
                        第 {z.page} 頁 · {z.label}
                      </span>
                      {!zoneSigs[z.id] && (
                        <button onClick={() => setSigModal(z.id)}
                          className="ml-auto text-xs text-blue-600 hover:underline">
                          簽名
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── 無 zones：舊版 iframe + 底部 canvas ── */
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-700 text-sm">📄 合約內容</h2>
              {pdfBlobUrl && (
                <div className="flex gap-3">
                  <a href={pdfBlobUrl} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline">另開視窗</a>
                  <a href={pdfBlobUrl} download={contract?.pdf_name || "合約.pdf"} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                    <Download className="w-3 h-3" /> 下載
                  </a>
                </div>
              )}
            </div>
            {pdfBlobUrl ? (
              <iframe src={pdfBlobUrl} className="w-full" style={{ height: "58vh", display: "block" }} title="合約 PDF" />
            ) : (
              <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> PDF 載入中…
              </div>
            )}
          </div>
        )}

        {/* ── 簽名表單（共用） ── */}
        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-5 space-y-5">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Pen className="w-4 h-4 text-blue-500" /> 確認簽署
          </h2>

          {/* 姓名 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
              姓名確認 <span className="text-red-400">*</span>
            </label>
            <input
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="請輸入您的姓名"
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              autoComplete="name"
            />
          </div>

          {/* 無 zones：顯示主簽名 canvas */}
          {!hasZones && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500">
                  手寫簽名 <span className="text-red-400">*</span>
                  <span className="ml-1 font-normal text-slate-400 text-[11px]">用手指在下方空白處簽名</span>
                </label>
                <button onClick={clearMainSig}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors py-1 px-2 rounded-lg hover:bg-red-50">
                  <RotateCcw className="w-3.5 h-3.5" /> 清除
                </button>
              </div>
              <div className={`rounded-2xl overflow-hidden border-2 transition-colors ${mainSig ? "border-emerald-300" : "border-dashed border-slate-200 bg-slate-50"}`}>
                <canvas ref={sigCanvasRef} width={720} height={240} className="w-full bg-white"
                  style={{ touchAction: "none", display: "block", cursor: "crosshair" }} />
              </div>
              {!mainSig && (
                <p className="text-center text-xs text-slate-400 mt-2 flex items-center justify-center gap-1.5">
                  <Pen className="w-3 h-3" /> 在上方框框內用手指簽下您的姓名
                </p>
              )}
            </div>
          )}

          {/* 有 zones：確認所有簽名已完成 */}
          {hasZones && sigBZones.length > 0 && (
            <div className={`text-sm px-4 py-3 rounded-xl ${
              sigBZones.every(z => zoneSigs[z.id])
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}>
              {sigBZones.every(z => zoneSigs[z.id])
                ? "✅ 所有簽名區塊已完成"
                : `⚠️ 請在合約 PDF 上點擊藍色簽名區塊完成簽名（${sigBZones.filter(z => !zoneSigs[z.id]).length} 處尚未簽）`}
            </div>
          )}

          {/* 提交 */}
          <button
            onClick={handleSubmit}
            disabled={submitting || (!hasZones && !mainSig) || (hasZones && sigBZones.length > 0 && !sigBZones.every(z => zoneSigs[z.id]))}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-4 rounded-2xl text-base transition-colors flex items-center justify-center gap-2"
          >
            {submitting
              ? <><Loader2 className="w-5 h-5 animate-spin" /> 送出中…</>
              : <><CheckCircle2 className="w-5 h-5" /> 確認簽署</>}
          </button>

          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            點擊「確認簽署」即表示本人確認已閱讀並同意以上合約全部條款，此電子簽名具有法律效力。
          </p>
        </div>
      </div>

      {/* ── 簽名彈出 Modal ── */}
      {sigModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">
                ✍️ {(contract?.zones ?? []).find((z: Zone) => z.id === sigModal)?.label || "簽名"}
              </h3>
              <button onClick={() => setSigModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className={`rounded-2xl overflow-hidden border-2 transition-colors ${modalSigTemp ? "border-emerald-300" : "border-dashed border-slate-200 bg-slate-50"}`}>
                <canvas ref={modalCanvasRef} width={600} height={240} className="w-full bg-white"
                  style={{ touchAction: "none", display: "block", cursor: "crosshair" }} />
              </div>
              <div className="flex gap-2">
                <button onClick={clearModalSig}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-100 transition-colors">
                  <RotateCcw className="w-4 h-4" /> 清除
                </button>
                <button onClick={confirmModalSig} disabled={!modalSigTemp}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> 確認此簽名
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
