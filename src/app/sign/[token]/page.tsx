"use client";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Globe, CheckCircle2, AlertCircle, RotateCcw, Loader2, Pen, Download,
} from "lucide-react";

// ── 合約資料形狀（只取這幾欄）──────────────────────────────────────────────

interface SignContract {
  id: string;
  title: string;
  pdf_data: string;
  pdf_name: string;
  status: string;
  signed_at: string | null;
  signer_name: string;
  notes: string;
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
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [errMsg,        setErrMsg]        = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const lastPos   = useRef<{ x: number; y: number } | null>(null);
  const hasDrawn  = useRef(false);
  const onChangeRef = useRef<(d: string | null) => void>(() => {});

  // ── PDF blob URL ───────────────────────────────────────────────────────────

  const pdfBlobUrl = useMemo(() => {
    if (!contract?.pdf_data) return null;
    try {
      let b64 = contract.pdf_data;
      const ci = b64.indexOf(",");
      if (ci !== -1) b64 = b64.slice(ci + 1);
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([arr], { type: "application/pdf" }));
    } catch { return null; }
  }, [contract?.pdf_data]);

  useEffect(() => {
    return () => { if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl); };
  }, [pdfBlobUrl]);

  // ── 載入合約 ───────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id,title,pdf_data,pdf_name,status,signed_at,signer_name,notes,tour:tours(name,destination),customer:customers(name)")
        .eq("sign_token", token)
        .single();
      if (error || !data) {
        setPageState("error");
        setErrMsg("找不到此合約，連結可能已失效或已過期");
        return;
      }
      setContract(data as unknown as SignContract);
      if (data.signer_name) setSignerName(data.signer_name as string);
      setPageState(data.status === "signed" ? "signed" : "pending");
    })();
  }, [token]);

  // ── 設置簽名畫布 ───────────────────────────────────────────────────────────

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth   = 2.8;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";

    const getPos = (e: TouchEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const t  = (e as TouchEvent).touches?.[0];
      const cx = t ? t.clientX : (e as MouseEvent).clientX;
      const cy = t ? t.clientY : (e as MouseEvent).clientY;
      return {
        x: (cx - rect.left) * (canvas.width  / rect.width),
        y: (cy - rect.top)  * (canvas.height / rect.height),
      };
    };

    const start = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      drawing.current = true;
      lastPos.current = getPos(e);
    };
    const move = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      if (!drawing.current || !lastPos.current) return;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPos.current = pos;
      hasDrawn.current = true;
    };
    const end = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      drawing.current = false;
      lastPos.current = null;
      if (hasDrawn.current) {
        onChangeRef.current(canvas.toDataURL("image/png"));
      }
    };

    canvas.addEventListener("mousedown",  start);
    canvas.addEventListener("mousemove",  move);
    canvas.addEventListener("mouseup",    end);
    canvas.addEventListener("mouseleave", end);
    canvas.addEventListener("touchstart", start,  { passive: false });
    canvas.addEventListener("touchmove",  move,   { passive: false });
    canvas.addEventListener("touchend",   end,    { passive: false });
    canvas.addEventListener("touchcancel",end,    { passive: false });

    return () => {
      canvas.removeEventListener("mousedown",  start);
      canvas.removeEventListener("mousemove",  move);
      canvas.removeEventListener("mouseup",    end);
      canvas.removeEventListener("mouseleave", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove",  move);
      canvas.removeEventListener("touchend",   end);
      canvas.removeEventListener("touchcancel",end);
    };
  }, []);

  useEffect(() => {
    onChangeRef.current = setSignatureData;
  }, []);

  useEffect(() => {
    if (pageState === "pending") return setupCanvas();
  }, [pageState, setupCanvas]);

  // ── 清除 ───────────────────────────────────────────────────────────────────

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    setSignatureData(null);
  };

  // ── 提交 ───────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!signerName.trim()) { alert("請輸入您的姓名"); return; }
    if (!signatureData)     { alert("請在下方空白處手寫簽名"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/contracts/sign", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signer_name: signerName.trim(), signature_image: signatureData }),
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
            <p className="text-sm text-slate-500">✈️ 出發團：{(contract.tour as { name: string }).name}</p>
          )}
          {contract?.signed_at && (
            <p className="text-sm text-emerald-600">
              {new Date(contract.signed_at).toLocaleString("zh-TW", {
                year: "numeric", month: "long", day: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}
        </div>
        <p className="text-xs text-slate-400">如有疑問請聯繫旅行社</p>
      </div>
    </div>
  );

  // ── Pending：顯示 PDF + 簽名表單 ──────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
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
              ✈️ 出發團：{(contract.tour as { name: string; destination?: string }).name}
              {(contract.tour as { destination?: string }).destination &&
                `（${(contract.tour as { destination?: string }).destination}）`}
            </p>
          )}
          {contract?.customer && (
            <p className="text-sm text-slate-500">
              👤 旅客：{(contract.customer as { name: string }).name}
            </p>
          )}
          {contract?.notes && (
            <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-2 mt-1">{contract.notes}</p>
          )}
        </div>

        {/* PDF 檢視 */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-700 text-sm">📄 合約內容</h2>
            <div className="flex items-center gap-2">
              {pdfBlobUrl && (
                <>
                  <a href={pdfBlobUrl} target="_blank" rel="noopener"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    另開視窗
                  </a>
                  <span className="text-slate-200">|</span>
                  <a href={pdfBlobUrl} download={contract?.pdf_name || "合約.pdf"}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Download className="w-3 h-3" /> 下載
                  </a>
                </>
              )}
            </div>
          </div>
          {pdfBlobUrl ? (
            <iframe
              src={pdfBlobUrl}
              className="w-full"
              style={{ height: "58vh", display: "block" }}
              title="合約 PDF"
            />
          ) : (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> PDF 載入中…
            </div>
          )}
        </div>

        {/* 簽名表單 */}
        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-5 space-y-5">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Pen className="w-4 h-4 text-blue-500" /> 電子簽名
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

          {/* 簽名畫布 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500">
                手寫簽名 <span className="text-red-400">*</span>
                <span className="ml-1 font-normal text-slate-400 text-[11px]">用手指在下方空白處簽名</span>
              </label>
              <button onClick={clearCanvas}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors py-1 px-2 rounded-lg hover:bg-red-50">
                <RotateCcw className="w-3.5 h-3.5" /> 清除重簽
              </button>
            </div>

            <div className={`rounded-2xl overflow-hidden border-2 transition-colors ${
              signatureData
                ? "border-emerald-300 bg-white"
                : "border-dashed border-slate-200 bg-slate-50"
            }`}>
              <canvas
                ref={canvasRef}
                width={720}
                height={240}
                className="w-full bg-white"
                style={{ touchAction: "none", display: "block", cursor: "crosshair" }}
              />
            </div>

            {!signatureData && (
              <p className="text-center text-xs text-slate-400 mt-2 flex items-center justify-center gap-1.5">
                <Pen className="w-3 h-3" /> 在上方框框內用手指簽下您的姓名
              </p>
            )}
          </div>

          {/* 確認按鈕 */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !signatureData || !signerName.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-4 rounded-2xl text-base transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> 送出中…</>
            ) : (
              <><CheckCircle2 className="w-5 h-5" /> 確認簽署</>
            )}
          </button>

          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            點擊「確認簽署」即表示本人確認已閱讀並同意以上合約全部條款，<br />
            此電子簽名具有法律效力。
          </p>
        </div>
      </div>
    </div>
  );
}
