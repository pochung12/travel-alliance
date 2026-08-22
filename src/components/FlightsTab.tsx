"use client";
import { useEffect, useRef, useState } from "react";
import { supabase, TourFlight } from "@/lib/supabase";
import {
  Plane, Upload, ClipboardPaste, Loader2, Trash2, X,
  Save, FileText, CheckCircle, Pencil, Plus, ChevronDown, ChevronUp,
} from "lucide-react";
import FlightSummary from "@/components/FlightSummary";

type ParsedFlight = Omit<TourFlight, "id" | "tour_id" | "created_at">;

const EMPTY_FLIGHT: ParsedFlight = {
  passenger_name: "", pnr: "", ticket_number: "", ticket_number_return: "", flight_number: "",
  flight_date: "", departure_time: "", arrival_time: "",
  departure_airport: "", departure_terminal: "",
  arrival_airport: "", arrival_terminal: "",
  special_meal: "", notes: "",
};

const inp = "border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full";

// Compress image before sending
async function compressImg(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxPx = 2400;
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      res(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = rej;
    img.src = url;
  });
}

// Field definitions for the editable table
const FLIGHT_FIELDS: { key: keyof ParsedFlight; label: string; width: string; mono?: boolean }[] = [
  { key: "passenger_name",    label: "旅客姓名",   width: "min-w-[120px] max-w-[180px]" },
  { key: "pnr",               label: "PNR",        width: "min-w-[80px] max-w-[100px]",  mono: true },
  { key: "ticket_number",        label: "去程票號",    width: "min-w-[120px] max-w-[160px]", mono: true },
  { key: "ticket_number_return", label: "回程票號",    width: "min-w-[120px] max-w-[160px]", mono: true },
  { key: "flight_number",     label: "航班",        width: "min-w-[70px] max-w-[90px]",   mono: true },
  { key: "flight_date",       label: "日期",        width: "min-w-[100px] max-w-[120px]" },
  { key: "departure_time",    label: "出發",        width: "min-w-[60px] max-w-[75px]",   mono: true },
  { key: "departure_airport", label: "出發機場",    width: "min-w-[70px] max-w-[90px]",   mono: true },
  { key: "departure_terminal",label: "出發廈",      width: "min-w-[60px] max-w-[75px]" },
  { key: "arrival_time",      label: "到達",        width: "min-w-[60px] max-w-[75px]",   mono: true },
  { key: "arrival_airport",   label: "到達機場",    width: "min-w-[70px] max-w-[90px]",   mono: true },
  { key: "arrival_terminal",  label: "到達廈",      width: "min-w-[60px] max-w-[75px]" },
  { key: "special_meal",      label: "機上特別餐",  width: "min-w-[90px] max-w-[130px]" },
  { key: "notes",             label: "備註",        width: "min-w-[80px] max-w-[140px]" },
];

import { matchPassengers, PaxCandidate } from "@/lib/paxMatch";
import { mergeRows, splitAgainstExisting, expandToMembers } from "@/lib/flightDedupe";

export default function FlightsTab({ tourId }: { tourId: string }) {
  const [flights, setFlights]       = useState<TourFlight[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tourDates, setTourDates]   = useState<{ start?: string; end?: string }>({});

  // Input state
  const [inputMode, setInputMode]   = useState<"text" | "image" | "pdf" | null>(null);
  const [pasteText, setPasteText]   = useState("");
  const [parsing, setParsing]       = useState(false);
  const [parseError, setParseError] = useState("");
  const [preview, setPreview]       = useState<ParsedFlight[]>([]);
  const [parseSource, setParseSource] = useState<"gds_parser" | "agent_pnr_parser" | "ai" | null>(null);
  // 英文姓名 → 中文團員 自動對應
  const [members, setMembers] = useState<PaxCandidate[]>([]);
  const [allCustomers, setAllCustomers] = useState<PaxCandidate[]>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());   // 英文原名 → 中文
  const [nameUnmatched, setNameUnmatched] = useState<string[]>([]);
  const [inDbOnly, setInDbOnly] = useState<string[]>([]);                   // 客戶庫有、但不在本團
  const [mergedCount, setMergedCount] = useState(0);                        // 批內合併掉的重複筆數
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);

  // Inline edit
  const [editId, setEditId]         = useState<string | null>(null);
  const [editData, setEditData]     = useState<Partial<TourFlight>>({});

  // Manually add row
  const [addingManual, setAddingManual] = useState(false);
  const [manualRow, setManualRow]       = useState<ParsedFlight>({...EMPTY_FLIGHT});

  const imgRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  // ── load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tour_flights").select("*").eq("tour_id", tourId)
      .order("flight_date").order("departure_time");
    setFlights((data || []) as TourFlight[]);
    setLoading(false);
  };
  useEffect(() => {
    load();
    // 取團的出發/回程日，用來判斷航班屬於去程或回程
    supabase.from("customer_tours").select("customer:customers(name,name_en)").eq("tour_id", tourId)
      .then(({ data }) => {
        const rows = (data || []) as unknown as Array<{ customer: PaxCandidate | null }>;
        setMembers(rows.map(r => r.customer).filter(Boolean) as PaxCandidate[]);
      });
    supabase.from("customers").select("name,name_en")
      .then(({ data }) => setAllCustomers((data || []) as PaxCandidate[]));
    supabase.from("tours").select("start_date,end_date").eq("id", tourId).single()
      .then(({ data }) => {
        const t = data as { start_date?: string; end_date?: string } | null;
        if (t) setTourDates({ start: t.start_date, end: t.end_date });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId]);

  // ── parse helpers ─────────────────────────────────────────────────────────
  const callOcr = async (body: object) => {
    const res = await fetch("/api/ocr/flight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setParseSource(data.source ?? null);
    const named = applyNameMatch((data.flights || []) as ParsedFlight[]);
    const { rows, mergedCount } = mergeRows(named);
    setMergedCount(mergedCount);
    return rows;
  };

  /** 把 GDS 英文姓名換成本團團員的中文姓名（只換唯一命中的）*/
  const applyNameMatch = (list: ParsedFlight[]): ParsedFlight[] => {
    const names = list.map(f => f.passenger_name).filter(Boolean);
    if (names.length === 0 || members.length === 0) {
      setNameMap(new Map()); setNameUnmatched([]); setInDbOnly([]);
      return list;
    }
    const r = matchPassengers(names, members);
    // 本團找不到的，看看客戶資料庫有沒有（提示尚未加入本團）
    const rest = [...r.unmatched, ...r.ambiguous];
    const inDb = rest.length > 0 && allCustomers.length > 0
      ? Array.from(matchPassengers(rest, allCustomers).matched.keys())
      : [];
    setNameMap(r.matched);
    setNameUnmatched(r.unmatched);
    setInDbOnly(inDb);
    if (r.matched.size === 0) return list;
    return list.map(f => ({ ...f, passenger_name: r.matched.get(f.passenger_name) || f.passenger_name }));
  };

  /** 把「沒填旅客姓名」的全團航班展開成每位團員各一筆 */
  const expandAll = () => {
    const names = members.map(m => m.name).filter(Boolean) as string[];
    if (names.length === 0) { alert("本團還沒有團員，請先到旅客分頁加入團員"); return; }
    setPreview(prev => {
      const r = expandToMembers(prev, names);
      setMergedCount(0);
      return r.rows;
    });
  };

  /** 還原成原本的英文姓名 */
  const revertNames = () => {
    const rev = new Map(Array.from(nameMap.entries()).map(([en, zh]) => [zh, en]));
    setPreview(prev => prev.map(f => ({ ...f, passenger_name: rev.get(f.passenger_name) || f.passenger_name })));
    setNameMap(new Map());
  };

  const parseText = async () => {
    if (!pasteText.trim()) return;
    setParsing(true); setParseError("");
    try {
      setPreview(await callOcr({ text: pasteText }));
    } catch (e) { setParseError((e as Error).message); }
    setParsing(false);
  };

  const handleImageFile = async (file: File) => {
    setParsing(true); setParseError(""); setInputMode("image");
    try {
      const b64 = await compressImg(file);
      setPreview(await callOcr({ imageBase64: b64 }));
    } catch (e) { setParseError((e as Error).message); }
    setParsing(false);
  };

  const handlePdfFile = async (file: File) => {
    setParsing(true); setParseError(""); setInputMode("pdf");
    try {
      // Dynamically load pdfjs-dist
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const allFlights: ParsedFlight[] = [];
      const pagesToProcess = Math.min(pdf.numPages, 5);

      for (let p = 1; p <= pagesToProcess; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width; canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        const b64 = canvas.toDataURL("image/jpeg", 0.92);
        try {
          const parsed = await callOcr({ imageBase64: b64 });
          allFlights.push(...parsed);
        } catch { /* skip page if OCR fails */ }
      }

      // Deduplicate by flight_number + flight_date
      const seen = new Set<string>();
      setPreview(allFlights.filter(f => {
        const k = `${f.flight_number}:${f.flight_date}`;
        if (seen.has(k)) return false;
        seen.add(k); return true;
      }));
    } catch (e) { setParseError((e as Error).message); }
    setParsing(false);
  };

  // ── save preview ──────────────────────────────────────────────────────────
  const MIGRATION_SQL = `-- 在 Supabase SQL Editor 執行以下 SQL：
CREATE TABLE IF NOT EXISTS tour_flights (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id              UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  passenger_name       TEXT NOT NULL DEFAULT '',
  pnr                  TEXT NOT NULL DEFAULT '',
  ticket_number        TEXT NOT NULL DEFAULT '',
  ticket_number_return TEXT NOT NULL DEFAULT '',
  flight_number        TEXT NOT NULL DEFAULT '',
  flight_date          DATE,
  departure_time       TEXT NOT NULL DEFAULT '',
  arrival_time         TEXT NOT NULL DEFAULT '',
  departure_airport    TEXT NOT NULL DEFAULT '',
  departure_terminal   TEXT NOT NULL DEFAULT '',
  arrival_airport      TEXT NOT NULL DEFAULT '',
  arrival_terminal     TEXT NOT NULL DEFAULT '',
  special_meal         TEXT NOT NULL DEFAULT '',
  notes                TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tour_flights_tour_id ON tour_flights(tour_id);
-- 若資料表已存在但缺少欄位，補執行：
ALTER TABLE tour_flights ADD COLUMN IF NOT EXISTS special_meal TEXT NOT NULL DEFAULT '';
ALTER TABLE tour_flights ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE tour_flights ADD COLUMN IF NOT EXISTS ticket_number_return TEXT NOT NULL DEFAULT '';
ALTER TABLE tour_flights ADD COLUMN IF NOT EXISTS departure_terminal TEXT NOT NULL DEFAULT '';
ALTER TABLE tour_flights ADD COLUMN IF NOT EXISTS arrival_terminal TEXT NOT NULL DEFAULT '';`;

  const savePreview = async () => {
    if (preview.length === 0) return;
    setSaving(true);
    // 與資料庫既有紀錄比對：已存在的只補空白欄位，不重複新增
    const { toInsert, toUpdate, unchanged } = splitAgainstExisting(preview, flights);
    let error = null as { code?: string; message?: string } | null;
    if (toInsert.length > 0) {
      const res = await supabase.from("tour_flights")
        .insert(toInsert.map(f => ({ ...f, tour_id: tourId })));
      error = res.error;
    }
    if (!error) {
      for (const u of toUpdate) {
        const res = await supabase.from("tour_flights").update(u.patch).eq("id", u.id);
        if (res.error) { error = res.error; break; }
      }
    }
    setSaving(false);
    if (!error && (toUpdate.length > 0 || unchanged > 0)) {
      alert(`匯入完成\n\n新增 ${toInsert.length} 筆\n更新既有 ${toUpdate.length} 筆（只補空白欄位，不覆蓋你已填的內容）\n完全相同略過 ${unchanged} 筆`);
    }
    if (error) {
      const isMissingTable = error.code === "42P01" || error.message?.includes("does not exist");
      if (isMissingTable) {
        alert("儲存失敗：tour_flights 資料表不存在。\n\n請到 Supabase Dashboard → SQL Editor，貼上以下 SQL 建立資料表後再試：\n\n" + MIGRATION_SQL);
      } else {
        alert("儲存失敗：" + error.message);
      }
      return;
    }
    setPreview([]); setPasteText(""); setInputMode(null);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    await load();
  };

  // ── delete ────────────────────────────────────────────────────────────────
  const deleteFlight = async (fid: string) => {
    if (!confirm("刪除此航班記錄？")) return;
    await supabase.from("tour_flights").delete().eq("id", fid);
    setFlights(prev => prev.filter(f => f.id !== fid));
  };

  // ── save edit ──────────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editId) return;
    await supabase.from("tour_flights").update(editData).eq("id", editId);
    setFlights(prev => prev.map(f => f.id === editId ? { ...f, ...editData } : f));
    setEditId(null); setEditData({});
  };

  // ── add manual row ────────────────────────────────────────────────────────
  const saveManual = async () => {
    await supabase.from("tour_flights").insert({ ...manualRow, tour_id: tourId });
    setManualRow({ ...EMPTY_FLIGHT }); setAddingManual(false);
    await load();
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── 航班總覽（去程／回程大字）── */}
      {!loading && (
        <FlightSummary flights={flights} tourId={tourId} startDate={tourDates.start} endDate={tourDates.end} onUpdated={load} />
      )}

      {/* ── Input section ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
          <Plane className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">匯入機票資訊</span>
          <span className="text-xs text-slate-400">選擇輸入方式，AI 自動解析</span>
        </div>

        {/* Mode buttons */}
        <div className="px-5 py-4 flex flex-wrap gap-2">
          <button onClick={() => setInputMode(inputMode==="text" ? null : "text")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              inputMode==="text" ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            }`}>
            <ClipboardPaste className="w-4 h-4" /> 貼上文字
          </button>
          <button onClick={() => { imgRef.current?.click(); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              inputMode==="image" ? "bg-amber-500 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            }`}>
            <Upload className="w-4 h-4" /> 上傳圖檔
          </button>
          <button onClick={() => { pdfRef.current?.click(); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              inputMode==="pdf" ? "bg-rose-500 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            }`}>
            <FileText className="w-4 h-4" /> 匯入 PDF
          </button>
          <input ref={imgRef} type="file" accept="image/*" className="hidden"
            onChange={e => e.target.files?.[0] && handleImageFile(e.target.files[0])} />
          <input ref={pdfRef} type="file" accept=".pdf" className="hidden"
            onChange={e => e.target.files?.[0] && handlePdfFile(e.target.files[0])} />
        </div>

        {/* Text input area */}
        {inputMode === "text" && (
          <div className="px-5 pb-4 space-y-2">
            <textarea
              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none h-40 font-mono placeholder:text-slate-400 placeholder:font-sans"
              placeholder="在此貼上訂位確認信或開票資訊的文字（支援各種格式，包括 e-ticket、itinerary 等）…"
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
            />
            <div className="flex gap-2 items-center">
              <button onClick={parseText} disabled={parsing || !pasteText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-40 transition-colors">
                {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plane className="w-4 h-4" />}
                {parsing ? "解析中…" : "AI 解析"}
              </button>
              {parseError && <span className="text-xs text-red-500">{parseError}</span>}
            </div>
          </div>
        )}

        {/* Loading indicator for image/pdf */}
        {(inputMode === "image" || inputMode === "pdf") && parsing && (
          <div className="px-5 pb-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            {inputMode === "pdf" ? "正在解析 PDF 頁面，請稍候…" : "AI 辨識圖片中…"}
          </div>
        )}
        {(inputMode === "image" || inputMode === "pdf") && !parsing && parseError && (
          <div className="px-5 pb-4 text-xs text-red-500">{parseError}</div>
        )}
      </div>

      {/* ── Preview (parsed flights, not yet saved) ── */}
      {preview.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border-2 border-blue-200 dark:border-blue-800/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-blue-100 dark:border-blue-800/40 flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircle className="w-4 h-4 text-blue-500" />
              <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">解析結果</span>
              <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">{preview.length} 筆</span>
              {(parseSource === "gds_parser" || parseSource === "agent_pnr_parser") && (
                <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">✓ GDS 精確解析</span>
              )}
              {parseSource === "ai" && (
                <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">AI 解析</span>
              )}
              {mergedCount > 0 && (
                <span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full">
                  已整合 {mergedCount} 筆重複
                </span>
              )}
              <span className="text-xs text-slate-400">請確認後儲存，可直接在格子內修改</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setPreview([]); setInputMode(null); setParseSource(null); setNameMap(new Map()); setNameUnmatched([]); setInDbOnly([]); setMergedCount(0); }}
                className="text-xs px-3 py-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                <X className="w-3.5 h-3.5 inline mr-1" />捨棄
              </button>
              <button onClick={savePreview} disabled={saving}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "儲存中…" : "儲存到資料庫"}
              </button>
            </div>
          </div>
          {/* 沒填旅客姓名的航班 → 可展開成每位團員各一筆 */}
          {preview.some(f => !(f.passenger_name || "").trim()) && (
            <div className="px-5 py-2.5 border-b border-blue-100 dark:border-blue-800/40 bg-amber-50/70 dark:bg-amber-900/15 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-amber-700 dark:text-amber-300">
                有 {preview.filter(f => !(f.passenger_name || "").trim()).length} 筆沒有旅客姓名（＝全團共用航班）
              </span>
              <button onClick={expandAll} disabled={members.length === 0}
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white transition-colors">
                展開給每位團員（{members.length} 位）
              </button>
              <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80">
                已有個人資料的旅客不會被覆蓋
              </span>
            </div>
          )}

          {/* 英文姓名 → 中文團員 自動對應結果 */}
          {(nameMap.size > 0 || nameUnmatched.length > 0) && (
            <div className="px-5 py-2.5 border-b border-blue-100 dark:border-blue-800/40 bg-slate-50/70 dark:bg-slate-700/30 space-y-1.5">
              {nameMap.size > 0 && (
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5">
                    ✓ 已對應團員（{nameMap.size} 位）
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {Array.from(nameMap.entries()).map(([en, zh]) => (
                      <span key={en} className="text-[10px] bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                        <span className="font-mono opacity-70">{en}</span> → <span className="font-bold">{zh}</span>
                      </span>
                    ))}
                  </span>
                  <button onClick={revertNames}
                    className="ml-auto text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline shrink-0">
                    還原英文姓名
                  </button>
                </div>
              )}
              {nameUnmatched.length > 0 && (
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                    ⚠ 本團名單找不到（{nameUnmatched.length} 位，維持英文名）
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {nameUnmatched.map(n => (
                      <span key={n} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        inDbOnly.includes(n)
                          ? "bg-sky-50 dark:bg-sky-900/25 text-sky-700 dark:text-sky-300"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"}`}>
                        {n}{inDbOnly.includes(n) && " ·客戶庫有"}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {inDbOnly.length > 0 && (
                <p className="text-[10px] text-sky-600 dark:text-sky-400">
                  標「客戶庫有」的 {inDbOnly.length} 位在旅客 CRM 找得到，但還沒加入本團——先到旅客分頁把他們加入，再重新解析就會自動對應。
                </p>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="text-xs w-full min-w-max">
              <thead className="bg-blue-50/50 dark:bg-blue-900/10 text-slate-500 dark:text-slate-400 uppercase text-[10px]">
                <tr>
                  {FLIGHT_FIELDS.map(f => (
                    <th key={f.key} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{f.label}</th>
                  ))}
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {preview.map((flight, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                    {FLIGHT_FIELDS.map(f => (
                      <td key={f.key} className={`px-2 py-1.5 ${f.width}`}>
                        <input
                          className={`${inp} ${f.mono ? "font-mono" : ""}`}
                          value={(flight as Record<string,string>)[f.key] || ""}
                          onChange={e => setPreview(prev => prev.map((p, i) =>
                            i === idx ? { ...p, [f.key]: e.target.value } : p
                          ))}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center">
                      <button onClick={() => setPreview(prev => prev.filter((_, i) => i !== idx))}
                        className="text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Existing flights table ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">機票紀錄</span>
            {flights.length > 0 && (
              <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">{flights.length} 筆</span>
            )}
            {saved && <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" />已儲存</span>}
          </div>
          <button onClick={() => { setAddingManual(!addingManual); setManualRow({...EMPTY_FLIGHT}); }}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> 手動新增
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs w-full min-w-max">
              <thead className="bg-slate-50 dark:bg-slate-700/40 text-slate-500 dark:text-slate-400 uppercase text-[10px]">
                <tr>
                  {FLIGHT_FIELDS.map(f => (
                    <th key={f.key} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{f.label}</th>
                  ))}
                  <th className="px-2 py-2 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {/* Manual add row */}
                {addingManual && (
                  <tr className="bg-emerald-50/40 dark:bg-emerald-900/10">
                    {FLIGHT_FIELDS.map(f => (
                      <td key={f.key} className={`px-2 py-1.5 ${f.width}`}>
                        <input
                          className={`${inp} ${f.mono ? "font-mono" : ""}`}
                          placeholder={f.label}
                          value={(manualRow as Record<string,string>)[f.key] || ""}
                          onChange={e => setManualRow(prev => ({ ...prev, [f.key]: e.target.value }))}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1">
                        <button onClick={saveManual} title="儲存"
                          className="p-1 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded transition-colors">
                          <Save className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setAddingManual(false)} title="取消"
                          className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {flights.length === 0 && !addingManual ? (
                  <tr>
                    <td colSpan={FLIGHT_FIELDS.length + 1} className="py-12 text-center text-slate-400">
                      尚無機票紀錄，請使用上方匯入功能
                    </td>
                  </tr>
                ) : (
                  flights.map(f => (
                    <tr key={f.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors">
                      {FLIGHT_FIELDS.map(field => (
                        <td key={field.key} className={`px-2 py-2 ${field.width}`}>
                          {editId === f.id ? (
                            <input
                              className={`${inp} ${field.mono ? "font-mono" : ""}`}
                              value={((editData as unknown as Record<string,string>)[field.key] ?? (f as unknown as Record<string,string>)[field.key]) || ""}
                              onChange={e => setEditData(prev => ({ ...prev, [field.key]: e.target.value }))}
                            />
                          ) : (
                            <span className={`${field.mono ? "font-mono" : ""} text-slate-700 dark:text-slate-200 ${
                              !((f as unknown as Record<string,string>)[field.key]) ? "text-slate-300 dark:text-slate-600" : ""
                            }`}>
                              {(f as unknown as Record<string,string>)[field.key] || "—"}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          {editId === f.id ? (
                            <>
                              <button onClick={saveEdit} title="儲存"
                                className="p-1 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded transition-colors">
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => { setEditId(null); setEditData({}); }} title="取消"
                                className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setEditId(f.id); setEditData({}); }} title="編輯"
                                className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteFlight(f.id)} title="刪除"
                                className="p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
