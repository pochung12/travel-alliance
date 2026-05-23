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
  signed_at_a: string | null;
  signer_name_a: string;
  notes: string;
  zones: Zone[];
  sign_token: string;
  sign_token_a: string;
  zone_responses?: { sigs?: Record<string, string>; fields?: Record<string, string> } | null;
  zone_responses_a?: { sigs?: Record<string, string>; fields?: Record<string, string> } | null;
  tour: { name: string; destination?: string } | null;
  customer: { name: string } | null;
}

type PageState = "loading" | "pending" | "signed" | "error";
type Party = "a" | "b";

// ── 工具函式 ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── 主頁面 ────────────────────────────────────────────────────────────────────

export default function SignPage() {
  const { token } = useParams<{ token: string }>();

  const [pageState,     setPageState]     = useState<PageState>("loading");
  const [contract,      setContract]      = useState<SignContract | null>(null);
  const [party,         setParty]         = useState<Party>("b");
  const [signerName,    setSignerName]    = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [errMsg,        setErrMsg]        = useState("");

  // PDF 渲染狀態
  const [numPages,    setNumPages]    = useState(0);
  const [pdfReady,    setPdfReady]    = useState(false);
  const canvasRefs   = useRef<(HTMLCanvasElement | null)[]>([]);
  const pdfDocRef    = useRef<unknown>(null);

  // 舊版簽名 canvas (無 zones 時使用)
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawing      = useRef(false);
  const lastPos      = useRef<{x: number; y: number} | null>(null);
  const hasDrawn     = useRef(false);
  const onDrawRef    = useRef<(d: string | null) => void>(() => {});
  const [mainSig,    setMainSig]     = useState<string | null>(null);

  // Zone 簽名狀態
  const [zoneSigs,    setZoneSigs]   = useState<Record<string, string>>({}); // zoneId → base64
  const [zoneFields,  setZoneFields] = useState<Record<string, string>>({}); // zoneId → text
  // 簽名 ref 快照（在 submit / load 時捕捉，避免 async state stale closure 問題）
  const sigsSnapshotRef = useRef<Record<string, string>>({});
  // 追蹤是否曾進入 pending 狀態（用來區分 revisit vs fresh submit）
  const wasPendingRef = useRef(false);
  // 簽名彈出 Modal
  const [sigModal,    setSigModal]   = useState<string | null>(null); // zoneId
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const modalDrawing   = useRef(false);
  const modalLastPos   = useRef<{x: number; y: number} | null>(null);
  const modalHasDrawn  = useRef(false);
  const [modalSigTemp, setModalSigTemp] = useState<string | null>(null);

  // 衍生值
  const hasZones    = (contract?.zones?.length ?? 0) > 0;
  const signAZones  = (contract?.zones ?? []).filter(z => z.type === "sign_a");
  const sigBZones   = (contract?.zones ?? []).filter(z => z.type === "sig_b");
  const myZones     = party === "a" ? signAZones : sigBZones;

  // 對方已存在 DB 的簽名（顯示在 PDF 上）
  const otherPartySigs: Record<string, string> = useMemo(() => {
    if (party === "b") return contract?.zone_responses_a?.sigs ?? {};
    return contract?.zone_responses?.sigs ?? {};
  }, [party, contract]);

  // 舊版 PDF blob URL（無 zones 時）
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

  // Fresh submit（pending → signed）時重新渲染 PDF，確保 canvas 內容不丟失
  useEffect(() => {
    if (pageState === "signed" && wasPendingRef.current && hasZones && contract?.pdf_data) {
      wasPendingRef.current = false;
      // 短暫延遲讓 React commit canvas DOM 後再渲染
      const t = setTimeout(() => { renderPdfWithPdfjs(contract.pdf_data); }, 60);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageState]);

  // ── 渲染 PDF ─────────────────────────────────────────────────────────────────

  const renderPdfWithPdfjs = async (pdfDataUrl: string) => {
    setPdfReady(false);
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

  // ── 載入合約 ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id,title,pdf_data,pdf_name,status,signed_at,signer_name,signed_at_a,signer_name_a,notes,zones,sign_token,sign_token_a,zone_responses,zone_responses_a,tour:tours(name,destination),customer:customers(name)")
        .or(`sign_token.eq.${token},sign_token_a.eq.${token}`)
        .single();

      if (error || !data) {
        setPageState("error");
        setErrMsg("找不到此合約，連結可能已失效");
        return;
      }

      const c = data as unknown as SignContract;
      setContract(c);

      const detectedParty: Party = c.sign_token_a === token ? "a" : "b";
      setParty(detectedParty);

      // 已簽署：預填歷史簽名，仍渲染 PDF（讓使用者看到帶簽名的合約）
      const alreadySigned =
        (detectedParty === "a" && !!c.signed_at_a) ||
        (detectedParty === "b" && c.status === "signed");

      if (alreadySigned) {
        if (detectedParty === "a" && c.signer_name_a) setSignerName(c.signer_name_a);
        if (detectedParty === "b" && c.signer_name)   setSignerName(c.signer_name);
        // 載入當前方的簽名圖到 zoneSigs + 快照 ref
        const loadedSigs = detectedParty === "a"
          ? (c.zone_responses_a?.sigs ?? {})
          : (c.zone_responses?.sigs ?? {});
        sigsSnapshotRef.current = loadedSigs;
        setZoneSigs(loadedSigs);
        // 合併雙方欄位（date_b / field）
        setZoneFields({
          ...(c.zone_responses?.fields   ?? {}),
          ...(c.zone_responses_a?.fields ?? {}),
        });
        setPageState("signed");
        // Revisit 情境：直接在此渲染 PDF（wasPendingRef = false，不走 useEffect）
        if ((c.zones?.length ?? 0) > 0) {
          // 等 React commit signed 畫面（含 canvas）後再渲染
          setTimeout(() => { renderPdfWithPdfjs(c.pdf_data); }, 60);
        }
        return;
      }

      // 待簽署
      if (detectedParty === "a" && c.signer_name_a) setSignerName(c.signer_name_a);
      if (detectedParty === "b" && c.signer_name)   setSignerName(c.signer_name);
      wasPendingRef.current = true; // 標記曾進入 pending，fresh submit 時觸發 PDF re-render
      setPageState("pending");

      // 預填 date_b / field preset_text
      if (Array.isArray(c.zones)) {
        const fv: Record<string, string> = {};
        const today = new Date();
        const rocYear = today.getFullYear() - 1911;
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const todayStr = `民國 ${rocYear} 年 ${mm} 月 ${dd} 日`;
        c.zones.forEach((z: Zone) => {
          if (z.type === "date_b") fv[z.id] = todayStr;
          if (z.type === "field" && z.preset_text) fv[z.id] = z.preset_text;
        });
        setZoneFields(fv);
      }

      if ((c.zones?.length ?? 0) > 0) await renderPdfWithPdfjs(c.pdf_data);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── 舊版簽名 Canvas（無 zones） ───────────────────────────────────────────────

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

  // ── Modal 簽名 Canvas ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sigModal) return;
    const canvas = modalCanvasRef.current;
    if (!canvas) return;
    modalHasDrawn.current = false;
    setModalSigTemp(null);

    // 用來儲存事件清除函式（rAF 內設定）
    let removeFns: (() => void) | null = null;

    // 等 rAF 讓 flex layout 穩定後再量測實際像素大小
    const rafId = requestAnimationFrame(() => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      // 用高解析度像素，讓 Retina / 手機螢幕筆跡清晰
      canvas.width  = Math.round(rect.width  * dpr) || 1200;
      canvas.height = Math.round(rect.height * dpr) || 800;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr); // 縮放後，座標系統與 CSS px 一致
      ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 3;
      ctx.lineCap = "round"; ctx.lineJoin = "round";

      // getPos：直接取 CSS px 座標（已由 ctx.scale 處理 dpr）
      const getPos = (e: TouchEvent | MouseEvent) => {
        const r = canvas.getBoundingClientRect();
        const t = (e as TouchEvent).touches?.[0];
        return {
          x: (t ? t.clientX : (e as MouseEvent).clientX) - r.left,
          y: (t ? t.clientY : (e as MouseEvent).clientY) - r.top,
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
      removeFns = () => {
        canvas.removeEventListener("mousedown", start); canvas.removeEventListener("mousemove", move);
        canvas.removeEventListener("mouseup", end); canvas.removeEventListener("mouseleave", end);
        canvas.removeEventListener("touchstart", start); canvas.removeEventListener("touchmove", move);
        canvas.removeEventListener("touchend", end); canvas.removeEventListener("touchcancel", end);
      };
    });

    return () => {
      cancelAnimationFrame(rafId);
      removeFns?.();
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

  // ── 提交 ─────────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!signerName.trim()) { alert("請輸入您的姓名"); return; }

    if (hasZones) {
      const unsigned = myZones.filter(z => !zoneSigs[z.id]);
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
          party,
          signer_name:     signerName.trim(),
          signature_image: hasZones ? (Object.values(zoneSigs)[0] ?? null) : mainSig,
          zone_responses:  hasZones ? { sigs: zoneSigs, fields: zoneFields } : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { alert("簽署失敗：" + (json.error || "請稍後再試")); return; }
      // 簽名快照：在 setPageState 前捕捉（避免 async state stale closure）
      sigsSnapshotRef.current = { ...zoneSigs };
      // 更新 contract 狀態以反映剛完成的簽署（讓 signed view 顯示正確資訊）
      setContract(prev => {
        if (!prev) return prev;
        if (party === "a") return { ...prev, signed_at_a: new Date().toISOString(), signer_name_a: signerName.trim() };
        return { ...prev, status: "signed", signed_at: new Date().toISOString(), signer_name: signerName.trim() };
      });
      setPageState("signed"); // 觸發 useEffect → PDF re-render（wasPendingRef = true）
    } finally {
      setSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Renders
  // ═══════════════════════════════════════════════════════════════════════════

  const partyLabel = party === "a" ? "甲方" : "乙方";
  const partyColor = party === "a" ? "indigo" : "blue";
  const isSigned   = pageState === "signed";

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

  // ── 主畫面（pending + signed 共用，避免 canvas unmount） ──────────────────────

  const headerBg = isSigned
    ? "bg-emerald-600"
    : partyColor === "indigo" ? "bg-indigo-600" : "bg-blue-600";

  const myZonesMeta = myZones.length > 0
    ? `需完成 ${myZones.length} 處簽名`
    : "閱讀合約後填寫姓名確認";

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className={`${headerBg} sticky top-0 z-20`}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          {isSigned
            ? <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
            : <Globe className="w-5 h-5 text-white/80 shrink-0" />}
          <div className="flex-1">
            <span className="font-semibold text-white text-sm">
              暖心旅行社 — {isSigned ? `${partyLabel}簽署完成` : "線上合約簽署"}
            </span>
            {!isSigned && <span className="ml-2 text-xs text-white/70">（{partyLabel}）</span>}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-12">

        {/* 合約資訊 */}
        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 space-y-2">
          <div className="flex items-center gap-2">
            {isSigned ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                ✅ 已完成簽署
              </span>
            ) : (
              <>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  party === "a" ? "bg-indigo-100 text-indigo-700" : "bg-blue-100 text-blue-700"
                }`}>{partyLabel}簽署</span>
                <span className="text-xs text-slate-400">{myZonesMeta}</span>
              </>
            )}
          </div>
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
          {/* 簽署人資訊（已簽署時顯示） */}
          {isSigned && (contract?.signer_name_a || contract?.signer_name) && (
            <div className="pt-2 mt-1 border-t border-slate-100 space-y-1">
              {contract?.signer_name_a && (
                <p className="text-xs text-indigo-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  甲方：{contract.signer_name_a}
                  <span className="text-slate-400 ml-1">{fmtDate(contract.signed_at_a)}</span>
                </p>
              )}
              {contract?.signer_name && (
                <p className="text-xs text-blue-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  乙方：{contract.signer_name}
                  <span className="text-slate-400 ml-1">{fmtDate(contract.signed_at)}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── 有 zones：PDF.js 渲染 + 區塊疊加 ── */}
        {hasZones ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-700 text-sm">
                  📄 合約內容{isSigned ? "（含簽名）" : ""}
                </h2>
                <p className="text-xs text-slate-400">
                  {!pdfReady ? "PDF 載入中…" : `共 ${numPages} 頁`}
                </p>
              </div>

              <div className="p-3 space-y-3">
                {!pdfReady && (
                  <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> PDF 渲染中…
                  </div>
                )}
                {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                  <div key={pageNum} className="relative rounded-xl overflow-hidden shadow-sm">
                    {/* ⚠️ canvas 不隨 pageState 切換而 unmount，維持渲染內容 */}
                    <canvas
                      ref={el => { canvasRefs.current[pageNum - 1] = el; }}
                      className="w-full"
                      style={{ display: "block" }}
                    />
                    {/* Zone overlays */}
                    {pdfReady && (contract?.zones ?? []).filter((z: Zone) => z.page === pageNum).map((zone: Zone) => {
                      const meta      = ZONE_META[zone.type];
                      const isSignA   = zone.type === "sign_a";
                      const isSigB    = zone.type === "sig_b";
                      const isMySig   = (party === "a" && isSignA) || (party === "b" && isSigB);
                      const mySigned  = isMySig ? zoneSigs[zone.id] : undefined;
                      // 對方已存 DB 的簽名
                      const otherSig  = (isSignA && party === "b") ? otherPartySigs[zone.id] : undefined;
                      const otherSigB = (isSigB  && party === "a") ? otherPartySigs[zone.id] : undefined;

                      // 已簽署狀態：從快照 ref 取我方簽名（比 state 更可靠）
                      // 對方簽名從 DB zone_responses 取（contract 載入時已有）
                      const signedMySig = isSigned ? sigsSnapshotRef.current[zone.id] : undefined;
                      const signedOtherSig = isSigned
                        ? (isSignA && party === "b" ? (contract?.zone_responses_a?.sigs?.[zone.id] ?? otherPartySigs[zone.id]) : undefined)
                        : undefined;
                      const signedOtherSigB = isSigned
                        ? (isSigB && party === "a" ? (contract?.zone_responses?.sigs?.[zone.id] ?? otherPartySigs[zone.id]) : undefined)
                        : undefined;

                      // 是否可互動（僅 pending 狀態 + 我方 + 尚未簽）
                      const canClick = !isSigned && isMySig && !mySigned;

                      return (
                        <div
                          key={zone.id}
                          className={`absolute border-2 rounded overflow-hidden z-10 ${
                            mySigned || (isSigned && (signedMySig || signedOtherSig || signedOtherSigB))
                              ? "border-emerald-400"
                              : meta.border
                          } ${canClick ? "cursor-pointer hover:shadow-lg transition-shadow" : ""} ${
                            (mySigned || (isSigned && (signedMySig || signedOtherSig || signedOtherSigB))) ? "" : meta.bg
                          }`}
                          style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` }}
                          onClick={canClick ? () => setSigModal(zone.id) : undefined}
                        >
                          {/* 甲方靜態印章/簽名 */}
                          {(zone.type === "stamp_a" || zone.type === "sig_a") && zone.preset_image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={zone.preset_image} alt="" className="w-full h-full object-contain pointer-events-none" />
                          )}

                          {/* 甲方互動簽署區 (sign_a) */}
                          {isSignA && (
                            isSigned ? (
                              // 已簽署：優先用 ref 快照（我方），其次對方 DB 資料
                              (isMySig ? signedMySig : signedOtherSig)
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={(isMySig ? signedMySig : signedOtherSig)!} alt="甲方簽名" className="w-full h-full object-contain pointer-events-none" />
                                : <div className={`flex items-center justify-center h-full text-[10px] ${meta.text} opacity-50`}>甲方待簽</div>
                            ) : mySigned ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={mySigned} alt="" className="w-full h-full object-contain pointer-events-none" />
                            ) : otherSig ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={otherSig} alt="" className="w-full h-full object-contain pointer-events-none" />
                            ) : party === "a" ? (
                              <div className="flex flex-col items-center justify-center h-full gap-0.5">
                                <Pen className={`w-3 h-3 ${meta.text}`} />
                                <span className={`text-[10px] font-semibold ${meta.text} text-center leading-tight px-1`}>
                                  點此簽名<br/>{zone.label}
                                </span>
                              </div>
                            ) : (
                              <div className={`flex items-center justify-center h-full text-[10px] ${meta.text} opacity-50`}>甲方待簽</div>
                            )
                          )}

                          {/* 乙方互動簽署區 (sig_b) */}
                          {isSigB && (
                            isSigned ? (
                              // 已簽署：優先用 ref 快照（我方），其次對方 DB 資料
                              (isMySig ? signedMySig : signedOtherSigB)
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={(isMySig ? signedMySig : signedOtherSigB)!} alt="乙方簽名" className="w-full h-full object-contain pointer-events-none" />
                                : <div className={`flex items-center justify-center h-full text-[10px] ${meta.text} opacity-50`}>乙方待簽</div>
                            ) : mySigned ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={mySigned} alt="" className="w-full h-full object-contain pointer-events-none" />
                            ) : otherSigB ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={otherSigB} alt="" className="w-full h-full object-contain pointer-events-none" />
                            ) : party === "b" ? (
                              <div className="flex flex-col items-center justify-center h-full gap-0.5">
                                <Pen className={`w-3 h-3 ${meta.text}`} />
                                <span className={`text-[10px] font-semibold ${meta.text} text-center leading-tight px-1`}>
                                  點此簽名<br/>{zone.label}
                                </span>
                              </div>
                            ) : (
                              <div className={`flex items-center justify-center h-full text-[10px] ${meta.text} opacity-50`}>乙方待簽</div>
                            )
                          )}

                          {/* 簽署日期 → 自動帶入，唯讀 */}
                          {zone.type === "date_b" && (
                            <div className="flex items-center justify-center h-full text-[11px] text-violet-700 font-medium px-1 select-none pointer-events-none">
                              {zoneFields[zone.id] || ""}
                            </div>
                          )}

                          {/* 自訂欄位（甲方預填）→ 唯讀 */}
                          {zone.type === "field" && (zone.signer ?? "b") === "a" && (
                            <div className="flex items-center h-full text-xs text-slate-700 px-1 select-none pointer-events-none leading-tight">
                              {zoneFields[zone.id] || zone.preset_text || zone.label}
                            </div>
                          )}

                          {/* 自訂欄位（乙方填寫）→ pending 可編輯 / signed 唯讀 */}
                          {zone.type === "field" && (zone.signer ?? "b") !== "a" && (
                            (!isSigned && party === "b") ? (
                              <input
                                className="w-full h-full bg-transparent text-xs text-slate-700 px-1 py-0.5 border-none focus:outline-none"
                                placeholder={zone.label}
                                value={zoneFields[zone.id] || ""}
                                onChange={e => setZoneFields(prev => ({ ...prev, [zone.id]: e.target.value }))}
                                onClick={e => e.stopPropagation()}
                              />
                            ) : (
                              <div className="flex items-center h-full text-xs text-slate-700 px-1 pointer-events-none leading-tight">
                                {zoneFields[zone.id] || zone.label}
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* 簽名進度（僅 pending 狀態顯示） */}
            {!isSigned && myZones.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">✍️ {partyLabel}簽名進度</p>
                <div className="space-y-2">
                  {myZones.map(z => (
                    <div key={z.id} className="flex items-center gap-2.5">
                      {zoneSigs[z.id]
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        : <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />}
                      <span className={`text-sm ${zoneSigs[z.id] ? "text-emerald-600 line-through" : "text-slate-600"}`}>
                        第 {z.page} 頁 · {z.label}
                      </span>
                      {!zoneSigs[z.id] && (
                        <button onClick={() => setSigModal(z.id)}
                          className={`ml-auto text-xs hover:underline ${party === "a" ? "text-indigo-600" : "text-blue-600"}`}>
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
          /* ── 無 zones：舊版 iframe ── */
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

        {/* ── 底部：簽署表單 (pending) 或 完成摘要 (signed) ── */}
        {isSigned ? (
          /* 已簽署完成摘要 */
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-5 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">{partyLabel}簽署完成！</h2>
              <p className="text-sm text-slate-500 mt-1">感謝您的電子簽名，已成功送出。</p>
            </div>
            {(contract?.signer_name_a || contract?.signer_name) && (
              <div className="bg-white rounded-xl border border-emerald-100 px-4 py-3 text-left space-y-1.5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">簽署紀錄</p>
                {contract?.signer_name_a && (
                  <p className="text-sm text-indigo-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>甲方：<strong>{contract.signer_name_a}</strong></span>
                    <span className="text-slate-400 text-xs">{fmtDate(contract.signed_at_a)}</span>
                  </p>
                )}
                {contract?.signer_name ? (
                  <p className="text-sm text-blue-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>乙方：<strong>{contract.signer_name}</strong></span>
                    <span className="text-slate-400 text-xs">{fmtDate(contract.signed_at)}</span>
                  </p>
                ) : (
                  <p className="text-sm text-slate-400 flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 shrink-0" />
                    乙方：待簽署
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-slate-400">如有疑問請聯繫旅行社</p>
          </div>
        ) : (
          /* 待簽署：表單 */
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-5 space-y-5">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Pen className={`w-4 h-4 ${party === "a" ? "text-indigo-500" : "text-blue-500"}`} />
              {partyLabel}確認簽署
            </h2>

            {/* 姓名 */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                {partyLabel}姓名 <span className="text-red-400">*</span>
              </label>
              <input
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder={`請輸入${partyLabel}姓名`}
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                autoComplete="name"
              />
            </div>

            {/* 無 zones：手寫簽名 canvas */}
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

            {/* 有 zones：簽名完成確認狀態 */}
            {hasZones && myZones.length > 0 && (
              <div className={`text-sm px-4 py-3 rounded-xl ${
                myZones.every(z => zoneSigs[z.id])
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}>
                {myZones.every(z => zoneSigs[z.id])
                  ? `✅ ${partyLabel}所有簽名區塊已完成`
                  : `⚠️ 請在合約 PDF 上點擊簽名區塊完成${partyLabel}簽名（${myZones.filter(z => !zoneSigs[z.id]).length} 處尚未簽）`}
              </div>
            )}

            {/* 提交 */}
            <button
              onClick={handleSubmit}
              disabled={submitting || (!hasZones && !mainSig) || (hasZones && myZones.length > 0 && !myZones.every(z => zoneSigs[z.id]))}
              className={`w-full hover:opacity-90 active:opacity-80 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-4 rounded-2xl text-base transition-colors flex items-center justify-center gap-2 ${
                party === "a" ? "bg-indigo-600" : "bg-blue-600"
              }`}
            >
              {submitting
                ? <><Loader2 className="w-5 h-5 animate-spin" /> 送出中…</>
                : <><CheckCircle2 className="w-5 h-5" /> {partyLabel}確認簽署</>}
            </button>

            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              點擊「{partyLabel}確認簽署」即表示本人確認已閱讀並同意以上合約全部條款，此電子簽名具有法律效力。
            </p>
          </div>
        )}
      </div>

      {/* ── 簽名全螢幕 Modal（僅 pending 狀態） ── */}
      {!isSigned && sigModal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">

          {/* 彩色 Header */}
          <div className={`shrink-0 flex items-center justify-between px-4 py-3 ${
            party === "a" ? "bg-indigo-600" : "bg-blue-600"
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <Pen className="w-5 h-5 text-white shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-white text-sm leading-tight truncate">
                  {(contract?.zones ?? []).find((z: Zone) => z.id === sigModal)?.label || "手寫簽名"}
                </p>
                <p className="text-xs text-white/70">{partyLabel} · 用手指在下方簽名</p>
              </div>
            </div>
            <button onClick={() => setSigModal(null)}
              className="shrink-0 p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 簽名畫布（flex-1 填滿剩餘高度） */}
          <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
            <div className={`flex-1 min-h-0 relative rounded-2xl overflow-hidden border-2 transition-colors ${
              modalSigTemp
                ? "border-emerald-400 bg-white"
                : "border-dashed border-slate-300 bg-slate-50"
            }`}>
              {/* Canvas 填滿容器，座標由 getPos 換算 */}
              <canvas
                ref={modalCanvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ touchAction: "none", cursor: "crosshair", display: "block" }}
              />
              {/* 未簽時的引導提示 */}
              {!modalSigTemp && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                  <div className="text-center space-y-2">
                    <Pen className="w-10 h-10 text-slate-200 mx-auto" />
                    <p className="text-slate-300 text-base font-medium">在此簽名</p>
                  </div>
                </div>
              )}
            </div>
            {/* 已有簽名時顯示提示 */}
            {modalSigTemp && (
              <p className="text-center text-xs text-emerald-500 shrink-0">
                ✅ 已完成簽名，可點「確認此簽名」送出，或「清除重簽」重新簽
              </p>
            )}
          </div>

          {/* 底部按鈕列（含 safe-area padding） */}
          <div className="shrink-0 flex gap-3 px-4 pt-3 pb-8 border-t border-slate-100 bg-white">
            <button onClick={clearModalSig}
              className="flex items-center gap-1.5 px-4 py-4 rounded-2xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 transition-colors">
              <RotateCcw className="w-4 h-4" /> 清除重簽
            </button>
            <button onClick={confirmModalSig} disabled={!modalSigTemp}
              className={`flex-1 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 rounded-2xl text-base transition-colors flex items-center justify-center gap-2 active:opacity-80 ${
                party === "a"
                  ? "bg-indigo-600 hover:bg-indigo-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}>
              <CheckCircle2 className="w-5 h-5" /> 確認此簽名
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
