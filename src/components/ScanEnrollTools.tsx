"use client";
import { useRef, useState } from "react";
import { supabase, Customer } from "@/lib/supabase";
import {
  ScanLine, Layers, Loader2, X, CheckCircle2, AlertCircle, Upload, UserPlus,
} from "lucide-react";

type DocType = "passport" | "taibao" | "idCard";
type ScanStatus = "idle" | "scanning" | "done" | "error";

interface OcrResult {
  name?: string | null; nameEn?: string | null;
  passport?: string | null; passportExpiry?: string | null;
  taibaoNumber?: string | null; taibaoExpiry?: string | null;
  birthday?: string | null; gender?: "male" | "female" | null;
  idNumber?: string | null; docType?: string | null;
}
type CustForm = Omit<Customer, "id" | "created_at">;
interface BulkItem {
  uid: string; preview: string;
  status: "pending" | "scanning" | "done" | "error";
  ocr: OcrResult | null; form: CustForm;
  error: string; selected: boolean;
}

const EMPTY: CustForm = {
  name: "", name_en: "", phone: "", email: "",
  id_number: "", id_card_image: "", passport: "", passport_expiry: "", passport_image: "",
  taibao_number: "", taibao_expiry: "", taibao_image: "",
  birthday: "", gender: "other",
  address: "", emergency_contact: "", emergency_phone: "", notes: "",
  meal_preference: "",
};

// ── helpers ───────────────────────────────────────────────────────────────────
async function compressImage(file: File, maxPx = 2400, quality = 0.92): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("圖片讀取失敗")); };
    img.src = url;
  });
}
// 以 canvas 將 base64 圖片順時針旋轉
function rotateBase64(b64: string, deg: 90 | 180 | 270): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      if (deg === 180) { cv.width = img.width; cv.height = img.height; }
      else { cv.width = img.height; cv.height = img.width; }
      const ctx = cv.getContext("2d")!;
      ctx.translate(cv.width / 2, cv.height / 2);
      ctx.rotate(deg * Math.PI / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(cv.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => resolve(b64);
    img.src = b64;
  });
}
// 掃描前先讓 AI 判斷方向並自動轉正，提高辨識率（失敗則沿用原圖）
async function autoOrient(b64: string): Promise<string> {
  try {
    const res = await fetch("/api/ocr/orientation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: b64 }),
    });
    const r: { rotation?: number; error?: string } = await res.json();
    if (r.error || !r.rotation) return b64;
    return await rotateBase64(b64, r.rotation as 90 | 180 | 270);
  } catch { return b64; }
}

function sanitizeGender(g: unknown): Customer["gender"] {
  const s = String(g ?? "").trim().toLowerCase();
  if (s === "male" || s === "m" || s === "男") return "male";
  if (s === "female" || s === "f" || s === "女") return "female";
  return "other";
}
function sanitizeDate(d: unknown): string {
  if (!d) return "";
  const s = String(d).trim().replace(/(\d{4})[年./](\d{1,2})[月./](\d{1,2})日?/, "$1-$2-$3");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return "";
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return isNaN(Date.parse(iso)) ? "" : iso;
}
function buildFormFromOcr(ocr: OcrResult, imageB64: string): CustForm {
  const form = { ...EMPTY };
  form.name     = ocr.name   ?? "";
  form.name_en  = ocr.nameEn ?? "";
  form.birthday = sanitizeDate(ocr.birthday);
  form.gender   = sanitizeGender(ocr.gender);
  const dt = ocr.docType;
  if (dt === "passport") {
    form.passport        = ocr.passport ?? "";
    form.passport_expiry = sanitizeDate(ocr.passportExpiry);
    form.passport_image  = imageB64;
    if (ocr.idNumber) form.id_number = ocr.idNumber;
  } else if (dt === "taibao") {
    form.taibao_number = ocr.taibaoNumber ?? "";
    form.taibao_expiry = sanitizeDate(ocr.taibaoExpiry);
    form.taibao_image  = imageB64;
  } else {
    form.id_number     = ocr.idNumber ?? "";
    form.id_card_image = imageB64;
  }
  return form;
}
const toPayload = (f: CustForm) => ({
  ...f,
  gender: sanitizeGender(f.gender),
  birthday: sanitizeDate(f.birthday) || null,
  passport_expiry: sanitizeDate(f.passport_expiry) || null,
  taibao_expiry: sanitizeDate(f.taibao_expiry) || null,
});

interface Props {
  tourId: string;
  enrolledIds: string[];           // 已在本團的 customer_id
  onDone: () => void;              // 完成後重新載入旅客清單
}

export default function ScanEnrollTools({ tourId, enrolledIds, onDone }: Props) {
  // 單張
  const [showScan, setShowScan]     = useState(false);
  const [docType, setDocType]       = useState<DocType>("passport");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scanErr, setScanErr]       = useState("");
  const [scanForm, setScanForm]     = useState<CustForm>({ ...EMPTY });
  const [scanImg, setScanImg]       = useState("");
  const [matched, setMatched]       = useState<Customer | null>(null);
  const [saving, setSaving]         = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 批量
  const [showBulk, setShowBulk]         = useState(false);
  const [items, setItems]               = useState<BulkItem[]>([]);
  const [bulkProcessing, setBulkProc]   = useState(false);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkDone, setBulkDone]         = useState<{ created: number; enrolled: number } | null>(null);
  const bulkRef = useRef<HTMLInputElement>(null);

  // ── 找出既有旅客（證件號優先，其次姓名+生日）避免重複建檔 ───────────────────
  const findExisting = async (f: CustForm): Promise<Customer | null> => {
    if (f.passport?.trim()) {
      const { data } = await supabase.from("customers").select("*").eq("passport", f.passport.trim()).limit(1);
      if (data?.[0]) return data[0] as Customer;
    }
    if (f.taibao_number?.trim()) {
      const { data } = await supabase.from("customers").select("*").eq("taibao_number", f.taibao_number.trim()).limit(1);
      if (data?.[0]) return data[0] as Customer;
    }
    if (f.id_number?.trim()) {
      const { data } = await supabase.from("customers").select("*").eq("id_number", f.id_number.trim()).limit(1);
      if (data?.[0]) return data[0] as Customer;
    }
    if (f.name?.trim()) {
      let q = supabase.from("customers").select("*").eq("name", f.name.trim());
      if (sanitizeDate(f.birthday)) q = q.eq("birthday", sanitizeDate(f.birthday));
      const { data } = await q.limit(1);
      if (data?.[0]) return data[0] as Customer;
    }
    return null;
  };

  // 只補上既有旅客缺的證件資料（不覆蓋已填內容）
  const mergeIntoExisting = async (existing: Customer, f: CustForm) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const up: Record<string, any> = {};
    if (f.passport && !existing.passport)             up.passport = f.passport;
    if (f.passport_expiry && !existing.passport_expiry) up.passport_expiry = sanitizeDate(f.passport_expiry) || null;
    if (f.passport_image && !existing.passport_image) up.passport_image = f.passport_image;
    if (f.taibao_number && !existing.taibao_number)   up.taibao_number = f.taibao_number;
    if (f.taibao_expiry && !existing.taibao_expiry)   up.taibao_expiry = sanitizeDate(f.taibao_expiry) || null;
    if (f.taibao_image && !existing.taibao_image)     up.taibao_image = f.taibao_image;
    if (f.id_number && !existing.id_number)           up.id_number = f.id_number;
    if (f.id_card_image && !existing.id_card_image)   up.id_card_image = f.id_card_image;
    if (f.name_en && !existing.name_en)               up.name_en = f.name_en;
    if (f.birthday && !existing.birthday)             up.birthday = sanitizeDate(f.birthday) || null;
    if (Object.keys(up).length) await supabase.from("customers").update(up).eq("id", existing.id);
  };

  // 建立 customer_tours（自動標註為本團旅客），已在團內則略過
  const enroll = async (customerIds: string[], mealByCust: Record<string, string> = {}) => {
    const fresh = customerIds.filter(cid => !enrolledIds.includes(cid));
    if (fresh.length === 0) return 0;
    const rows = fresh.map(cid => ({
      customer_id: cid, tour_id: tourId, status: "registered",
      paid_amount: 0, deposit_amount: 0, balance_amount: 0,
      participant_type: "adult", notes: "", room_number: "",
      meal_preference: mealByCust[cid] || "",
    }));
    const { error } = await supabase.from("customer_tours").insert(rows);
    if (error) { alert("加入本團失敗：" + error.message); return 0; }
    return fresh.length;
  };

  // ── 單張掃描 ────────────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setScanStatus("scanning"); setScanErr(""); setMatched(null);
    try {
      const b64 = await autoOrient(await compressImage(file));  // AI 自動轉正
      setScanImg(b64);
      const res = await fetch("/api/ocr/document", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, docType }),
      });
      const json: OcrResult & { error?: string } = await res.json();
      if (json.error) throw new Error(json.error);
      const f = buildFormFromOcr({ ...json, docType }, b64);
      setScanForm(f);
      setMatched(await findExisting(f));
      setScanStatus("done");
    } catch (e: unknown) {
      setScanErr(e instanceof Error ? e.message : "辨識失敗，請重試");
      setScanStatus("error");
    }
  };

  const saveScan = async () => {
    if (!scanForm.name.trim()) { alert("請確認姓名欄位"); return; }
    setSaving(true);
    let cid = matched?.id;
    if (matched) {
      await mergeIntoExisting(matched, scanForm);
    } else {
      const { data, error } = await supabase.from("customers").insert([toPayload(scanForm)]).select("id").single();
      if (error || !data) { setSaving(false); alert("建立失敗：" + (error?.message || "")); return; }
      cid = data.id;
    }
    const n = await enroll([cid!], { [cid!]: scanForm.meal_preference || "" });
    setSaving(false);
    closeScan();
    onDone();
    alert(matched
      ? (n ? `已將既有旅客「${scanForm.name}」加入本團` : `旅客「${scanForm.name}」已在本團中（證件資料已更新）`)
      : `已建檔並加入本團：${scanForm.name}`);
  };

  const closeScan = () => {
    setShowScan(false); setScanStatus("idle"); setScanErr("");
    setScanForm({ ...EMPTY }); setScanImg(""); setMatched(null); setDocType("passport");
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── 批量掃描 ────────────────────────────────────────────────────────────────
  const handleBulkFiles = async (fl: FileList) => {
    const files: File[] = [];
    for (let i = 0; i < fl.length; i++) if (fl[i].type.startsWith("image/")) files.push(fl[i]);
    if (!files.length) return;
    setBulkProc(true);
    const init: BulkItem[] = await Promise.all(files.map(async (f, i) => ({
      uid: `b-${Date.now()}-${i}`, preview: await compressImage(f, 300, 0.7),
      status: "pending" as const, ocr: null, form: { ...EMPTY }, error: "", selected: true,
    })));
    setItems(init);
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const idx = next++;
        setItems(p => p.map((it, i) => i === idx ? { ...it, status: "scanning" } : it));
        try {
          const b64 = await autoOrient(await compressImage(files[idx], 2400, 0.92));  // AI 自動轉正
          const res = await fetch("/api/ocr/document", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: b64, docType: "auto" }),
          });
          const ocr: OcrResult & { error?: string } = await res.json();
          if (ocr.error) throw new Error(ocr.error);
          setItems(p => p.map((it, i) => i === idx ? { ...it, status: "done", ocr, form: buildFormFromOcr(ocr, b64) } : it));
        } catch (e: unknown) {
          setItems(p => p.map((it, i) => i === idx ? { ...it, status: "error", error: e instanceof Error ? e.message : "辨識失敗" } : it));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));
    setBulkProc(false);
  };

  const runBulkCreate = async () => {
    const list = items.filter(it => it.selected && it.status === "done" && it.form.name.trim());
    if (!list.length) { alert("沒有可建立的旅客（請確認姓名已辨識）"); return; }
    setBulkCreating(true);
    const ids: string[] = [];
    let created = 0;
    const meals: Record<string, string> = {};
    for (const it of list) {
      const exist = await findExisting(it.form);
      if (exist) {
        await mergeIntoExisting(exist, it.form);
        ids.push(exist.id);
      } else {
        const { data, error } = await supabase.from("customers").insert([toPayload(it.form)]).select("id").single();
        if (error || !data) continue;
        ids.push(data.id); created++;
      }
    }
    const enrolled = await enroll(ids, meals);
    setBulkCreating(false);
    setBulkDone({ created, enrolled });
    onDone();
  };

  const closeBulk = () => {
    setShowBulk(false); setItems([]); setBulkProc(false); setBulkCreating(false); setBulkDone(null);
    if (bulkRef.current) bulkRef.current.value = "";
  };

  const okCount = items.filter(it => it.selected && it.status === "done" && it.form.name.trim()).length;
  const inp = "w-full text-xs border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <>
      <button onClick={() => setShowBulk(true)}
        className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs md:text-sm px-3 py-2 rounded-lg transition-colors">
        <Layers className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">批量掃描建檔</span><span className="sm:hidden">批量掃描</span>
      </button>
      <button onClick={() => setShowScan(true)}
        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm px-3 py-2 rounded-lg transition-colors">
        <ScanLine className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">掃描證件建檔</span><span className="sm:hidden">掃描</span>
      </button>

      {/* ── 單張掃描 ── */}
      {showScan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeScan}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800 rounded-t-2xl">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-emerald-600" /> 掃描證件建檔
                <span className="text-[11px] font-normal text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">自動加入本團</span>
              </h3>
              <button onClick={closeScan} className="p-1 text-slate-400 hover:text-slate-600 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* 證件類型 */}
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-0.5 rounded-lg">
                {([["passport", "護照"], ["taibao", "台胞證"], ["idCard", "身分證"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setDocType(k)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${docType === k ? "bg-white dark:bg-slate-600 text-emerald-700 dark:text-white shadow-sm" : "text-slate-500"}`}>
                    {l}
                  </button>
                ))}
              </div>

              {scanStatus === "idle" || scanStatus === "error" ? (
                <>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 py-12 border-2 border-dashed border-emerald-300 dark:border-emerald-700 rounded-xl hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors">
                    <Upload className="w-8 h-8 text-emerald-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">點此選擇證件照片</span>
                    <span className="text-xs text-slate-400">AI 自動辨識姓名、證件號碼、效期</span>
                  </button>
                  {scanErr && <p className="flex items-center gap-1.5 text-xs text-red-500"><AlertCircle className="w-3.5 h-3.5" /> {scanErr}</p>}
                </>
              ) : scanStatus === "scanning" ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                  <span className="text-sm text-slate-500">AI 辨識中…</span>
                </div>
              ) : (
                <>
                  {matched && (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                      找到既有旅客「{matched.name}」——將<strong>直接加入本團</strong>並補齊缺少的證件資料（不會重複建檔）。
                    </div>
                  )}
                  {scanImg && <img src={scanImg} alt="" className="w-full max-h-40 object-contain rounded-lg border border-slate-200 dark:border-slate-600" />}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div><label className="text-[11px] text-slate-400">中文姓名 *</label><input className={inp} value={scanForm.name} onChange={e => setScanForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div><label className="text-[11px] text-slate-400">英文姓名</label><input className={inp} value={scanForm.name_en} onChange={e => setScanForm(f => ({ ...f, name_en: e.target.value }))} /></div>
                    <div><label className="text-[11px] text-slate-400">生日</label><input className={inp} value={scanForm.birthday} onChange={e => setScanForm(f => ({ ...f, birthday: e.target.value }))} placeholder="YYYY-MM-DD" /></div>
                    <div><label className="text-[11px] text-slate-400">電話</label><input className={inp} value={scanForm.phone} onChange={e => setScanForm(f => ({ ...f, phone: e.target.value }))} /></div>
                    {docType === "passport" && (<>
                      <div><label className="text-[11px] text-slate-400">護照號碼</label><input className={inp} value={scanForm.passport} onChange={e => setScanForm(f => ({ ...f, passport: e.target.value }))} /></div>
                      <div><label className="text-[11px] text-slate-400">護照效期</label><input className={inp} value={scanForm.passport_expiry} onChange={e => setScanForm(f => ({ ...f, passport_expiry: e.target.value }))} /></div>
                    </>)}
                    {docType === "taibao" && (<>
                      <div><label className="text-[11px] text-slate-400">台胞證號碼</label><input className={inp} value={scanForm.taibao_number} onChange={e => setScanForm(f => ({ ...f, taibao_number: e.target.value }))} /></div>
                      <div><label className="text-[11px] text-slate-400">台胞證效期</label><input className={inp} value={scanForm.taibao_expiry} onChange={e => setScanForm(f => ({ ...f, taibao_expiry: e.target.value }))} /></div>
                    </>)}
                    {docType === "idCard" && (
                      <div className="col-span-2"><label className="text-[11px] text-slate-400">身分證字號</label><input className={inp} value={scanForm.id_number} onChange={e => setScanForm(f => ({ ...f, id_number: e.target.value }))} /></div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setScanStatus("idle"); setScanImg(""); setMatched(null); }}
                      className="px-4 py-2.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm hover:bg-slate-50 dark:hover:bg-slate-700">重掃</button>
                    <button onClick={saveScan} disabled={saving}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 transition-colors">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      {matched ? "加入本團" : "建檔並加入本團"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 批量掃描 ── */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeBulk}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-500" />
                {bulkDone ? "批量建檔完成" : `批量掃描建檔${items.length ? `（${items.length} 張）` : ""}`}
                {!bulkDone && <span className="text-[11px] font-normal text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">自動加入本團</span>}
              </h3>
              <button onClick={closeBulk} className="p-1 text-slate-400 hover:text-slate-600 rounded"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {bulkDone ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    新建檔 <strong className="text-emerald-600">{bulkDone.created}</strong> 位・
                    加入本團 <strong className="text-emerald-600">{bulkDone.enrolled}</strong> 位
                  </p>
                  <button onClick={closeBulk} className="mt-5 bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl text-sm font-medium">完成</button>
                </div>
              ) : items.length === 0 ? (
                <>
                  <input ref={bulkRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { if (e.target.files) handleBulkFiles(e.target.files); }} />
                  <button onClick={() => bulkRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 py-16 border-2 border-dashed border-amber-300 dark:border-amber-700 rounded-xl hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors">
                    <Upload className="w-9 h-9 text-amber-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">一次選擇多張證件照片</span>
                    <span className="text-xs text-slate-400">AI 自動判斷證件類型並辨識，建檔後直接加入本團</span>
                  </button>
                </>
              ) : (
                <div className="space-y-2">
                  {bulkProcessing && (
                    <p className="text-xs text-amber-600 flex items-center gap-1.5 mb-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      辨識中… {items.filter(it => it.status === "done" || it.status === "error").length}/{items.length}
                    </p>
                  )}
                  {items.map((it, idx) => (
                    <div key={it.uid} className={`flex gap-3 items-start rounded-xl border p-2.5 ${
                      it.status === "error" ? "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10" : "border-slate-200 dark:border-slate-600"
                    }`}>
                      <input type="checkbox" checked={it.selected} disabled={it.status !== "done"}
                        onChange={() => setItems(p => p.map((x, i) => i === idx ? { ...x, selected: !x.selected } : x))}
                        className="mt-8 w-4 h-4 accent-emerald-600 shrink-0" />
                      <img src={it.preview} alt="" className="w-20 h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        {it.status === "pending" || it.status === "scanning" ? (
                          <div className="flex items-center gap-2 text-xs text-slate-400 py-6">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {it.status === "scanning" ? "辨識中…" : "等待中…"}
                          </div>
                        ) : it.status === "error" ? (
                          <p className="text-xs text-red-500 py-6">{it.error}</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-1.5">
                            <div><label className="text-[10px] text-slate-400">姓名 *</label>
                              <input className={inp} value={it.form.name}
                                onChange={e => setItems(p => p.map((x, i) => i === idx ? { ...x, form: { ...x.form, name: e.target.value } } : x))} /></div>
                            <div><label className="text-[10px] text-slate-400">英文姓名</label>
                              <input className={inp} value={it.form.name_en}
                                onChange={e => setItems(p => p.map((x, i) => i === idx ? { ...x, form: { ...x.form, name_en: e.target.value } } : x))} /></div>
                            <div><label className="text-[10px] text-slate-400">生日</label>
                              <input className={inp} value={it.form.birthday}
                                onChange={e => setItems(p => p.map((x, i) => i === idx ? { ...x, form: { ...x.form, birthday: e.target.value } } : x))} /></div>
                            <div><label className="text-[10px] text-slate-400">
                              {it.form.passport ? "護照號碼" : it.form.taibao_number ? "台胞證號碼" : "身分證字號"}</label>
                              <input className={inp}
                                value={it.form.passport || it.form.taibao_number || it.form.id_number}
                                onChange={e => setItems(p => p.map((x, i) => {
                                  if (i !== idx) return x;
                                  const k = x.form.passport ? "passport" : x.form.taibao_number ? "taibao_number" : "id_number";
                                  return { ...x, form: { ...x.form, [k]: e.target.value } };
                                }))} /></div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!bulkDone && items.length > 0 && (
              <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3 shrink-0">
                <span className="text-xs text-slate-500">已辨識 <strong>{okCount}</strong> 筆可建立（重複者自動加入既有旅客）</span>
                <button onClick={runBulkCreate} disabled={bulkCreating || bulkProcessing || okCount === 0}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2 rounded-xl disabled:opacity-40 transition-colors">
                  {bulkCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {bulkCreating ? "建立中…" : `建檔並加入本團（${okCount}）`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
