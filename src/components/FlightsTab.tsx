"use client";
import { useEffect, useRef, useState } from "react";
import { supabase, TourFlight } from "@/lib/supabase";
import {
  Plane, Upload, ClipboardPaste, Loader2, Trash2, X,
  Save, FileText, CheckCircle, Pencil, Plus, ChevronDown, ChevronUp,
} from "lucide-react";

type ParsedFlight = Omit<TourFlight, "id" | "tour_id" | "created_at">;

const EMPTY_FLIGHT: ParsedFlight = {
  passenger_name: "", pnr: "", ticket_number: "", flight_number: "",
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
  { key: "ticket_number",     label: "票號",        width: "min-w-[120px] max-w-[160px]", mono: true },
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

export default function FlightsTab({ tourId }: { tourId: string }) {
  const [flights, setFlights]       = useState<TourFlight[]>([]);
  const [loading, setLoading]       = useState(true);

  // Input state
  const [inputMode, setInputMode]   = useState<"text" | "image" | "pdf" | null>(null);
  const [pasteText, setPasteText]   = useState("");
  const [parsing, setParsing]       = useState(false);
  const [parseError, setParseError] = useState("");
  const [preview, setPreview]       = useState<ParsedFlight[]>([]);
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
  useEffect(() => { load(); }, [tourId]);

  // ── parse helpers ─────────────────────────────────────────────────────────
  const callOcr = async (body: object) => {
    const res = await fetch("/api/ocr/flight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return (data.flights || []) as ParsedFlight[];
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
  const savePreview = async () => {
    if (preview.length === 0) return;
    setSaving(true);
    await supabase.from("tour_flights").insert(preview.map(f => ({ ...f, tour_id: tourId })));
    setPreview([]); setPasteText(""); setInputMode(null);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    await load(); setSaving(false);
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
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-blue-500" />
              <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">解析結果</span>
              <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">{preview.length} 個航段</span>
              <span className="text-xs text-slate-400">請確認後儲存，可直接在格子內修改</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setPreview([]); setInputMode(null); }}
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
