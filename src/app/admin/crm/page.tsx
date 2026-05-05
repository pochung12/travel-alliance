"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Customer } from "@/lib/supabase";
import {
  Plus, Search, Users, ScanLine, Upload, Loader2,
  CheckCircle, AlertCircle, X, FileUp, ClipboardPaste,
  ChevronDown, ChevronUp, TableProperties,
} from "lucide-react";
import Link from "next/link";

// ─── types ───────────────────────────────────────────────────────────────────
type DocType = "passport" | "taibao" | "idCard";
type ScanStatus = "idle" | "scanning" | "done" | "error";
type ImportMode = "paste" | "csv";
type ImportStep = "input" | "map" | "preview";

interface OcrResult {
  name?: string | null;
  nameEn?: string | null;
  passport?: string | null;
  passportExpiry?: string | null;
  taibaoNumber?: string | null;
  taibaoExpiry?: string | null;
  birthday?: string | null;
  gender?: "male" | "female" | null;
  idNumber?: string | null;
}

// CRM 欄位定義
const CRM_FIELDS: { key: keyof typeof EMPTY; label: string }[] = [
  { key: "name",               label: "姓名 *" },
  { key: "name_en",            label: "英文姓名" },
  { key: "phone",              label: "電話" },
  { key: "email",              label: "Email" },
  { key: "birthday",           label: "生日 (YYYY-MM-DD)" },
  { key: "gender",             label: "性別 (male/female/other)" },
  { key: "id_number",          label: "身分證字號" },
  { key: "passport",           label: "護照號碼" },
  { key: "passport_expiry",    label: "護照效期 (YYYY-MM-DD)" },
  { key: "taibao_number",      label: "台胞證號碼" },
  { key: "taibao_expiry",      label: "台胞證效期 (YYYY-MM-DD)" },
  { key: "address",            label: "地址" },
  { key: "emergency_contact",  label: "緊急聯絡人" },
  { key: "emergency_phone",    label: "緊急聯絡電話" },
  { key: "notes",              label: "備註" },
];

// 自動辨識關鍵字對應
const AUTO_MAP: Record<string, string> = {
  // name
  "姓名": "name", "名字": "name", "旅客": "name", "旅客姓名": "name",
  "客人": "name", "姓名（中文）": "name", "中文姓名": "name",
  // name_en
  "英文": "name_en", "英文姓名": "name_en", "拼音": "name_en",
  "英文名": "name_en", "romanized": "name_en", "english name": "name_en",
  // phone
  "電話": "phone", "手機": "phone", "聯絡電話": "phone",
  "電話號碼": "phone", "mobile": "phone", "tel": "phone", "phone": "phone",
  // email
  "email": "email", "e-mail": "email", "信箱": "email",
  "電子信箱": "email", "電子郵件": "email",
  // birthday
  "生日": "birthday", "出生日期": "birthday", "出生年月日": "birthday",
  "birthday": "birthday", "dob": "birthday", "birth date": "birthday",
  "出生": "birthday",
  // gender
  "性別": "gender", "gender": "gender", "sex": "gender",
  // id_number
  "身分證": "id_number", "身份證": "id_number", "身分證字號": "id_number",
  "id": "id_number", "證號": "id_number",
  // passport
  "護照": "passport", "護照號碼": "passport", "passport": "passport",
  "passport no": "passport", "護照號": "passport",
  // passport_expiry
  "護照效期": "passport_expiry", "護照到期": "passport_expiry",
  "passport expiry": "passport_expiry", "效期": "passport_expiry",
  "護照期限": "passport_expiry",
  // taibao
  "台胞證": "taibao_number", "台胞證號碼": "taibao_number",
  "台胞": "taibao_number", "台胞號": "taibao_number",
  // taibao_expiry
  "台胞證效期": "taibao_expiry", "台胞效期": "taibao_expiry",
  // address
  "地址": "address", "住址": "address", "address": "address",
  // emergency_contact
  "緊急聯絡人": "emergency_contact", "緊急聯絡": "emergency_contact",
  "emergency contact": "emergency_contact", "emergency": "emergency_contact",
  // emergency_phone
  "緊急電話": "emergency_phone", "緊急聯絡電話": "emergency_phone",
  "emergency phone": "emergency_phone",
  // notes
  "備註": "notes", "備注": "notes", "notes": "notes",
  "remarks": "notes", "note": "notes", "說明": "notes",
};

function autoMapHeader(h: string): string {
  const lower = h.trim().toLowerCase();
  return AUTO_MAP[h.trim()] || AUTO_MAP[lower] || "__skip__";
}

// 性別正規化
function normalizeGender(v: string): Customer["gender"] {
  const s = v.trim().toLowerCase();
  if (["男", "m", "male"].includes(s)) return "male";
  if (["女", "f", "female"].includes(s)) return "female";
  return "other";
}

// 解析 TSV / CSV
function parseTable(raw: string, sep: string): string[][] {
  return raw
    .split(/\r?\n/)
    .filter(l => l.trim())
    .map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, "")));
}

// ─── helpers ─────────────────────────────────────────────────────────────────
async function compressImage(file: File, maxPx = 1200, quality = 0.88): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── constants ───────────────────────────────────────────────────────────────
const EMPTY: Omit<Customer, "id" | "created_at"> = {
  name: "", name_en: "", phone: "", email: "", id_number: "",
  passport: "", passport_expiry: "", passport_image: "",
  taibao_number: "", taibao_expiry: "", taibao_image: "",
  birthday: "", gender: "other", address: "",
  emergency_contact: "", emergency_phone: "", notes: "",
};

const input = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
const lbl = "block text-xs font-medium text-slate-500 mb-1";

// ─── component ───────────────────────────────────────────────────────────────
export default function CRMPage() {
  const router = useRouter();

  // list state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // manual-create modal
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  // scan-to-create modal
  const [showScan, setShowScan] = useState(false);
  const [docType, setDocType] = useState<DocType>("passport");
  const [scanImg, setScanImg] = useState<string>("");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scanError, setScanError] = useState("");
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [scanForm, setScanForm] = useState({ ...EMPTY });
  const [duplicates, setDuplicates] = useState<Customer[]>([]);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // import modal
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("paste");
  const [importStep, setImportStep] = useState<ImportStep>("input");
  const [pasteText, setPasteText] = useState("");
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [colMap, setColMap] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; skip: number } | null>(null);
  const csvImportRef = useRef<HTMLInputElement>(null);

  // ── load ────────────────────────────────────────────────────────────────
  const load = async () => {
    const { data } = await supabase
      .from("customers").select("*").order("created_at", { ascending: false });
    setCustomers(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = customers.filter(c =>
    c.name.includes(search) || c.phone.includes(search) || c.email.includes(search)
  );

  // ── manual create ───────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.name.trim()) return alert("請填寫姓名");
    setSaving(true);
    const payload = {
      ...form,
      birthday: form.birthday || null,
      passport_expiry: form.passport_expiry || null,
      taibao_expiry: form.taibao_expiry || null,
    };
    const { error } = await supabase.from("customers").insert([payload]);
    setSaving(false);
    if (error) { alert("建立失敗：" + error.message); return; }
    setShowModal(false);
    setForm({ ...EMPTY });
    load();
  };

  // ── scan ────────────────────────────────────────────────────────────────
  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setScanStatus("scanning");
    setScanError("");
    setOcrResult(null);
    setDuplicates([]);
    try {
      const b64 = await compressImage(file);
      setScanImg(b64);
      const res = await fetch("/api/ocr/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, docType }),
      });
      const json: OcrResult & { error?: string } = await res.json();
      if (json.error) throw new Error(json.error);
      setOcrResult(json);
      const preForm: typeof EMPTY = { ...EMPTY };
      preForm.name = json.name ?? "";
      preForm.name_en = json.nameEn ?? "";
      preForm.birthday = json.birthday ?? "";
      preForm.gender = (json.gender as Customer["gender"]) ?? "other";
      if (docType === "passport") {
        preForm.passport = json.passport ?? "";
        preForm.passport_expiry = json.passportExpiry ?? "";
        preForm.passport_image = b64;
      } else if (docType === "taibao") {
        preForm.taibao_number = json.taibaoNumber ?? "";
        preForm.taibao_expiry = json.taibaoExpiry ?? "";
        preForm.taibao_image = b64;
      } else {
        preForm.id_number = json.idNumber ?? "";
        preForm.id_card_image = b64;
      }
      setScanForm(preForm);
      if (json.name) {
        const { data: dups } = await supabase
          .from("customers").select("id,name,phone,birthday")
          .ilike("name", json.name.trim());
        setDuplicates(dups || []);
      }
      setScanStatus("done");
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : "OCR 失敗，請重試");
      setScanStatus("error");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleScanCreate = async () => {
    if (!scanForm.name.trim()) return alert("請確認姓名欄位");
    setCreating(true);
    const payload = {
      ...scanForm,
      birthday: scanForm.birthday || null,
      passport_expiry: scanForm.passport_expiry || null,
      taibao_expiry: scanForm.taibao_expiry || null,
    };
    const { data, error } = await supabase
      .from("customers").insert([payload]).select("id").single();
    setCreating(false);
    if (error) { alert("建立失敗：" + error.message); return; }
    closeScan();
    router.push(`/admin/crm/${data.id}`);
  };

  const handleMerge = async (existingId: string) => {
    setCreating(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};
    if (docType === "passport") {
      if (scanForm.passport) updates.passport = scanForm.passport;
      if (scanForm.passport_expiry) updates.passport_expiry = scanForm.passport_expiry || null;
      if (scanForm.passport_image) updates.passport_image = scanForm.passport_image;
    } else if (docType === "taibao") {
      if (scanForm.taibao_number) updates.taibao_number = scanForm.taibao_number;
      if (scanForm.taibao_expiry) updates.taibao_expiry = scanForm.taibao_expiry || null;
      if (scanForm.taibao_image) updates.taibao_image = scanForm.taibao_image;
    } else {
      if (scanForm.id_number) updates.id_number = scanForm.id_number;
      if (scanForm.id_card_image) updates.id_card_image = scanForm.id_card_image;
    }
    if (scanForm.name_en) updates.name_en = scanForm.name_en;
    if (scanForm.birthday) updates.birthday = scanForm.birthday || null;
    await supabase.from("customers").update(updates).eq("id", existingId);
    setCreating(false);
    closeScan();
    router.push(`/admin/crm/${existingId}`);
  };

  const closeScan = () => {
    setShowScan(false);
    setScanImg(""); setScanStatus("idle"); setScanError("");
    setOcrResult(null); setScanForm({ ...EMPTY });
    setDuplicates([]); setDocType("passport");
  };

  // ── import ──────────────────────────────────────────────────────────────
  const closeImport = () => {
    setShowImport(false);
    setImportStep("input");
    setPasteText("");
    setRawRows([]); setHeaders([]); setColMap([]);
    setImportResult(null);
    setImportMode("paste");
  };

  const parsePaste = () => {
    const text = pasteText.trim();
    if (!text) return alert("請先貼上資料");
    // auto-detect separator: TSV or CSV
    const sep = text.split("\n")[0].includes("\t") ? "\t" : ",";
    const rows = parseTable(text, sep);
    if (rows.length < 2) return alert("至少需要 1 行標題 + 1 行資料");
    const hdrs = rows[0];
    const mapped = hdrs.map(h => autoMapHeader(h));
    setHeaders(hdrs);
    setRawRows(rows.slice(1));
    setColMap(mapped);
    setImportStep("map");
  };

  const parseCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || "";
      const sep = text.split("\n")[0].includes("\t") ? "\t" : ",";
      const rows = parseTable(text, sep);
      if (rows.length < 2) return alert("至少需要 1 行標題 + 1 行資料");
      const hdrs = rows[0];
      const mapped = hdrs.map(h => autoMapHeader(h));
      setHeaders(hdrs);
      setRawRows(rows.slice(1));
      setColMap(mapped);
      setImportStep("map");
    };
    reader.readAsText(file, "UTF-8");
  };

  const doImport = async () => {
    // Build payloads from colMap
    if (!colMap.some(c => c === "name")) {
      return alert("請確認有對應「姓名」欄位，姓名為必填");
    }
    setImporting(true);
    const payloads = rawRows.map(row => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj: Record<string, any> = { ...EMPTY };
      colMap.forEach((field, i) => {
        if (field === "__skip__") return;
        const val = row[i]?.trim() || "";
        if (field === "gender") {
          obj[field] = normalizeGender(val);
        } else if (["birthday", "passport_expiry", "taibao_expiry"].includes(field)) {
          obj[field] = val || null;
        } else {
          obj[field] = val;
        }
      });
      return obj;
    }).filter(p => p.name); // skip rows without name

    let ok = 0;
    let skip = 0;
    // Batch insert in chunks of 50
    for (let i = 0; i < payloads.length; i += 50) {
      const chunk = payloads.slice(i, i + 50);
      const { error } = await supabase.from("customers").insert(chunk);
      if (error) {
        skip += chunk.length;
      } else {
        ok += chunk.length;
      }
    }
    setImporting(false);
    setImportResult({ ok, skip });
    load(); // refresh list
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">
      {/* header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Users className="w-6 h-6 text-violet-600" />
          旅客 CRM
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <TableProperties className="w-4 h-4" />
            匯入名單
          </button>
          <button
            onClick={() => setShowScan(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <ScanLine className="w-4 h-4" />
            掃描證件建檔
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" />
            新增旅客
          </button>
        </div>
      </div>

      {/* search */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="搜尋姓名、雺（、雺（、Email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            {search ? "沒有符合的旅客" : "尚無旅客，點右上角新增或掃描證件"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">姓名</th>
                <th className="text-left px-4 py-3">電話</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">護照號碼</th>
                <th className="text-left px-4 py-3">生日</th>
                <th className="text-left px-4 py-3">加入時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/admin/crm/${c.id}`} className="font-medium text-violet-600 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{c.email || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{c.passport || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{c.birthday || "—"}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(c.created_at).toLocaleDateString("zh-TW")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          IMPORT MODAL
          ══════════════════════════════════════════════════════════════════════ */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            {/* header */}
            <div className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-white flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <TableProperties className="w-5 h-5 text-blue-600" />
                匯入旅客名單
                {importStep === "map" && <span className="text-sm font-normal text-slate-400 ml-1">— 設定欄位對應</span>}
                {importStep === "preview" && <span className="text-sm font-normal text-slate-400 ml-1">— 確認匯入</span>}
              </h2>
              <button onClick={closeImport} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* ── STEP 1: 輸入資料 ── */}
              {importStep === "input" && (
                <>
                  {/* mode tabs */}
                  <div className="flex gap-2 border-b border-slate-100 pb-4">
                    <button
                      onClick={() => setImportMode("paste")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${importMode === "paste" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                      <ClipboardPaste className="w-4 h-4" />
                      貼上試算表
                    </button>
                    <button
                      onClick={() => setImportMode("csv")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${importMode === "csv" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                      <FileUp className="w-4 h-4" />
                      上傳 CSV 檔
                    </button>
                  </div>

                  {importMode === "paste" && (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-500">
                        在 Google Sheets 選取含標題列的範圍 → <kbd className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">Ctrl+C</kbd>，
                        然後點下方文字框貼上 <kbd className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">Ctrl+V</kbd>
                      </p>
                      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700">
                        💡 第一列必須是欄位名稱（如：姓名、電話、Email…），系統會自動辨識
                      </div>
                      <textarea
                        className="w-full h-52 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                        placeholder={"姓名\t電話\tEmail\t生日\n王小明\t0912345678\twang@example.com\t1990-01-01\n李大華\t0923456789\tlee@example.com\t1985-06-15"}
                        value={pasteText}
                        onChange={e => setPasteText(e.target.value)}
                      />
                      <button
                        onClick={parsePaste}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">
                        下一步：設定欄位對應 →
                      </button>
                    </div>
                  )}

                  {importMode === "csv" && (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-500">
                        在 Google Sheets 點「檔案 → 下載 → CSV」，然後上傳該檔案
                      </p>
                      <input
                        ref={csvImportRef}
                        type="file"
                        accept=".csv,"tsv,.txt"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) parseCSV(f);
                        }}
                      />
                      <div
                        onClick={() => csvImportRef.current?.click()}
                        className="border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl py-12 flex flex-col items-center gap-2 text-slate-400 cursor-pointer transition-colors">
                        <FileUp className="w-8 h-8" />
                        <span className="text-sm">點擊上傳 CSV 檔案</span>
                        <span className="text-xs">支援 .csv / .tsv</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── STEP 2: 欄位對應 ── */}
              {importStep === "map" && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">
                    系統已自動辨識以下欄位對應，請確認或手動調整。選「跳過」代表該欄不匯入。
                  </p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs">
                        <tr>
                          <th className="text-left px-4 py-2 w-1/3">試算表欄位</th>
                          <th className="text-left px-4 py-2 w-8">→</th>
                          <th className="text-left px-4 py-2">對應 CRM 欄位</th>
                          <th className="text-left px-4 py-2 text-slate-400">範例資料</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {headers.map((h, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-700">{h}</td>
                            <td className="px-4 py-2 text-slate-300">→</td>
                            <td className="px-4 py-2">
                              <select
                                className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={colMap[i] || "__skip__"}
                                onChange={e => {
                                  const next = [...colMap];
                                  next[i] = e.target.value;
                                  setColMap(next);
                                }}>
                                <option value="__skip__">── 跳過 ──</option>
                                {CRM_FIELDS.map(f => (
                                  <option key={f.key} value={f.key}>{f.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-2 text-slate-400 text-xs font-mono truncate max-w-[120px]">
                              {rawRows[0]?.[i] || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setImportStep("input")}
                      className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                      ← 返回
                    </button>
                    <button
                      onClick={() => setImportStep("preview")}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">
                      下一步：預覽資料 →
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: 預覽 & 確認 ── */}
              {importStep === "preview" && (
                <div className="space-y-4">
                  {importResult ? (
                    /* ── 完成畫面 ── */
                    <div className="text-center py-8 space-y-4">
                      <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
                      <div>
                        <p className="text-xl font-bold text-slate-800">匯入完成！</p>
                        <p className="text-sm text-slate-500 mt-1">
                          成功新增 <span className="text-emerald-600 font-bold">{importResult.ok}</span> 位旅客
                          {importResult.skip > 0 && <>，跳過 <span className="text-red-500 font-bold">{importResult.skip}</span> 筆（重複或錯誤）</>}
                        </p>
                      </div>
                      <button
                        onClick={closeImport}
                        className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg">
                        關閉
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-600">
                          共 <span className="font-bold text-blue-600">{rawRows.length}</span> 筆資料，
                          預覽前 5 筆：
                        </p>
                        <span className="text-xs text-slate-400">（無姓名的列會自動略過）</span>
                      </div>
                      <div className="border border-slate-200 rounded-xl overflow-x-auto">
                        <table className="text-xs w-full min-w-[500px]">
                          <thead className="bg-slate-50 text-slate-500">
                            <tr>
                              {colMap.map((field, i) => field !== "__skip__" && (
                                <th key={i} className="text-left px-3 py-2 whitespace-nowrap">
                                  {CRM_FIELDS.find(f => f.key === field)?.label || field}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {rawRows.slice(0, 5).map((row, ri) => (
                              <tr key={ri} className="hover:bg-slate-50">
                                {colMap.map((field, ci) => field !== "__skip__" && (
                                  <td key={ci} className="px-3 py-2 text-slate-700 truncate max-w-[150px]">
                                    {row[ci] || "—"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {rawRows.length > 5 && (
                        <p className="text-xs text-slate-400 text-center">
                          …還有 {rawRows.length - 5} 筆資料
                        </p>
                      )}
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
                        ⚠️ 匯入不會自動跳過重複旅客，請確認資料後再執行。
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setImportStep("map")}
                          className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                          ← 返回修改
                        </button>
                        <button
                          onClick={doImport}
                          disabled={importing}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50 flex items-center gap-2">
                          {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                          {importing ? "匯入中…" : `✓ 確認匯入 ${rawRows.length} 筆`}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MANUAL CREATE MODAL
          ══════════════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-white flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">新增旅客</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Field label="姓名 *">
                    <input className={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="真實姓名" />
                  </Field>
                </div>
                <Field label="性別">
                  <select className={input} value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value as Customer["gender"] })}>
                    <option value="male">男</option>
                    <option value="female">女</option>
                    <option value="other">其他</option>
                  </select>
                </Field>
                <Field label="生日">
                  <input type="date" className={input} value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })} />
                </Field>
                <Field label="電話">
                  <input className={input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="09xx-xxx-xxx" />
                </Field>
                <Field label="Email">
                  <input type="email" className={input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label="身分證字號">
                  <input className={input} value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} placeholder="A123456789" />
                </Field>
                <Field label="護照號碼">
                  <input className={input} value={form.passport} onChange={e => setForm({ ...form, passport: e.target.value })} placeholder="A12345678" />
                </Field>
                <div className="col-span-2">
                  <Field label="地址">
                    <input className={input} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                  </Field>
                </div>
                <Field label="緊急聯絡人">
                  <input className={input} value={form.emergency_contact} onChange={e => setForm({ ...form, emergency_contact: e.target.value })} placeholder="姓名" />
                </Field>
                <Field label="緊急聯絡電話">
                  <input className={input} value={form.emergency_phone} onChange={e => setForm({ ...form, emergency_phone: e.target.value })} />
                </Field>
                <div className="col-span-2">
                  <Field label="備註">
                    <textarea className={input + " h-16 resize-none"} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                  </Field>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              <button onClick={handleCreate} disabled={saving} className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50">
                {saving ? "建立中…" : "建立"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SCAN-TO-CREATE MODAL
          ══════════════════════════════════════════════════════════════════════ */}
      {showScan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            {/* header */}
            <div className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-white flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-emerald-600" />
                掃描證件快速建檔
              </h2>
              <button onClick={closeScan} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              {/* doc type toggle */}
              <div>
                <label className={lbl}>證件類型</label>
                <div className="flex gap-2">
                  {([
                    ["passport", "🛂 護照"], ["idCard", "🪪 身分證"], ["taibao", "🏮 台胞證"]
                  ] as [DocType, string][]).map(([v, label]) => (
                    <button key={v} onClick={() => { setDocType(v); setScanStatus("idle"); setScanImg(""); setOcrResult(null); }}
                      className={`flex-1 py-2 text-sm rounded-lg border transition-colors font-medium ${docType === v ? "bg-emerald-600 text-white border-emerald-600" : "text-slate-600 border-slate-200 hover:border-emerald-400"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* upload zone */}
              <div>
                <label className={lbl}>上傳證件照片</label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                <div onClick={() => fileRef.current?.click()} onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                  className={`relative border-2 border-dashed rounded-xl cursor-pointer transition-colors ${scanStatus === "scanning" ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30"}`}>
                  {scanImg ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={scanImg} alt="證件預覽" className="w-full max-h-52 object-contain rounded-xl" />
                      {scanStatus === "scanning" && (
                        <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-white animate-spin" />
                          <span className="text-white ml-2 text-sm font-medium">AI 辨識中…</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-10 flex flex-col items-center gap-2 text-slate-400">
                      <Upload className="w-8 h-8" />
                      <span className="text-sm">點擊或拖曳證件照片到此處</span>
                      <span className="text-xs">支援 JPG / PNG / HEIC</span>
                    </div>
                  )}
                </div>
                {scanStatus === "done" && (
                  <p className="mt-2 text-sm text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" /> 辨識完成，請確認下方資料
                  </p>
                )}
                {scanStatus === "error" && (
                  <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> {scanError}
                  </p>
                )}
              </div>
              {/* OCR result form */}
              {scanStatus === "done" && (
                <>
                  {duplicates.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                      <p className="font-semibold mb-2">⚠️ 資料庫中已有疑似相同旅客，是否要合併證件資料？</p>
                      {duplicates.map(d => (
                        <div key={d.id} className="flex items-center justify-between py-2 border-b border-amber-100 last:border-0">
                          <div className="flex items-center gap-2">
                            <Link href={`/admin/crm/${d.id}`} target="_blank" className="text-violet-600 hover:underline font-medium">{d.name}</Link>
                            <span className="text-amber-700 text-xs">{d.phone} · {d.birthday}</span>
                          </div>
                          <button onClick={() => handleMerge(d.id)} disabled={creating}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                            {creating && <Loader2 className="w-3 h-3 animate-spin" />}
                            合併到此旅客
                          </button>
                        </div>
                      ))}
                      <p className="mt-2 text-amber-600 text-xs">若確認是全新旅客，請忽略提示並點「建立旅客」。</p>
                    </div>
                  )}
                  <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">辨識結果（可編輯）</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className={lbl}>中文姓名 *</label>
                        <input className={input} value={scanForm.name} onChange={e => setScanForm({ ...scanForm, name: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <label className={lbl}>英文拼音姓名</label>
                        <input className={input} value={scanForm.name_en} onChange={e => setScanForm({ ...scanForm, name_en: e.target.value })} />
                      </div>
                      <div>
                        <label className={lbl}>性別</label>
                        <select className={input} value={scanForm.gender} onChange={e => setScanForm({ ...scanForm, gender: e.target.value as Customer["gender"] })}>
                          <option value="male">男</option>
                          <option value="female">女</option>
                          <option value="other">其他</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>生日</label>
                        <input type="date" className={input} value={scanForm.birthday} onChange={e => setScanForm({ ...scanForm, birthday: e.target.value })} />
                      </div>
                      {docType === "passport" ? (<>
                        <div>
                          <label className={lbl}>護照號碼</label>
                          <input className={input} value={scanForm.passport} onChange={e => setScanForm({ ...scanForm, passport: e.target.value })} />
                        </div>
                        <div>
                          <label className={lbl}>護照效期</label>
                          <input type="date" className={input} value={scanForm.passport_expiry} onChange={e => setScanForm({ ...scanForm, passport_expiry: e.target.value })} />
                        </div>
                      </>) : docType === "taibao" ? (<>
                        <div>
                          <label className={lbl}>台胞證號碼</label>
                          <input className={input} value={scanForm.taibao_number} onChange={e => setScanForm({ ...scanForm, taibao_number: e.target.value })} />
                        </div>
                        <div>
                          <label className={lbl}>台胞證效期</label>
                          <input type="date" className={input} value={scanForm.taibao_expiry} onChange={e => setScanForm({ ...scanForm, taibao_expiry: e.target.value })} />
                        </div>
                      </>) : (<>
                        <div className="col-span-2">
                          <label className={lbl}>身分證字號</label>
                          <input className={input} value={scanForm.id_number} onChange={e => setScanForm({ ...scanForm, id_number: e.target.value })} placeholder="A123456789" />
                        </div>
                      </>)}
                      <div>
                        <label className={lbl}>電話（可補填）</label>
                        <input className={input} value={scanForm.phone} onChange={e => setScanForm({ ...scanForm, phone: e.target.value })} placeholder="09xx-xxx-xxx" />
                      </div>
                      <div>
                        <label className={lbl}>Email（可補填）</label>
                        <input type="email" className={input} value={scanForm.email} onChange={e => setScanForm({ ...scanForm, email: e.target.value })} />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* footer */}
            <div className="px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white flex items-center justify-between gap-3">
              <button onClick={() => { setScanStatus("idle"); setScanImg(""); setOcrResult(null); setDuplicates([]); }}
                className="text-sm text-slate-500 hover:text-slate-700 underline">
                重新上傳
              </button>
              <div className="flex gap-2">
                <button onClick={closeScan} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
                {scanStatus === "done" && (
                  <button onClick={handleScanCreate} disabled={creating || !scanForm.name.trim()}
                    className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                    {creating ? "建立中…" : "✓ 建立旅客"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
