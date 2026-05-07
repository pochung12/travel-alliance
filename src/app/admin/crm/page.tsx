"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Customer, Tour } from "@/lib/supabase";
import {
  Plus, Search, Users, ScanLine, Upload, FileSpreadsheet,
  Loader2, CheckCircle, AlertCircle, X, Settings, Tag, Trash2, CheckCircle2, Layers,
  GitMerge, ChevronRight,
} from "lucide-react";
import Link from "next/link";

// ─── types ───────────────────────────────────────────────────────────────────
type DocType = "passport" | "taibao" | "idCard";
type ScanStatus = "idle" | "scanning" | "done" | "error";

interface CrmLabel { id: string; name: string; color: string; }

interface OcrResult {
  name?: string | null; nameEn?: string | null;
  passport?: string | null; passportExpiry?: string | null;
  taibaoNumber?: string | null; taibaoExpiry?: string | null;
  birthday?: string | null; gender?: "male" | "female" | null;
  idNumber?: string | null; docType?: string | null;
}

interface DupGroup {
  id: string;
  reasons: string[];
  customers: [Customer, Customer];
  selected: boolean;
  keepId: string;
  fieldChoices: Record<string, 'a' | 'b' | 'clear'>;
}

interface BulkItem {
  uid: string; preview: string;
  status: "pending" | "scanning" | "done" | "error";
  detectedType: string | null; ocr: OcrResult | null;
  form: Omit<Customer, "id" | "created_at">;
  error: string; selected: boolean;
}

interface ImportRow {
  rowIndex: number;
  data: Partial<Omit<Customer, "id" | "created_at">>;
  errors: string[]; isDuplicate: boolean;
}
interface ColDef { key: string; label: string; width: number; visible: boolean; }

// ─── constants ────────────────────────────────────────────────────────────────
const EMPTY: Omit<Customer, "id" | "created_at"> = {
  name: "", name_en: "", phone: "", email: "",
  id_number: "", id_card_image: "", passport: "", passport_expiry: "", passport_image: "",
  taibao_number: "", taibao_expiry: "", taibao_image: "",
  birthday: "", gender: "other",
  address: "", emergency_contact: "", emergency_phone: "", notes: "",
  meal_preference: "",
};

const input = "w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-400";
const lbl   = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";

const LABEL_COLORS = [
  "#ef4444","#f97316","#eab308","#22c55e","#06b6d4",
  "#6366f1","#8b5cf6","#ec4899","#64748b","#0ea5e9",
];

// ─── Traditional → Simplified Chinese character map ──────────────────────────
const T2S: Record<string,string> = {
  // Common surnames
  '陳':'陈','張':'张','劉':'刘','楊':'杨','趙':'赵','吳':'吴','孫':'孙','馬':'马',
  '鄭':'郑','盧':'卢','謝':'谢','許':'许','韓':'韩','鄧':'邓','蕭':'萧','馮':'冯',
  '蔣':'蒋','錢':'钱','葉':'叶','龔':'龚','蘇':'苏','嚴':'严','龍':'龙','鐘':'钟',
  '賴':'赖','歐':'欧','區':'区','莊':'庄','呂':'吕','顏':'颜','顧':'顾','龐':'庞',
  '陸':'陆','簡':'简','關':'关','繆':'缪','鄒':'邹','鄔':'邬','鮑':'鲍','齊':'齐',
  '魏':'魏','薛':'薛','賀':'贺','賈':'贾','駱':'骆','鞏':'巩','鄺':'邝','覃':'覃',
  // Common given name characters
  '國':'国','華':'华','學':'学','軍':'军','東':'东','麗':'丽','鳳':'凤','偉':'伟',
  '慶':'庆','愛':'爱','賢':'贤','輝':'辉','強':'强','興':'兴','維':'维','穎':'颖',
  '瑩':'莹','躍':'跃','凱':'凯','騰':'腾','鵬':'鹏','曉':'晓','藝':'艺','歡':'欢',
  '億':'亿','燁':'烨','濤':'涛','駿':'骏','嫻':'娴','聰':'聪','藍':'蓝','蘭':'兰',
  '詩':'诗','雲':'云','鴻':'鸿','銘':'铭','寶':'宝','鋒':'锋','錦':'锦','禎':'祯',
  '傳':'传','遠':'远','實':'实','達':'达','貴':'贵','義':'义','開':'开','長':'长',
  '鄉':'乡','靜':'静','獻':'献','廣':'广','豐':'丰','應':'应','總':'总','經':'经',
  '電':'电','數':'数','業':'业','動':'动','當':'当','現':'现','發':'发','來':'来',
  '問':'问','員':'员','語':'语','級':'级','進':'进','這':'这','書':'书','產':'产',
  '設':'设','構':'构','號':'号','讓':'让','點':'点','線':'线','幾':'几','歲':'岁',
  '輕':'轻','過':'过','還':'还','說':'说','後':'后','看':'看','機':'机','帶':'带',
  '會':'会','對':'对','樣':'样','給':'给','話':'话','錯':'错','親':'亲',
  '頭':'头','門':'门','邊':'边','塊':'块','種':'种','風':'风','歷':'历',
};
function normalizeChineseName(name: string): string {
  return name.trim().split('').map(ch => T2S[ch] ?? ch).join('').toLowerCase();
}
// ─── Merge field definitions ─────────────────────────────────────────────────
const MERGE_FIELD_DEFS: {
  key: keyof Omit<Customer,'id'|'created_at'>;
  label: string;
  linked?: keyof Omit<Customer,'id'|'created_at'>;
}[] = [
  { key:'name',              label:'姓名' },
  { key:'name_en',           label:'英文姓名' },
  { key:'phone',             label:'電話' },
  { key:'email',             label:'Email' },
  { key:'birthday',          label:'生日' },
  { key:'id_number',         label:'身分證字號',   linked:'id_card_image' },
  { key:'passport',          label:'護照號碼',     linked:'passport_image' },
  { key:'passport_expiry',   label:'護照效期' },
  { key:'taibao_number',     label:'台胞證號碼',   linked:'taibao_image' },
  { key:'taibao_expiry',     label:'台胞證效期' },
  { key:'address',           label:'地址' },
  { key:'emergency_contact', label:'緊急聯絡人' },
  { key:'emergency_phone',   label:'緊急電話' },
  { key:'notes',             label:'備註' },
];
function buildDefaultChoices(side: 'a'|'b'): Record<string,'a'|'b'|'clear'> {
  const c: Record<string,'a'|'b'|'clear'> = {};
  for (const fd of MERGE_FIELD_DEFS) {
    c[fd.key] = side;
    if (fd.linked) c[fd.linked] = side;
  }
  c['gender'] = side;
  return c;
}

// Generate a stable pastel color from a tour ID string
const TOUR_TAG_COLORS = [
  { bg:"#dbeafe", text:"#1e40af" }, // blue
  { bg:"#d1fae5", text:"#065f46" }, // emerald
  { bg:"#fce7f3", text:"#9d174d" }, // pink
  { bg:"#ede9fe", text:"#4c1d95" }, // violet
  { bg:"#fef3c7", text:"#92400e" }, // amber
  { bg:"#ffedd5", text:"#9a3412" }, // orange
  { bg:"#cffafe", text:"#164e63" }, // cyan
  { bg:"#f0fdf4", text:"#14532d" }, // green
  { bg:"#fdf4ff", text:"#701a75" }, // fuchsia
  { bg:"#fff7ed", text:"#7c2d12" }, // red-orange
];
function tourTagColor(tourId: string) {
  let hash = 0;
  for (let i = 0; i < tourId.length; i++) hash = (hash * 31 + tourId.charCodeAt(i)) & 0xffffffff;
  return TOUR_TAG_COLORS[Math.abs(hash) % TOUR_TAG_COLORS.length];
}

const MEAL_OPTIONS_CRM = [
  { key: "蛋奶素", bg: "#ecfccb", text: "#4d7c0f" },
  { key: "全素",   bg: "#dcfce7", text: "#166534" },
  { key: "不吃羊", bg: "#ffedd5", text: "#c2410c" },
  { key: "不吃牛", bg: "#ffe4e6", text: "#be123c" },
  { key: "不吃豬", bg: "#e0f2fe", text: "#0369a1" },
];

const ALL_COLS: ColDef[] = [
  { key: "name",              label: "姓名",       width: 180, visible: true  },
  { key: "name_en",           label: "英文姓名",   width: 160, visible: false },
  { key: "gender",            label: "性別",       width: 80,  visible: false },
  { key: "birthday",          label: "生日",       width: 120, visible: true  },
  { key: "phone",             label: "電話",       width: 140, visible: true  },
  { key: "email",             label: "Email",      width: 180, visible: true  },
  { key: "id_number",         label: "身分證",     width: 140, visible: false },
  { key: "passport",          label: "護照號碼",   width: 120, visible: true  },
  { key: "passport_expiry",   label: "護照效期",   width: 110, visible: false },
  { key: "taibao_number",     label: "台胞證",     width: 140, visible: false },
  { key: "taibao_expiry",     label: "台胞證效期", width: 120, visible: false },
  { key: "address",           label: "地址",       width: 200, visible: false },
  { key: "emergency_contact", label: "緊急聯絡人", width: 120, visible: false },
  { key: "emergency_phone",   label: "緊急電話",   width: 140, visible: false },
  { key: "notes",             label: "備註",       width: 160, visible: false },
  { key: "meal_preference",   label: "餐食偏好",   width: 180, visible: false },
  { key: "tours",             label: "參團紀錄",   width: 240, visible: true  },
  { key: "created_at",        label: "加入時間",   width: 110, visible: true  },
];

// ─── helpers ──────────────────────────────────────────────────────────────────
async function compressImage(file: File, maxPx = 2400, quality = 0.92): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function buildFormFromOcr(ocr: OcrResult, imageB64: string): Omit<Customer, "id" | "created_at"> {
  const form = { ...EMPTY };
  form.name     = ocr.name     ?? "";
  form.name_en  = ocr.nameEn   ?? "";
  form.birthday = ocr.birthday ?? "";
  form.gender   = (ocr.gender as Customer["gender"]) ?? "other";
  const dt = ocr.docType;
  if (dt === "passport") {
    form.passport        = ocr.passport       ?? "";
    form.passport_expiry = ocr.passportExpiry ?? "";
    form.passport_image  = imageB64;
  } else if (dt === "taibao") {
    form.taibao_number = ocr.taibaoNumber ?? "";
    form.taibao_expiry = ocr.taibaoExpiry ?? "";
    form.taibao_image  = imageB64;
  } else if (dt === "idCard") {
    form.id_number     = ocr.idNumber ?? "";
    form.id_card_image = imageB64;
  }
  return form;
}

function getCellValue(c: Customer, key: string): string {
  if (key === "gender") return c.gender === "male" ? "男" : c.gender === "female" ? "女" : "其他";
  if (key === "created_at") return new Date(c.created_at).toLocaleDateString("zh-TW");
  return ((c as unknown as Record<string, unknown>)[key] as string) || "—";
}

// ─── Expiry badge ─────────────────────────────────────────────────────────────
function ExpiryBadge({ dateStr }: { dateStr?: string }) {
  if (!dateStr) return <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>;
  const today = new Date(); today.setHours(0,0,0,0);
  const exp   = new Date(dateStr);
  const days  = Math.floor((exp.getTime() - today.getTime()) / 86400000);
  const label = exp.toLocaleDateString("zh-TW");
  if (days < 0)   return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 whitespace-nowrap">過期</span>
      <span className="text-[11px] text-red-400 dark:text-red-500 font-mono">{label}</span>
    </div>
  );
  if (days <= 90) return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 whitespace-nowrap">快到期</span>
      <span className="text-[11px] text-yellow-600 dark:text-yellow-500 font-mono">{label}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 whitespace-nowrap">有效</span>
      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{label}</span>
    </div>
  );
}

// ─── import helpers ───────────────────────────────────────────────────────────
const HEADER_MAP: Record<string, keyof Omit<Customer, "id" | "created_at">> = {
  "姓名":"name","name":"name",
  "英文姓名":"name_en","英文拼音":"name_en","name_en":"name_en","拼音":"name_en",
  "電話":"phone","手機":"phone","phone":"phone","行動電話":"phone","聯絡電話":"phone","手機號碼":"phone",
  "email":"email","電子郵件":"email","e-mail":"email","信箱":"email",
  "身分證":"id_number","身分證字號":"id_number","id_number":"id_number","身份證":"id_number","身份證字號":"id_number",
  "護照":"passport","護照號碼":"passport","passport":"passport","護照號":"passport",
  "護照效期":"passport_expiry","護照到期":"passport_expiry","passport_expiry":"passport_expiry","護照到期日":"passport_expiry",
  "台胞證":"taibao_number","台胞證號碼":"taibao_number","taibao_number":"taibao_number","台胞":"taibao_number",
  "台胞證效期":"taibao_expiry","taibao_expiry":"taibao_expiry","台胞證到期":"taibao_expiry",
  "生日":"birthday","出生日期":"birthday","birthday":"birthday",
  "性別":"gender","gender":"gender",
  "地址":"address","address":"address","住址":"address",
  "緊急聯絡人":"emergency_contact","emergency_contact":"emergency_contact","緊急聯絡":"emergency_contact",
  "緊急聯絡電話":"emergency_phone","emergency_phone":"emergency_phone","緊急電話":"emergency_phone",
  "備註":"notes","notes":"notes","備注":"notes",
};

function normalizeDate(val: string): string {
  if (!val) return "";
  val = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const slash = val.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slash) return `${slash[1]}-${slash[2].padStart(2,"0")}-${slash[3].padStart(2,"0")}`;
  const cn = val.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (cn) return `${cn[1]}-${cn[2].padStart(2,"0")}-${cn[3].padStart(2,"0")}`;
  const mdy = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,"0")}-${mdy[2].padStart(2,"0")}`;
  return val;
}
function normalizeGender(val: string): Customer["gender"] {
  const v = val.trim().toLowerCase();
  if (["男","m","male","1"].includes(v)) return "male";
  if (["女","f","female","2"].includes(v)) return "female";
  return "other";
}
function splitLine(line: string, sep: string): string[] {
  if (sep === "\t") return line.split("\t").map(c => c.trim());
  const cols: string[] = []; let cur = ""; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && !inQuote) { inQuote = true; continue; }
    if (c === '"' && inQuote) { if (line[i+1]==='"') { cur+='"'; i++; } else { inQuote=false; } continue; }
    if (c === "," && !inQuote) { cols.push(cur.trim()); cur=""; continue; }
    cur += c;
  }
  cols.push(cur.trim()); return cols;
}
function parseSeparatedText(text: string, existingNames: Set<string>): ImportRow[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const headers = splitLine(lines[0], sep).map(h => h.toLowerCase().trim());
  const fieldMap = headers.map(h => (HEADER_MAP[h] as keyof Omit<Customer,"id"|"created_at">|undefined)||null);
  if (!fieldMap.includes("name")) return [];
  return lines.slice(1).map((line, i) => {
    const cols = splitLine(line, sep);
    const data: Partial<Omit<Customer,"id"|"created_at">> = {};
    const errors: string[] = [];
    fieldMap.forEach((field, idx) => {
      if (!field) return;
      const val = (cols[idx]||"").trim(); if (!val) return;
      if (field==="birthday"||field==="passport_expiry"||field==="taibao_expiry") {
        (data as Record<string,unknown>)[field] = normalizeDate(val);
      } else if (field==="gender") { data.gender = normalizeGender(val);
      } else { (data as Record<string,unknown>)[field] = val; }
    });
    if (!data.name||!data.name.trim()) errors.push("姓名為空");
    const isDuplicate = !!(data.name && existingNames.has(data.name.trim().toLowerCase()));
    return { rowIndex: i+2, data, errors, isDuplicate };
  }).filter(r => Object.keys(r.data).length > 0);
}

// ─── component ───────────────────────────────────────────────────────────────
export default function CRMPage() {
  const router = useRouter();

  // list
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(true);

  // tour records per customer
  const [custTours, setCustTours] = useState<Record<string, Pick<Tour,"id"|"name">[]>>({});

  // labels
  const [allLabels,     setAllLabels]     = useState<CrmLabel[]>([]);
  const [custLabels,    setCustLabels]    = useState<Record<string,string[]>>({});
  const [filterLabelId, setFilterLabelId] = useState<string|null>(null);
  const [showLabelMgr,  setShowLabelMgr]  = useState(false);
  const [labelPickerId, setLabelPickerId] = useState<string|null>(null);
  const [newLabelName,  setNewLabelName]  = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0]);
  const [savingLabel,   setSavingLabel]   = useState(false);

  // merge duplicates
  const [showMerge,   setShowMerge]   = useState(false);
  const [dupGroups,   setDupGroups]   = useState<DupGroup[]>([]);
  const [merging,     setMerging]     = useState(false);
  const [mergeResult, setMergeResult] = useState<{merged:number}|null>(null);

  // bulk scan
  const [showBulkScan,   setShowBulkScan]   = useState(false);
  const [bulkItems,      setBulkItems]      = useState<BulkItem[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkCreating,   setBulkCreating]   = useState(false);
  const [bulkDone,       setBulkDone]       = useState<{success:number}|null>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);

  // manual create
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState({...EMPTY});
  const [saving, setSaving]       = useState(false);

  // single scan
  const [showScan,   setShowScan]   = useState(false);
  const [docType,    setDocType]    = useState<DocType>("passport");
  const [scanImg,    setScanImg]    = useState("");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scanError,  setScanError]  = useState("");
  const [ocrResult,  setOcrResult]  = useState<OcrResult|null>(null);
  const [scanForm,   setScanForm]   = useState({...EMPTY});
  const [duplicates, setDuplicates] = useState<Customer[]>([]);
  const [creating,   setCreating]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // import
  const [showImport,   setShowImport]   = useState(false);
  const [importText,   setImportText]   = useState("");
  const [importRows,   setImportRows]   = useState<ImportRow[]>([]);
  const [importStep,   setImportStep]   = useState<"input"|"preview">("input");
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<{success:number;skipped:number}|null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const importFileRef = useRef<HTMLInputElement>(null);

  // columns
  const [columns,     setColumns]     = useState<ColDef[]>(() => ALL_COLS.map(c=>({...c})));
  const [showColMenu, setShowColMenu] = useState(false);
  const [colSaved,    setColSaved]    = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const [dragCol,     setDragCol]     = useState<string|null>(null);
  const [dragOverCol, setDragOverCol] = useState<string|null>(null);
  const resizeRef = useRef<{key:string;startX:number;startW:number}|null>(null);

  // ── localStorage cols ─────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ta_crm_columns");
      if (saved) {
        const parsed: ColDef[] = JSON.parse(saved);
        const savedKeys = new Set(parsed.map(c=>c.key));
        setColumns([...parsed, ...ALL_COLS.filter(c=>!savedKeys.has(c.key))]);
      }
    } catch {}
  }, []);

  const saveColumns = () => {
    localStorage.setItem("ta_crm_columns", JSON.stringify(columns));
    setColSaved(true); setTimeout(()=>setColSaved(false), 1500);
  };
  const resetColumns = () => {
    localStorage.removeItem("ta_crm_columns");
    setColumns(ALL_COLS.map(c=>({...c})));
  };

  // ── load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    const { data } = await supabase.from("customers").select("*").order("created_at",{ascending:false});
    setCustomers(data||[]); setLoading(false);
  };
  const loadLabels = async () => {
    const { data: labels } = await supabase.from("crm_labels").select("*").order("created_at");
    setAllLabels((labels||[]) as CrmLabel[]);
    const { data: cl } = await supabase.from("customer_labels").select("customer_id, label_id");
    const map: Record<string,string[]> = {};
    (cl||[]).forEach((row:{customer_id:string;label_id:string}) => {
      if (!map[row.customer_id]) map[row.customer_id] = [];
      map[row.customer_id].push(row.label_id);
    });
    setCustLabels(map);
  };
  const loadCustTours = async () => {
    const { data } = await supabase
      .from("customer_tours")
      .select("customer_id, tours(id, name)")
      .neq("status", "cancelled");
    const map: Record<string, Pick<Tour,"id"|"name">[]> = {};
    (data||[]).forEach((row: {customer_id:string; tours: {id:string;name:string}[]|null}) => {
      const tourArr = Array.isArray(row.tours) ? row.tours : (row.tours ? [row.tours] : []);
      tourArr.forEach(t => {
        if (!map[row.customer_id]) map[row.customer_id] = [];
        if (!map[row.customer_id].find(x=>x.id===t.id))
          map[row.customer_id].push({ id: t.id, name: t.name });
      });
    });
    setCustTours(map);
  };
  useEffect(() => { load(); loadLabels(); loadCustTours(); }, []);

  // ── resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const { key, startX, startW } = resizeRef.current;
      setColumns(prev => prev.map(c => c.key===key ? {...c, width: Math.max(60, startW+(e.clientX-startX))} : c));
    };
    const onUp = () => { resizeRef.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove",onMove); document.removeEventListener("mouseup",onUp); };
  }, []);

  // ── close col menu ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showColMenu) return;
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setShowColMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColMenu]);

  // ── filter ────────────────────────────────────────────────────────────────
  const filtered = customers.filter(c => {
    const ms = c.name.includes(search)||c.phone.includes(search)||c.email.includes(search);
    const ml = !filterLabelId || (custLabels[c.id]||[]).includes(filterLabelId);
    return ms && ml;
  });
  const visibleCols = columns.filter(c => c.visible);

  // ── col drag ──────────────────────────────────────────────────────────────
  const handleColDragStart = (key:string, e:React.DragEvent) => { setDragCol(key); e.dataTransfer.effectAllowed="move"; };
  const handleColDragOver  = (key:string, e:React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect="move"; if(key!==dragCol) setDragOverCol(key); };
  const handleColDrop = (targetKey:string) => {
    if (!dragCol||dragCol===targetKey) { setDragCol(null); setDragOverCol(null); return; }
    setColumns(prev => {
      const next=[...prev];
      const [removed] = next.splice(next.findIndex(c=>c.key===dragCol),1);
      next.splice(next.findIndex(c=>c.key===targetKey),0,removed);
      return next;
    });
    setDragCol(null); setDragOverCol(null);
  };
  const handleColDragEnd = () => { setDragCol(null); setDragOverCol(null); };
  const toggleCol = (key:string) => setColumns(prev=>prev.map(c=>c.key===key?{...c,visible:!c.visible}:c));

  // ── label fns ─────────────────────────────────────────────────────────────
  const createLabel = async () => {
    if (!newLabelName.trim()) return;
    setSavingLabel(true);
    await supabase.from("crm_labels").insert([{name:newLabelName.trim(),color:newLabelColor}]);
    setNewLabelName(""); setNewLabelColor(LABEL_COLORS[0]); setSavingLabel(false);
    loadLabels();
  };
  const deleteLabel = async (id:string) => {
    if (!confirm("確定刪除此標籤？所有旅客的此標籤也會一併移除。")) return;
    await supabase.from("crm_labels").delete().eq("id",id);
    loadLabels();
  };
  const toggleCustLabel = async (custId:string, labelId:string) => {
    const current = custLabels[custId]||[];
    const has = current.includes(labelId);
    if (has) await supabase.from("customer_labels").delete().eq("customer_id",custId).eq("label_id",labelId);
    else await supabase.from("customer_labels").insert([{customer_id:custId,label_id:labelId}]);
    setCustLabels(prev => ({...prev, [custId]: has ? current.filter(l=>l!==labelId) : [...current,labelId]}));
  };

  // ── bulk scan ─────────────────────────────────────────────────────────────
  const handleBulkFiles = async (fileList: FileList) => {
    const files: File[] = [];
    for (let i=0; i<fileList.length; i++) {
      if (fileList[i].type.startsWith("image/")) files.push(fileList[i]);
    }
    if (files.length===0) return;
    setBulkProcessing(true);

    const items: BulkItem[] = await Promise.all(files.map(async (file, i) => ({
      uid: `bulk-${Date.now()}-${i}`,
      preview: await compressImage(file, 300, 0.7),
      status: "pending" as const,
      detectedType: null, ocr: null,
      form: {...EMPTY}, error: "", selected: true,
    })));
    setBulkItems(items);

    const CONCURRENCY = 3;
    let nextIdx = 0;
    const worker = async (): Promise<void> => {
      while (nextIdx < files.length) {
        const idx = nextIdx++;
        setBulkItems(prev => prev.map((it,i)=>i===idx?{...it,status:"scanning"}:it));
        try {
          const b64 = await compressImage(files[idx], 2400, 0.92);
          const res = await fetch("/api/ocr/document",{
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({imageBase64:b64, docType:"auto"}),
          });
          const ocr: OcrResult & {error?:string} = await res.json();
          if (ocr.error) throw new Error(ocr.error);
          const form = buildFormFromOcr(ocr, b64);
          setBulkItems(prev=>prev.map((it,i)=>i===idx?{...it,status:"done",detectedType:ocr.docType??null,ocr,form}:it));
        } catch(e:unknown) {
          setBulkItems(prev=>prev.map((it,i)=>i===idx?{...it,status:"error",error:e instanceof Error?e.message:"OCR 失敗"}:it));
        }
      }
    };
    await Promise.all(Array.from({length:Math.min(CONCURRENCY,files.length)},worker));
    setBulkProcessing(false);
  };

  const updateBulkForm = (idx:number, updates:Partial<Omit<Customer,"id"|"created_at">>) => {
    setBulkItems(prev=>prev.map((it,i)=>i===idx?{...it,form:{...it.form,...updates}}:it));
  };
  const toggleBulkItem = (idx:number) => {
    setBulkItems(prev=>prev.map((it,i)=>i===idx?{...it,selected:!it.selected}:it));
  };

  const handleBulkCreate = async () => {
    const toCreate = bulkItems.filter(it=>it.selected&&it.status==="done"&&it.form.name.trim());
    if (toCreate.length===0) { alert("沒有可建立的旅客（請確認姓名已填寫）"); return; }
    setBulkCreating(true);
    const payloads = toCreate.map(it=>({
      ...it.form,
      birthday: it.form.birthday||null,
      passport_expiry: it.form.passport_expiry||null,
      taibao_expiry: it.form.taibao_expiry||null,
    }));
    let success=0;
    for (let i=0; i<payloads.length; i+=50) {
      const { error } = await supabase.from("customers").insert(payloads.slice(i,i+50));
      if (!error) success += Math.min(50, payloads.length-i);
    }
    setBulkCreating(false); setBulkDone({success}); load();
  };

  const closeBulkScan = () => {
    setShowBulkScan(false); setBulkItems([]); setBulkProcessing(false);
    setBulkCreating(false); setBulkDone(null);
    if (bulkFileRef.current) bulkFileRef.current.value="";
  };

  // ── manual create ─────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.name.trim()) return alert("請填寫姓名");
    setSaving(true);
    const { error } = await supabase.from("customers").insert([{
      ...form, birthday:form.birthday||null,
      passport_expiry:form.passport_expiry||null, taibao_expiry:form.taibao_expiry||null,
    }]);
    setSaving(false);
    if (error) { alert("建立失敗："+error.message); return; }
    setShowModal(false); setForm({...EMPTY}); load();
  };

  // ── single scan ───────────────────────────────────────────────────────────
  const handleFileSelect = async (file:File) => {
    if (!file.type.startsWith("image/")) return;
    setScanStatus("scanning"); setScanError(""); setOcrResult(null); setDuplicates([]);
    try {
      const b64 = await compressImage(file);
      setScanImg(b64);
      const res = await fetch("/api/ocr/document",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({imageBase64:b64, docType}),
      });
      const json: OcrResult & {error?:string} = await res.json();
      if (json.error) throw new Error(json.error);
      setOcrResult(json);
      const preForm = {...EMPTY};
      preForm.name    = json.name    ?? "";
      preForm.name_en = json.nameEn  ?? "";
      preForm.birthday= json.birthday?? "";
      preForm.gender  = (json.gender as Customer["gender"]) ?? "other";
      if (docType==="passport") {
        preForm.passport        = json.passport       ??"";
        preForm.passport_expiry = json.passportExpiry ??"";
        preForm.passport_image  = b64;
      } else if (docType==="taibao") {
        preForm.taibao_number = json.taibaoNumber ??"";
        preForm.taibao_expiry = json.taibaoExpiry ??"";
        preForm.taibao_image  = b64;
      } else {
        preForm.id_number     = json.idNumber ??"";
        preForm.id_card_image = b64;
      }
      setScanForm(preForm);
      if (json.name) {
        const { data: dups } = await supabase.from("customers").select("id,name,phone,birthday").ilike("name",json.name.trim());
        setDuplicates((dups||[]) as Customer[]);
      }
      setScanStatus("done");
    } catch(e:unknown) {
      setScanError(e instanceof Error?e.message:"OCR 失敗，請重試");
      setScanStatus("error");
    }
  };
  const handleDrop = (e:React.DragEvent) => { e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) handleFileSelect(f); };
  const handleScanCreate = async () => {
    if (!scanForm.name.trim()) return alert("請確認姓名欄位");
    setCreating(true);
    const { data, error } = await supabase.from("customers").insert([{
      ...scanForm, birthday:scanForm.birthday||null,
      passport_expiry:scanForm.passport_expiry||null, taibao_expiry:scanForm.taibao_expiry||null,
    }]).select("id").single();
    setCreating(false);
    if (error) { alert("建立失敗："+error.message); return; }
    closeScan(); router.push(`/admin/crm/${data.id}`);
  };
  const handleMerge = async (existingId:string) => {
    setCreating(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string,any> = {};
    if (docType==="passport") {
      if (scanForm.passport)        updates.passport        = scanForm.passport;
      if (scanForm.passport_expiry) updates.passport_expiry = scanForm.passport_expiry||null;
      if (scanForm.passport_image)  updates.passport_image  = scanForm.passport_image;
    } else if (docType==="taibao") {
      if (scanForm.taibao_number)   updates.taibao_number   = scanForm.taibao_number;
      if (scanForm.taibao_expiry)   updates.taibao_expiry   = scanForm.taibao_expiry||null;
      if (scanForm.taibao_image)    updates.taibao_image    = scanForm.taibao_image;
    } else {
      if (scanForm.id_number)       updates.id_number       = scanForm.id_number;
      if (scanForm.id_card_image)   updates.id_card_image   = scanForm.id_card_image;
    }
    if (scanForm.name_en)  updates.name_en  = scanForm.name_en;
    if (scanForm.birthday) updates.birthday = scanForm.birthday||null;
    await supabase.from("customers").update(updates).eq("id",existingId);
    setCreating(false); closeScan(); router.push(`/admin/crm/${existingId}`);
  };
  const closeScan = () => {
    setShowScan(false); setScanImg(""); setScanStatus("idle"); setScanError("");
    setOcrResult(null); setScanForm({...EMPTY}); setDuplicates([]); setDocType("passport");
  };

  // ── import ────────────────────────────────────────────────────────────────
  const parseAndPreview = () => {
    if (!importText.trim()) { alert("請先貼上資料或上傳 CSV"); return; }
    const existingNames = new Set(customers.map(c=>c.name.toLowerCase()));
    const rows = parseSeparatedText(importText, existingNames);
    if (rows.length===0) { alert("無法解析資料，請確認第一行為欄位標題且包含「姓名」欄"); return; }
    setImportRows(rows);
    setSelectedRows(new Set(rows.filter(r=>r.errors.length===0&&!r.isDuplicate).map(r=>r.rowIndex)));
    setImportStep("preview");
  };
  const handleImport = async () => {
    const toImport = importRows.filter(r=>selectedRows.has(r.rowIndex)&&r.errors.length===0);
    if (toImport.length===0) { alert("沒有選擇要匯入的旅客"); return; }
    setImporting(true);
    const payloads = toImport.map(r=>({...EMPTY,...r.data,birthday:r.data.birthday||null,passport_expiry:r.data.passport_expiry||null,taibao_expiry:r.data.taibao_expiry||null}));
    let success=0;
    for (let i=0;i<payloads.length;i+=50) {
      const { error } = await supabase.from("customers").insert(payloads.slice(i,i+50));
      if (!error) success+=Math.min(50,payloads.length-i);
    }
    setImporting(false); setImportResult({success,skipped:toImport.length-success}); load();
  };
  const closeImport = () => {
    setShowImport(false); setImportText(""); setImportRows([]);
    setImportStep("input"); setImportResult(null); setSelectedRows(new Set());
  };

  // ── find & merge duplicates ───────────────────────────────────────────────
  const openMerge = () => {
    const pairs = new Map<string, { customers: [Customer,Customer]; reasons: string[] }>();
    const addPair = (a:Customer, b:Customer, reason:string) => {
      const key = [a.id,b.id].sort().join(":");
      if (!pairs.has(key)) pairs.set(key,{customers:[a,b],reasons:[]});
      pairs.get(key)!.reasons.push(reason);
    };
    // group by name (繁體/簡體視為相同)
    const byName = new Map<string,Customer[]>();
    customers.forEach(c => {
      if (!c.name?.trim()) return;
      const k = normalizeChineseName(c.name);
      if (!byName.has(k)) byName.set(k,[]);
      byName.get(k)!.push(c);
    });
    byName.forEach(cs => {
      if (cs.length<2) return;
      for (let i=0;i<cs.length;i++) for (let j=i+1;j<cs.length;j++) addPair(cs[i],cs[j],"姓名相同（含繁簡轉換）");
    });
    // group by passport
    const byPass = new Map<string,Customer[]>();
    customers.forEach(c => {
      if (!c.passport?.trim()) return;
      const k = c.passport.trim().toUpperCase();
      if (!byPass.has(k)) byPass.set(k,[]);
      byPass.get(k)!.push(c);
    });
    byPass.forEach(cs => {
      if (cs.length<2) return;
      for (let i=0;i<cs.length;i++) for (let j=i+1;j<cs.length;j++) addPair(cs[i],cs[j],"護照號碼相同");
    });
    // group by id_number
    const byId = new Map<string,Customer[]>();
    customers.forEach(c => {
      if (!c.id_number?.trim()) return;
      const k = c.id_number.trim().toUpperCase();
      if (!byId.has(k)) byId.set(k,[]);
      byId.get(k)!.push(c);
    });
    byId.forEach(cs => {
      if (cs.length<2) return;
      for (let i=0;i<cs.length;i++) for (let j=i+1;j<cs.length;j++) addPair(cs[i],cs[j],"身分證字號相同");
    });
    const groups: DupGroup[] = [];
    pairs.forEach(({customers,reasons},key) => {
      groups.push({id:key, reasons, customers, selected:false, keepId:customers[0].id, fieldChoices:buildDefaultChoices('a')});
    });
    setDupGroups(groups);
    setMergeResult(null);
    setShowMerge(true);
  };

  const setFieldChoice = (gi: number, key: string, choice: 'a'|'b'|'clear') => {
    setDupGroups(prev => prev.map((g, i) => {
      if (i !== gi) return g;
      const newChoices = {...g.fieldChoices, [key]: choice};
      // Auto-update linked image field
      const fd = MERGE_FIELD_DEFS.find(f => f.key === key);
      if (fd?.linked) newChoices[fd.linked] = choice;
      return {...g, fieldChoices: newChoices};
    }));
  };

  const executeMerge = async () => {
    const toMerge = dupGroups.filter(g => g.selected);
    if (toMerge.length === 0) return;
    setMerging(true);
    let merged = 0;
    const ALL_KEYS: (keyof Omit<Customer,'id'|'created_at'>)[] = [
      'name','name_en','phone','email','birthday','gender','address',
      'emergency_contact','emergency_phone','notes',
      'id_number','id_card_image','passport','passport_expiry','passport_image',
      'taibao_number','taibao_expiry','taibao_image',
    ];
    for (const group of toMerge) {
      const [a, b] = group.customers;
      const secondary = group.keepId === a.id ? b : a;
      const patch: Partial<Omit<Customer,'id'|'created_at'>> = {};
      for (const key of ALL_KEYS) {
        const defaultSide = group.keepId === a.id ? 'a' : 'b';
        const choice = group.fieldChoices[key] ?? defaultSide;
        const val = choice === 'a' ? (a[key] ?? '') : choice === 'b' ? (b[key] ?? '') : (key === 'gender' ? 'other' : '');
        (patch as Record<string, unknown>)[key] = val;
      }
      await supabase.from("customers").update(patch).eq("id", group.keepId);
      await supabase.from("customer_tours").update({customer_id: group.keepId}).eq("customer_id", secondary.id);
      await supabase.from("customer_labels").update({customer_id: group.keepId}).eq("customer_id", secondary.id);
      await supabase.from("customers").delete().eq("id", secondary.id);
      merged++;
    }
    setMerging(false);
    setMergeResult({merged});
    load(); loadLabels(); loadCustTours();
  };

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">

      {/* ── header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Users className="w-6 h-6 text-violet-600" /> 旅客 CRM
        </h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={openMerge}
            className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors">
            <GitMerge className="w-4 h-4" /> 合併重複旅客
          </button>
          <button onClick={()=>setShowLabelMgr(true)}
            className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors">
            <Tag className="w-4 h-4" /> 標籤管理
          </button>
          <button onClick={()=>setShowImport(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <FileSpreadsheet className="w-4 h-4" /> 匯入名單
          </button>
          <button onClick={()=>setShowBulkScan(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <Layers className="w-4 h-4" /> 批量掃描建檔
          </button>
          <button onClick={()=>setShowScan(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <ScanLine className="w-4 h-4" /> 掃描證件建檔
          </button>
          <button onClick={()=>setShowModal(true)}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> 新增旅客
          </button>
        </div>
      </div>

      {/* ── search + label filter + col settings ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm w-full bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400"
              placeholder="搜尋姓名、電話、Email…"
              value={search} onChange={e=>setSearch(e.target.value)}
            />
          </div>

          <div className="relative" ref={colMenuRef}>
            <button onClick={()=>setShowColMenu(v=>!v)}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors ${
                showColMenu ? "border-violet-400 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                  : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}>
              <Settings className="w-4 h-4" /> 欄位設定
            </button>
            {showColMenu && (
              <div className="absolute left-0 top-full mt-1 z-30 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 p-3 w-52">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 px-1 uppercase tracking-wide">顯示欄位</p>
                <div className="space-y-0.5 max-h-72 overflow-y-auto">
                  {columns.map(col => (
                    <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={col.visible} onChange={()=>toggleCol(col.key)} className="accent-violet-600 w-3.5 h-3.5" />
                      {col.label}
                    </label>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 space-y-1.5">
                  <button onClick={saveColumns}
                    className={`w-full text-xs font-medium py-1.5 rounded-lg transition-colors ${
                      colSaved ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-violet-600 hover:bg-violet-700 text-white"
                    }`}>
                    {colSaved ? "✓ 已儲存" : "儲存欄位設定"}
                  </button>
                  <button onClick={resetColumns} className="w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-center py-1">重設為預設</button>
                </div>
              </div>
            )}
          </div>

          <span className="text-xs text-slate-400 ml-auto hidden sm:block">拖曳欄標題可調整順序，拖曳右邊框可調整寬度</span>
        </div>

        {/* label filter chips */}
        {allLabels.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400">篩選：</span>
            <button
              onClick={()=>setFilterLabelId(null)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                !filterLabelId ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}>
              全部（{customers.length}）
            </button>
            {allLabels.map(label => {
              const count = customers.filter(c=>(custLabels[c.id]||[]).includes(label.id)).length;
              const active = filterLabelId===label.id;
              return (
                <button key={label.id}
                  onClick={()=>setFilterLabelId(active?null:label.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    active ? "text-white shadow-sm" : "text-white/80 opacity-70 hover:opacity-100"
                  }`}
                  style={{backgroundColor: label.color, boxShadow: active ? `0 0 0 2px white, 0 0 0 4px ${label.color}` : undefined}}>
                  {label.name} {count>0 && <span className="opacity-80">({count})</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── table ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length===0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            {search||filterLabelId ? "沒有符合的旅客" : "尚無旅客，點右上角新增或掃描證件"}
          </div>
        ) : (
          <table className="text-sm table-fixed" style={{width:visibleCols.reduce((s,c)=>s+c.width,0)}}>
            <colgroup>{visibleCols.map(col=><col key={col.key} style={{width:col.width}} />)}</colgroup>
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase select-none">
              <tr>
                {visibleCols.map(col=>(
                  <th key={col.key}
                    className={`text-left px-4 py-3 relative cursor-grab active:cursor-grabbing ${
                      dragOverCol===col.key&&dragCol!==col.key ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300" : ""
                    }`}
                    style={{width:col.width}} draggable
                    onDragStart={e=>handleColDragStart(col.key,e)}
                    onDragOver={e=>handleColDragOver(col.key,e)}
                    onDrop={()=>handleColDrop(col.key)}
                    onDragEnd={handleColDragEnd}>
                    <span className="truncate block pr-2">{col.label}</span>
                    <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize group"
                      onMouseDown={e=>{e.preventDefault();e.stopPropagation();resizeRef.current={key:col.key,startX:e.clientX,startW:col.width};}}
                      draggable={false} onDragStart={e=>e.preventDefault()}>
                      <div className="absolute right-0 top-1/4 h-1/2 w-0.5 bg-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {filtered.map(c=>(
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                  {visibleCols.map(col=>(
                    <td key={col.key} className="px-4 py-2.5 truncate" style={{width:col.width,maxWidth:col.width}}>
                      {col.key==="name" ? (
                        <div className="group/cell flex items-center gap-1.5 flex-wrap min-w-0">
                          <Link href={`/admin/crm/${c.id}`} className="font-medium text-blue-500 hover:text-blue-400 hover:underline flex-shrink-0">{c.name}</Link>
                          {(custLabels[c.id]||[]).map(lid=>{
                            const label=allLabels.find(l=>l.id===lid);
                            if (!label) return null;
                            return (
                              <span key={lid} className="inline-flex items-center px-1.5 py-px rounded text-[10px] font-medium text-white cursor-pointer flex-shrink-0"
                                style={{backgroundColor:label.color}}
                                onClick={()=>setLabelPickerId(c.id)}>
                                {label.name}
                              </span>
                            );
                          })}
                          <button onClick={e=>{e.stopPropagation();setLabelPickerId(c.id);}}
                            className="opacity-0 group-hover/cell:opacity-100 transition-opacity p-0.5 text-slate-400 hover:text-violet-500 flex-shrink-0" title="編輯標籤">
                            <Tag className="w-3 h-3" />
                          </button>
                        </div>
                      ) : col.key==="tours" ? (
                        <div className="flex flex-wrap gap-1">
                          {(custTours[c.id]||[]).length===0 ? (
                            <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                          ) : (custTours[c.id]).map(t => {
                            const clr = tourTagColor(t.id);
                            return (
                              <span key={t.id}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                                style={{backgroundColor: clr.bg, color: clr.text}}>
                                {t.name}
                              </span>
                            );
                          })}
                        </div>
                      ) : col.key==="meal_preference" ? (
                        <div className="flex flex-wrap gap-1">
                          {!(c.meal_preference||"").trim() ? (
                            <span className="text-xs text-slate-300 dark:text-slate-600">正常餐</span>
                          ) : (c.meal_preference||"").split(",").map(s=>s.trim()).filter(Boolean).map(opt => {
                            const def = MEAL_OPTIONS_CRM.find(m=>m.key===opt);
                            return def ? (
                              <span key={opt}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                                style={{backgroundColor:def.bg, color:def.text}}>
                                {opt}
                              </span>
                            ) : (
                              <span key={opt} className="text-xs text-slate-500 dark:text-slate-400">{opt}</span>
                            );
                          })}
                        </div>
                      ) : col.key==="passport_expiry"||col.key==="taibao_expiry" ? (
                        <ExpiryBadge dateStr={(c as unknown as Record<string,string>)[col.key]} />
                      ) : col.key==="passport"||col.key==="id_number"||col.key==="taibao_number" ? (
                        <span className="text-slate-600 dark:text-slate-300 font-mono text-xs">{getCellValue(c,col.key)}</span>
                      ) : col.key==="created_at" ? (
                        <span className="text-slate-400 dark:text-slate-500 text-xs">{getCellValue(c,col.key)}</span>
                      ) : (
                        <span className="text-slate-600 dark:text-slate-300">{getCellValue(c,col.key)}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MERGE DUPLICATES MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {showMerge && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">

            {/* header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <GitMerge className="w-5 h-5 text-violet-600" /> 合併重複旅客資料
                </h2>
                {!mergeResult && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    依姓名、護照號碼、身分證字號偵測到以下可能重複的旅客
                  </p>
                )}
              </div>
              <button onClick={()=>setShowMerge(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {mergeResult ? (
                <div className="text-center py-12 space-y-3">
                  <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto" />
                  <p className="text-xl font-semibold text-slate-800 dark:text-slate-100">合併完成！</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    成功合併 <strong className="text-violet-600">{mergeResult.merged}</strong> 組重複資料
                  </p>
                </div>
              ) : dupGroups.length===0 ? (
                <div className="text-center py-16 space-y-3">
                  <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
                  <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">沒有發現重複旅客</p>
                  <p className="text-sm text-slate-400">所有旅客的姓名、護照號碼、身分證字號均無重複</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* select all */}
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pb-1">
                    <span>共 {dupGroups.length} 組可能重複</span>
                    <div className="flex gap-3">
                      <button onClick={()=>setDupGroups(prev=>prev.map(g=>({...g,selected:true})))} className="hover:text-violet-600 hover:underline">全選</button>
                      <button onClick={()=>setDupGroups(prev=>prev.map(g=>({...g,selected:false})))} className="hover:text-slate-700 hover:underline">取消全選</button>
                    </div>
                  </div>

                  {dupGroups.map((group, gi) => {
                    const [a, b] = group.customers;
                    const getVal = (c: Customer, fd: typeof MERGE_FIELD_DEFS[0]) => {
                      const v = c[fd.key] as string;
                      return v || '';
                    };
                    const clearCount = Object.values(group.fieldChoices).filter(v=>v==='clear').length;
                    return (
                      <div key={group.id}
                        className={`rounded-xl border-2 transition-colors overflow-hidden ${
                          group.selected
                            ? "border-violet-400 dark:border-violet-600"
                            : "border-slate-100 dark:border-slate-700"
                        }`}>

                        {/* group header */}
                        <div className={`flex items-center gap-3 px-4 py-2.5 ${
                          group.selected ? "bg-violet-50 dark:bg-violet-900/20" : "bg-slate-50 dark:bg-slate-700/50"
                        }`}>
                          <input type="checkbox" checked={group.selected} onChange={e=>
                            setDupGroups(prev=>prev.map((g,i)=>i===gi?{...g,selected:e.target.checked}:g))
                          } className="w-4 h-4 accent-violet-600" />
                          <div className="flex flex-wrap gap-1.5">
                            {group.reasons.map(r=>(
                              <span key={r} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                                {r}
                              </span>
                            ))}
                            {clearCount > 0 && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                                已標記清空 {clearCount} 欄
                              </span>
                            )}
                          </div>
                          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 hidden sm:block">點選欄位選擇要保留哪筆資料</span>
                        </div>

                        {/* comparison table */}
                        <div className="bg-white dark:bg-slate-800 grid grid-cols-[6rem_1fr_1fr] text-sm">
                          {/* col headers */}
                          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/40 text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-end">欄位</div>
                          {[a,b].map((c,ci)=>(
                            <div key={c.id} className={`px-4 py-2 border-l border-slate-100 dark:border-slate-700 ${
                              group.keepId===c.id
                                ? "bg-emerald-50 dark:bg-emerald-900/20"
                                : "bg-slate-50 dark:bg-slate-700/40"
                            }`}>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name={`keep-${group.id}`} checked={group.keepId===c.id}
                                  onChange={()=>{
                                    const newSide = ci===0 ? 'a' : 'b';
                                    setDupGroups(prev=>prev.map((g,i)=>i===gi
                                      ? {...g, keepId:c.id, fieldChoices:buildDefaultChoices(newSide)}
                                      : g));
                                  }}
                                  className="accent-emerald-600" />
                                <span className={`text-xs font-semibold ${
                                  group.keepId===c.id ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"
                                }`}>
                                  {group.keepId===c.id ? "✓ 保留帳號" : `旅客 ${ci===0?"A":"B"}`}
                                </span>
                              </label>
                              <Link href={`/admin/crm/${c.id}`} target="_blank"
                                className="text-[10px] text-violet-500 hover:underline mt-0.5 block truncate">
                                {c.name}（查看 ↗）
                              </Link>
                            </div>
                          ))}

                          {/* per-field rows */}
                          {MERGE_FIELD_DEFS.map(fd => {
                            const va = getVal(a, fd);
                            const vb = getVal(b, fd);
                            if (!va && !vb) return null;
                            const diff = va !== vb;
                            const choice = group.fieldChoices[fd.key] ?? 'a';
                            const hasImgA = !!(fd.linked && (a[fd.linked] as string));
                            const hasImgB = !!(fd.linked && (b[fd.linked] as string));
                            const cells = [
                              {v: va, side:'a' as const, cust:a, hasImg:hasImgA},
                              {v: vb, side:'b' as const, cust:b, hasImg:hasImgB},
                            ];
                            return (
                              <Fragment key={fd.key}>
                                {/* label col */}
                                <div className="px-3 py-2.5 text-[11px] font-medium text-slate-400 dark:text-slate-500 border-t border-slate-50 dark:border-slate-700/50 flex items-center gap-1">
                                  <span className="truncate leading-tight">{fd.label}</span>
                                  {/* trash: toggle clear */}
                                  <button
                                    title={choice==='clear' ? '恢復' : '清空此欄'}
                                    onClick={()=>setFieldChoice(gi, fd.key,
                                      choice==='clear'
                                        ? (group.keepId===a.id?'a':'b')
                                        : 'clear'
                                    )}
                                    className={`ml-auto flex-shrink-0 p-0.5 rounded transition-colors ${
                                      choice==='clear'
                                        ? 'text-red-500 dark:text-red-400'
                                        : 'text-slate-200 dark:text-slate-600 hover:text-red-400'
                                    }`}>
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                                {/* value cells */}
                                {cells.map(({v, side, hasImg}) => {
                                  const isChosen = choice === side;
                                  const isCleared = choice === 'clear';
                                  return (
                                    <div key={side}
                                      onClick={()=> { if (diff && !isCleared) setFieldChoice(gi, fd.key, side); }}
                                      className={`px-3 py-2.5 border-l border-t border-slate-50 dark:border-slate-700/50 transition-all
                                        ${diff && !isCleared ? 'cursor-pointer' : ''}
                                        ${isCleared
                                          ? 'bg-red-50/50 dark:bg-red-900/10'
                                          : isChosen
                                            ? 'bg-emerald-50 dark:bg-emerald-900/15'
                                            : diff ? 'opacity-40' : ''
                                        }`}>
                                      <div className="flex items-start gap-1.5 min-w-0">
                                        {diff && !isCleared && (
                                          <input type="radio" checked={isChosen}
                                            onChange={()=>setFieldChoice(gi, fd.key, side)}
                                            className="mt-0.5 accent-emerald-600 flex-shrink-0"
                                            onClick={e=>e.stopPropagation()} />
                                        )}
                                        {isCleared && <span className="mt-0.5 flex-shrink-0 text-red-400 text-xs">✕</span>}
                                        <div className="min-w-0 flex-1">
                                          <span className={`text-xs break-all ${
                                            isCleared
                                              ? 'line-through text-red-300 dark:text-red-700'
                                              : isChosen && diff
                                                ? 'text-emerald-700 dark:text-emerald-300 font-medium'
                                                : 'text-slate-600 dark:text-slate-300'
                                          }`}>
                                            {v || <span className="text-slate-300 dark:text-slate-600 not-italic">—</span>}
                                          </span>
                                          {hasImg && !isCleared && (
                                            <span className="ml-1 text-[9px] text-slate-400 dark:text-slate-500">📷</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </Fragment>
                            );
                          })}
                        </div>

                        {/* footer note */}
                        {group.selected && (
                          <div className="px-4 py-2 bg-violet-50 dark:bg-violet-900/20 border-t border-violet-100 dark:border-violet-800/40 text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                            <ChevronRight className="w-3 h-3 flex-shrink-0" />
                            <span>保留帳號「{group.keepId===a.id?a.name:b.name}」，各欄位依上方選擇套用
                              {clearCount>0 && `（${clearCount} 欄將清空）`}，出團記錄一併移轉，另一筆刪除</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex-shrink-0 flex items-center justify-between gap-3">
              {mergeResult ? (
                <div className="ml-auto">
                  <button onClick={()=>setShowMerge(false)} className="px-5 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg">完成</button>
                </div>
              ) : (
                <>
                  <span className="text-xs text-slate-400">
                    {dupGroups.filter(g=>g.selected).length > 0
                      ? `已選 ${dupGroups.filter(g=>g.selected).length} 組，確認後將合併旅客資料並刪除重複筆`
                      : "請勾選要合併的項目"}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={()=>setShowMerge(false)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">取消</button>
                    <button
                      onClick={executeMerge}
                      disabled={merging || dupGroups.filter(g=>g.selected).length===0}
                      className="px-5 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-40 flex items-center gap-1.5">
                      {merging && <Loader2 className="w-4 h-4 animate-spin" />}
                      {merging ? "合併中…" : `✓ 確認合併 ${dupGroups.filter(g=>g.selected).length} 組`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          LABEL PICKER MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {labelPickerId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
          onClick={()=>setLabelPickerId(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-4 w-60" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">編輯標籤</p>
              <button onClick={()=>setLabelPickerId(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            {allLabels.length===0 ? (
              <p className="text-xs text-slate-400 text-center py-4">尚無標籤，請先建立</p>
            ) : (
              <div className="space-y-1">
                {allLabels.map(label=>{
                  const isActive=(custLabels[labelPickerId]||[]).includes(label.id);
                  return (
                    <button key={label.id} onClick={()=>toggleCustLabel(labelPickerId,label.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive ? "bg-slate-100 dark:bg-slate-700" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      }`}>
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{backgroundColor:label.color}} />
                      <span className="flex-1 text-left text-slate-700 dark:text-slate-200">{label.name}</span>
                      {isActive && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button onClick={()=>{setLabelPickerId(null);setShowLabelMgr(true);}}
                className="text-xs text-violet-600 hover:underline w-full text-center">管理標籤</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          LABEL MANAGER MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {showLabelMgr && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Tag className="w-5 h-5 text-violet-600" /> 標籤管理
              </h2>
              <button onClick={()=>setShowLabelMgr(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">新增標籤</p>
                <input className={input} placeholder="標籤名稱" value={newLabelName}
                  onChange={e=>setNewLabelName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&createLabel()} />
                <div className="flex flex-wrap gap-2">
                  {LABEL_COLORS.map(c=>(
                    <button key={c} onClick={()=>setNewLabelColor(c)}
                      className={`w-7 h-7 rounded-full transition-all ${newLabelColor===c?"ring-2 ring-offset-2 ring-violet-500 scale-110":""}`}
                      style={{backgroundColor:c}} />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{backgroundColor:newLabelColor}}>
                    {newLabelName||"預覽"}
                  </span>
                </div>
                <button onClick={createLabel} disabled={savingLabel||!newLabelName.trim()}
                  className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg disabled:opacity-40 flex items-center justify-center gap-1.5">
                  {savingLabel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  建立標籤
                </button>
              </div>
              {allLabels.length>0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">現有標籤</p>
                  {allLabels.map(label=>(
                    <div key={label.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/40">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{backgroundColor:label.color}} />
                      <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">{label.name}</span>
                      <button onClick={()=>deleteLabel(label.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BULK SCAN MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {showBulkScan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[94vh] flex flex-col">

            {/* header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-500" />
                {bulkDone ? "批量建檔完成" : `批量掃描建檔${bulkItems.length>0?`（${bulkItems.length} 張）`:""}`}
              </h2>
              <div className="flex items-center gap-3">
                {bulkProcessing && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    辨識中… {bulkItems.filter(it=>it.status==="done"||it.status==="error").length}/{bulkItems.length}
                  </span>
                )}
                <button onClick={closeBulkScan}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* Done state */}
              {bulkDone ? (
                <div className="text-center py-12 space-y-3">
                  <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto" />
                  <p className="text-xl font-semibold text-slate-800 dark:text-slate-100">批量建檔完成！</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">成功建立 <strong className="text-emerald-600">{bulkDone.success}</strong> 位旅客</p>
                </div>
              ) : (
                <>
                  {/* Upload zone */}
                  <div>
                    <input ref={bulkFileRef} type="file" accept="image/*" multiple className="hidden"
                      onChange={e=>{ if(e.target.files&&e.target.files.length>0) handleBulkFiles(e.target.files); }} />
                    {bulkItems.length===0 ? (
                      <div
                        onClick={()=>bulkFileRef.current?.click()}
                        onDrop={e=>{e.preventDefault();if(e.dataTransfer.files.length>0)handleBulkFiles(e.dataTransfer.files);}}
                        onDragOver={e=>e.preventDefault()}
                        className="border-2 border-dashed border-amber-300 dark:border-amber-700 rounded-xl py-16 flex flex-col items-center gap-3 cursor-pointer hover:border-amber-400 hover:bg-amber-50/30 dark:hover:bg-amber-900/10 transition-colors text-center">
                        <Upload className="w-10 h-10 text-amber-400" />
                        <p className="text-slate-600 dark:text-slate-300 font-medium">點此選取或拖曳多張證件照片</p>
                        <p className="text-xs text-slate-400">支援護照、身分證、台胞證 · AI 自動判斷類型</p>
                        <p className="text-xs text-slate-400">支援 JPG / PNG / HEIC，可一次選取多張</p>
                      </div>
                    ) : (
                      <button onClick={()=>bulkFileRef.current?.click()}
                        className="w-full py-2.5 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:border-amber-400 hover:text-amber-600 transition-colors flex items-center justify-center gap-2">
                        <Upload className="w-4 h-4" /> 繼續新增照片
                      </button>
                    )}
                  </div>

                  {/* Cards grid */}
                  {bulkItems.length>0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {bulkItems.map((item, idx)=>{
                        const dtLabel = item.detectedType==="passport"?"護照":item.detectedType==="idCard"?"身分證":item.detectedType==="taibao"?"台胞證":null;
                        return (
                          <div key={item.uid} className={`relative rounded-xl border-2 overflow-hidden transition-all ${
                            item.status==="error" ? "border-red-300 dark:border-red-700"
                            : item.status==="done"&&item.selected ? "border-emerald-400 dark:border-emerald-600 shadow-sm"
                            : item.status==="done"&&!item.selected ? "border-slate-200 dark:border-slate-600 opacity-60"
                            : "border-slate-200 dark:border-slate-600"
                          }`}>
                            {/* checkbox */}
                            {item.status==="done" && (
                              <button onClick={()=>toggleBulkItem(idx)}
                                className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-white dark:bg-slate-700 shadow border border-slate-200 dark:border-slate-600 flex items-center justify-center">
                                {item.selected
                                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                  : <div className="w-3 h-3 rounded-full border border-slate-300" />
                                }
                              </button>
                            )}
                            {/* preview */}
                            <div className="h-28 bg-slate-100 dark:bg-slate-700 relative flex items-center justify-center overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={item.preview} alt="證件" className="max-h-full max-w-full object-contain" />
                              {(item.status==="pending"||item.status==="scanning") && (
                                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1.5">
                                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                                  <span className="text-[11px] text-white font-medium">
                                    {item.status==="pending"?"等待中":"辨識中…"}
                                  </span>
                                </div>
                              )}
                              {item.status==="error" && (
                                <div className="absolute inset-0 bg-red-900/60 flex items-center justify-center">
                                  <AlertCircle className="w-6 h-6 text-white" />
                                </div>
                              )}
                            </div>
                            {/* info */}
                            <div className="p-2.5 bg-white dark:bg-slate-800 space-y-1.5">
                              {item.status==="error" ? (
                                <p className="text-xs text-red-500">{item.error||"辨識失敗"}</p>
                              ) : item.status==="done" ? (
                                <>
                                  {dtLabel && (
                                    <span className="inline-flex items-center px-1.5 py-px rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-medium">
                                      {dtLabel}
                                    </span>
                                  )}
                                  <input
                                    className="w-full text-sm font-medium border-0 border-b border-transparent hover:border-slate-200 dark:hover:border-slate-600 focus:border-violet-400 focus:outline-none bg-transparent text-slate-800 dark:text-slate-100 py-0.5"
                                    placeholder="姓名"
                                    value={item.form.name}
                                    onChange={e=>updateBulkForm(idx,{name:e.target.value})}
                                  />
                                  <p className="text-[11px] text-slate-400 font-mono truncate">
                                    {item.form.passport||item.form.id_number||item.form.taibao_number||"—"}
                                  </p>
                                  <p className="text-[11px] text-slate-400">{item.form.birthday||"—"}</p>
                                </>
                              ) : (
                                <p className="text-[11px] text-slate-400 text-center py-1">處理中…</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* footer */}
            {!bulkDone && (
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex-shrink-0 flex items-center justify-between gap-3">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {bulkItems.filter(it=>it.status==="done").length > 0 && (
                    <span>
                      已完成 <strong>{bulkItems.filter(it=>it.status==="done"&&it.selected&&it.form.name.trim()).length}</strong> 筆可建立
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={closeBulkScan}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">取消</button>
                  <button
                    onClick={handleBulkCreate}
                    disabled={bulkCreating||bulkProcessing||bulkItems.filter(it=>it.selected&&it.status==="done"&&it.form.name.trim()).length===0}
                    className="px-5 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg disabled:opacity-40 flex items-center gap-1.5">
                    {bulkCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                    {bulkCreating ? "建立中…" : `✓ 批量建立 ${bulkItems.filter(it=>it.selected&&it.status==="done"&&it.form.name.trim()).length} 位旅客`}
                  </button>
                </div>
              </div>
            )}
            {bulkDone && (
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex-shrink-0 flex justify-end">
                <button onClick={closeBulkScan} className="px-5 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg">完成</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MANUAL CREATE MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">新增旅客</h2>
              <button onClick={()=>setShowModal(false)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Field label="姓名 *"><input className={input} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="真實姓名" /></Field></div>
                <Field label="性別"><select className={input} value={form.gender} onChange={e=>setForm({...form,gender:e.target.value as Customer["gender"]})}>
                  <option value="male">男</option><option value="female">女</option><option value="other">其他</option>
                </select></Field>
                <Field label="生日"><input type="date" className={input} value={form.birthday} onChange={e=>setForm({...form,birthday:e.target.value})} /></Field>
                <Field label="電話"><input className={input} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="09xx-xxx-xxx" /></Field>
                <Field label="Email"><input type="email" className={input} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} /></Field>
                <Field label="身分證字號"><input className={input} value={form.id_number} onChange={e=>setForm({...form,id_number:e.target.value})} placeholder="A123456789" /></Field>
                <Field label="護照號碼"><input className={input} value={form.passport} onChange={e=>setForm({...form,passport:e.target.value})} placeholder="A12345678" /></Field>
                <div className="col-span-2"><Field label="地址"><input className={input} value={form.address} onChange={e=>setForm({...form,address:e.target.value})} /></Field></div>
                <Field label="緊急聯絡人"><input className={input} value={form.emergency_contact} onChange={e=>setForm({...form,emergency_contact:e.target.value})} placeholder="姓名" /></Field>
                <Field label="緊急聯絡電話"><input className={input} value={form.emergency_phone} onChange={e=>setForm({...form,emergency_phone:e.target.value})} /></Field>
                <div className="col-span-2"><Field label="備註"><textarea className={input+" h-16 resize-none"} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} /></Field></div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-slate-800">
              <button onClick={()=>setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">取消</button>
              <button onClick={handleCreate} disabled={saving} className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50">
                {saving?"建立中…":"建立"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          IMPORT MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                {importResult?"匯入完成":importStep==="preview"?`匯入預覽（${importRows.length} 筆）`:"匯入旅客名單"}
              </h2>
              <button onClick={closeImport} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5">
              {importStep==="input" && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-300">從 Google Sheets 複製整張表格（含標題列）後貼到下方，或上傳 CSV 檔案。</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">支援欄位：<span className="font-mono">姓名、電話、Email、生日、性別、護照、護照效期、台胞證、台胞證效期、身分證、地址、緊急聯絡人、緊急聯絡電話、備註</span></p>
                  <div>
                    <label className={lbl}>貼上資料（Google Sheets / CSV）</label>
                    <textarea className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm font-mono h-48 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                      placeholder={"姓名\t電話\t生日\t護照\n張小明\t0912345678\t1985-03-20\tA12345678"}
                      value={importText} onChange={e=>setImportText(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">或</span>
                    <input ref={importFileRef} type="file" accept=".csv,.tsv,.txt" className="hidden"
                      onChange={e=>{const f=e.target.files?.[0];if(f)f.text().then(t=>setImportText(t));}} />
                    <button onClick={()=>importFileRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors">
                      <FileSpreadsheet className="w-4 h-4" /> 上傳 CSV / TSV
                    </button>
                    {importText && <span className="text-xs text-emerald-600">✓ 已載入資料</span>}
                  </div>
                </div>
              )}
              {importStep==="preview"&&!importResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <span className="text-emerald-600 font-medium">✓ {importRows.filter(r=>r.errors.length===0&&!r.isDuplicate).length} 筆新增</span>
                    <span className="text-amber-600 font-medium">⚠ {importRows.filter(r=>r.errors.length===0&&r.isDuplicate).length} 筆重複</span>
                    <span className="text-red-500 font-medium">✗ {importRows.filter(r=>r.errors.length>0).length} 筆錯誤</span>
                    <div className="ml-auto flex gap-3">
                      <button onClick={()=>setSelectedRows(new Set(importRows.filter(r=>r.errors.length===0).map(r=>r.rowIndex)))} className="text-xs text-blue-600 hover:underline">全選</button>
                      <button onClick={()=>setSelectedRows(new Set())} className="text-xs text-slate-500 hover:underline">取消全選</button>
                    </div>
                  </div>
                  <div className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                        <tr>
                          <th className="px-3 py-2 w-8"></th>
                          <th className="text-left px-3 py-2">姓名</th>
                          <th className="text-left px-3 py-2">電話</th>
                          <th className="text-left px-3 py-2">生日</th>
                          <th className="text-left px-3 py-2">護照</th>
                          <th className="text-left px-3 py-2">狀態</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                        {importRows.map(row=>(
                          <tr key={row.rowIndex} className={`${row.errors.length>0?"opacity-50":"hover:bg-slate-50 dark:hover:bg-slate-700/40"} transition-colors`}>
                            <td className="px-3 py-2 text-center">
                              <input type="checkbox" disabled={row.errors.length>0} checked={selectedRows.has(row.rowIndex)}
                                onChange={e=>{const next=new Set(selectedRows);if(e.target.checked)next.add(row.rowIndex);else next.delete(row.rowIndex);setSelectedRows(next);}} />
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{row.data.name||"—"}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.data.phone||"—"}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.data.birthday||"—"}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300 font-mono text-xs">{row.data.passport||"—"}</td>
                            <td className="px-3 py-2">
                              {row.errors.length>0 ? <span className="text-xs text-red-500">✗ {row.errors[0]}</span>
                                : row.isDuplicate ? <span className="text-xs text-amber-600">⚠ 可能重複</span>
                                : <span className="text-xs text-emerald-600">✓ 新增</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {importResult && (
                <div className="text-center py-8 space-y-2">
                  <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">匯入完成！</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">成功匯入 <strong>{importResult.success}</strong> 位旅客</p>
                  {importResult.skipped>0 && <p className="text-xs text-slate-400">{importResult.skipped} 筆寫入失敗</p>}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 sticky bottom-0 bg-white dark:bg-slate-800 flex items-center justify-between gap-3">
              {importResult ? (
                <div className="ml-auto"><button onClick={closeImport} className="px-5 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg">完成</button></div>
              ) : importStep==="preview" ? (
                <>
                  <button onClick={()=>setImportStep("input")} className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">← 返回修改</button>
                  <div className="flex gap-2">
                    <button onClick={closeImport} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">取消</button>
                    <button onClick={handleImport} disabled={importing||selectedRows.size===0}
                      className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                      {importing&&<Loader2 className="w-4 h-4 animate-spin" />}
                      {importing?"匯入中…":`✓ 匯入 ${selectedRows.size} 筆旅客`}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div />
                  <div className="flex gap-2">
                    <button onClick={closeImport} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">取消</button>
                    <button onClick={parseAndPreview} disabled={!importText.trim()} className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">下一步：預覽 →</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SINGLE SCAN MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {showScan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-emerald-600" /> 掃描證件快速建檔
              </h2>
              <button onClick={closeScan} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div>
                <label className={lbl}>證件類型</label>
                <div className="flex gap-2">
                  {([ ["passport","🛂 護照"],["idCard","🪪 身分證"],["taibao","🏮 台胞證"] ] as [DocType,string][]).map(([v,label])=>(
                    <button key={v} onClick={()=>{setDocType(v);setScanStatus("idle");setScanImg("");setOcrResult(null);}}
                      className={`flex-1 py-2 text-sm rounded-lg border transition-colors font-medium ${
                        docType===v ? "bg-emerald-600 text-white border-emerald-600" : "text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-emerald-400"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={lbl}>上傳證件照片</label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e=>{const f=e.target.files?.[0];if(f)handleFileSelect(f);}} />
                <div onClick={()=>fileRef.current?.click()} onDrop={handleDrop} onDragOver={e=>e.preventDefault()}
                  className={`relative border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                    scanStatus==="scanning" ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/10" : "border-slate-200 dark:border-slate-600 hover:border-emerald-400 hover:bg-emerald-50/30"
                  }`}>
                  {scanImg ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={scanImg} alt="證件預覽" className="w-full max-h-52 object-contain rounded-xl" />
                      {scanStatus==="scanning" && (
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
                {scanStatus==="done" && <p className="mt-2 text-sm text-emerald-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> 辨識完成，請確認下方資料</p>}
                {scanStatus==="error" && <p className="mt-2 text-sm text-red-500 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {scanError}</p>}
              </div>
              {scanStatus==="done" && (
                <>
                  {duplicates.length>0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                      <p className="font-semibold mb-2">⚠️ 資料庫中已有疑似相同旅客，是否要合併證件資料？</p>
                      {duplicates.map(d=>(
                        <div key={d.id} className="flex items-center justify-between py-2 border-b border-amber-100 dark:border-amber-700/50 last:border-0">
                          <div className="flex items-center gap-2">
                            <Link href={`/admin/crm/${d.id}`} target="_blank" className="text-violet-600 dark:text-violet-400 hover:underline font-medium">{d.name}</Link>
                            <span className="text-amber-700 dark:text-amber-400 text-xs">{d.phone} · {d.birthday}</span>
                          </div>
                          <button onClick={()=>handleMerge(d.id)} disabled={creating}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                            {creating&&<Loader2 className="w-3 h-3 animate-spin" />} 合併到此旅客
                          </button>
                        </div>
                      ))}
                      <p className="mt-2 text-amber-600 dark:text-amber-400 text-xs">若確認是全新旅客，請忽略提示並點「建立旅客」。</p>
                    </div>
                  )}
                  <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">辨識結果（可編輯）</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2"><label className={lbl}>中文姓名 *</label><input className={input} value={scanForm.name} onChange={e=>setScanForm({...scanForm,name:e.target.value})} /></div>
                      <div className="col-span-2"><label className={lbl}>英文拼音姓名</label><input className={input} value={scanForm.name_en} onChange={e=>setScanForm({...scanForm,name_en:e.target.value})} /></div>
                      <div><label className={lbl}>性別</label>
                        <select className={input} value={scanForm.gender} onChange={e=>setScanForm({...scanForm,gender:e.target.value as Customer["gender"]})}>
                          <option value="male">男</option><option value="female">女</option><option value="other">其他</option>
                        </select>
                      </div>
                      <div><label className={lbl}>生日</label><input type="date" className={input} value={scanForm.birthday} onChange={e=>setScanForm({...scanForm,birthday:e.target.value})} /></div>
                      {docType==="passport" ? (<>
                        <div><label className={lbl}>護照號碼</label><input className={input} value={scanForm.passport} onChange={e=>setScanForm({...scanForm,passport:e.target.value})} /></div>
                        <div><label className={lbl}>護照效期</label><input type="date" className={input} value={scanForm.passport_expiry} onChange={e=>setScanForm({...scanForm,passport_expiry:e.target.value})} /></div>
                      </>) : docType==="taibao" ? (<>
                        <div><label className={lbl}>台胞證號碼</label><input className={input} value={scanForm.taibao_number} onChange={e=>setScanForm({...scanForm,taibao_number:e.target.value})} /></div>
                        <div><label className={lbl}>台胞證效期</label><input type="date" className={input} value={scanForm.taibao_expiry} onChange={e=>setScanForm({...scanForm,taibao_expiry:e.target.value})} /></div>
                      </>) : (
                        <div className="col-span-2"><label className={lbl}>身分證字號</label><input className={input} value={scanForm.id_number} onChange={e=>setScanForm({...scanForm,id_number:e.target.value})} placeholder="A123456789" /></div>
                      )}
                      <div><label className={lbl}>電話（可補填）</label><input className={input} value={scanForm.phone} onChange={e=>setScanForm({...scanForm,phone:e.target.value})} placeholder="09xx-xxx-xxx" /></div>
                      <div><label className={lbl}>Email（可補填）</label><input type="email" className={input} value={scanForm.email} onChange={e=>setScanForm({...scanForm,email:e.target.value})} /></div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 sticky bottom-0 bg-white dark:bg-slate-800 flex items-center justify-between gap-3">
              <button onClick={()=>{setScanStatus("idle");setScanImg("");setOcrResult(null);setDuplicates([]);}}
                className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline">重新上傳</button>
              <div className="flex gap-2">
                <button onClick={closeScan} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">取消</button>
                {scanStatus==="done" && (
                  <button onClick={handleScanCreate} disabled={creating||!scanForm.name.trim()}
                    className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                    {creating&&<Loader2 className="w-4 h-4 animate-spin" />}
                    {creating?"建立中…":"✓ 建立旅客"}
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
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
