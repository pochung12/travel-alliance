"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Customer, Tour } from "@/lib/supabase";
import {
  Plus, Search, Users, ScanLine, Upload, FileSpreadsheet,
  Loader2, CheckCircle, AlertCircle, X, Settings, Tag, Trash2, CheckCircle2, Layers,
  GitMerge, ChevronRight, ArrowUp, ArrowDown, ChevronsUpDown, Pencil, Copy, Check,
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
  customers: Customer[];
  selected: boolean;
  keepId: string;
  fieldChoices: Record<string, string | 'clear'>; // customer id | clear
  smartInfo: Record<string, string>;  // field key → reason for auto-selection
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
const CRM_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 80] as const;

// ─── Traditional → Simplified Chinese character map ──────────────────────────
const T2S: Record<string,string> = {
  // ── 常見姓氏 ──
  '陳':'陈','張':'张','劉':'刘','楊':'杨','趙':'赵','吳':'吴','孫':'孙','馬':'马',
  '鄭':'郑','盧':'卢','謝':'谢','許':'许','韓':'韩','鄧':'邓','蕭':'萧','馮':'冯',
  '蔣':'蒋','錢':'钱','葉':'叶','龔':'龚','蘇':'苏','嚴':'严','龍':'龙','鐘':'钟',
  '賴':'赖','歐':'欧','區':'区','莊':'庄','呂':'吕','顏':'颜','顧':'顾','龐':'庞',
  '陸':'陆','簡':'简','關':'关','繆':'缪','鄒':'邹','鄔':'邬','鮑':'鲍','齊':'齐',
  '魏':'魏','薛':'薛','賀':'贺','賈':'贾','駱':'骆','鞏':'巩','鄺':'邝','覃':'覃',
  '黃':'黄','聶':'聂','彭':'彭','翁':'翁','凌':'凌','唐':'唐','熊':'熊','尹':'尹',
  '湯':'汤','鞠':'鞠','喬':'乔','橋':'桥','閻':'阎','闕':'阙',
  '闞':'阚','隗':'隗','縣':'县','繩':'绳','繪':'绘','織':'织','綠':'绿',
  // ── 常見名字用字 ──
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
  '輕':'轻','過':'过','還':'还','說':'说','後':'后','機':'机','帶':'带',
  '會':'会','對':'对','樣':'样','給':'给','話':'话','錯':'错','親':'亲',
  '頭':'头','門':'门','邊':'边','塊':'块','種':'种','風':'风','歷':'历',
  '澤':'泽','諾':'诺','彥':'彦','傑':'杰','禮':'礼','悅':'悦','寬':'宽',
  '寧':'宁','崗':'岗','燦':'灿','熾':'炽','煒':'炜','顯':'显','懷':'怀',
  '誠':'诚','讚':'赞','覺':'觉','讀':'读','豔':'艳',
  '禱':'祷','禦':'御','諭':'谕','謁':'谒','謂':'谓','謙':'谦',
  '謹':'谨','譜':'谱','護':'护','變':'变','邏':'逻','選':'选',
  '醫':'医','釋':'释','鑒':'鉴','鑑':'鉴','鐵':'铁','鏡':'镜',
  '鏈':'链','離':'离','難':'难','雙':'双','雞':'鸡',
  '靈':'灵','韻':'韵','響':'响','頻':'频','願':'愿','預':'预','飛':'飞',
  // ── 全形→半形數字/字母 ──
  '０':'0','１':'1','２':'2','３':'3','４':'4','５':'5','６':'6','７':'7','８':'8','９':'9',
};

function normalizeChineseName(name: string): string {
  return name.trim()
    .replace(/[\s　・·•　]+/g, '')   // 移除所有空格（含全形空格）
    .split('').map(ch => T2S[ch] ?? ch)
    .join('').toLowerCase();
}

// ─── Levenshtein 編輯距離 ─────────────────────────────────────────────────────
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99; // quick reject
  const prev = Array.from({length: n+1}, (_,i) => i);
  const curr = new Array(n+1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i-1] === b[j-1]
        ? prev[j-1]
        : 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
    }
    prev.splice(0, n+1, ...curr);
  }
  return prev[n];
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
  { key:'meal_preference',   label:'餐食偏好' },
];

// ── 智慧合併：自動判斷最佳欄位選擇 ──────────────────────────────────────────
function buildSmartChoices(customers: Customer[]): {
  choices: Record<string, string|'clear'>;
  smartInfo: Record<string, string>;
} {
  const choices: Record<string, string|'clear'> = {};
  const smartInfo: Record<string, string> = {};

  const newestFor = (expiryKey: 'passport_expiry'|'taibao_expiry', numberKey: 'passport'|'taibao_number', imageKey: 'passport_image'|'taibao_image') => {
    const candidates = customers.filter(c => c[expiryKey] || c[numberKey] || c[imageKey]);
    const newest = [...candidates].sort((a,b) => {
      const ta = a[expiryKey] ? new Date(a[expiryKey]).getTime() : 0;
      const tb = b[expiryKey] ? new Date(b[expiryKey]).getTime() : 0;
      return tb - ta;
    })[0] || customers[0];
    choices[numberKey] = newest.id;
    choices[expiryKey] = newest.id;
    choices[imageKey] = newest.id;
    smartInfo[numberKey] = newest[expiryKey]
      ? `自動保留最新效期（${newest[expiryKey]}）`
      : '有證件資料者優先';
    if (newest[expiryKey]) smartInfo[expiryKey] = smartInfo[numberKey];
  };
  newestFor('passport_expiry','passport','passport_image');
  newestFor('taibao_expiry','taibao_number','taibao_image');

  // ── 其他欄位：非空優先；都有值時以甲方為預設 ──
  const others = [
    'name','name_en','phone','email','birthday','gender',
    'id_number','id_card_image',
    'address','emergency_contact','emergency_phone','notes','meal_preference',
  ] as (keyof Customer)[];
  for (const key of others) {
    const source = customers.find(c => {
      const value = c[key];
      return value !== '' && value !== null && value !== undefined && !(key === 'gender' && value === 'other');
    }) || customers[0];
    choices[key] = source.id;
    const populated = customers.filter(c => !!c[key]).length;
    if (populated === 1) smartInfo[key] = `僅 ${source.name} 有資料`;
  }

  return { choices, smartInfo };
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
  { key: "passport",          label: "護照（號碼＋效期）", width: 170, visible: true  },
  { key: "passport_image",    label: "護照照片",   width: 110, visible: false },
  { key: "taibao_number",     label: "台胞證（號碼＋效期）", width: 170, visible: false },
  { key: "taibao_image",      label: "台胞證照片", width: 110, visible: false },
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

// OCR 是 LLM 輸出，值不保證合規；DB 有 gender CHECK 約束與 DATE 型別，
// 一筆髒值會讓整批 insert 全部回滾 → 進 DB 前一律先消毒。
function sanitizeGender(g: unknown): Customer["gender"] {
  const s = String(g ?? "").trim().toLowerCase();
  if (s === "male"   || s === "m" || s === "男") return "male";
  if (s === "female" || s === "f" || s === "女") return "female";
  return "other";
}
function sanitizeDate(d: unknown): string {
  if (!d) return "";
  const s = String(d).trim()
    .replace(/(\d{4})[年./](\d{1,2})[月./](\d{1,2})日?/, "$1-$2-$3");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return "";
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return isNaN(Date.parse(iso)) ? "" : iso;
}

function inferOcrDocType(ocr: OcrResult): DocType | null {
  const raw = (ocr.docType || "").toLowerCase();
  if (ocr.passport || raw.includes("passport") || raw.includes("護照")) return "passport";
  if (ocr.taibaoNumber || raw.includes("taibao") || raw.includes("台胞") || raw.includes("mainland")) return "taibao";
  if (ocr.idNumber || raw.includes("idcard") || raw.includes("id_card") || raw.includes("身分證")) return "idCard";
  return null;
}

function buildFormFromOcr(ocr: OcrResult, imageB64: string): Omit<Customer, "id" | "created_at"> {
  const form = { ...EMPTY };
  form.name     = ocr.name     ?? "";
  form.name_en  = ocr.nameEn   ?? "";
  form.birthday = sanitizeDate(ocr.birthday);
  form.gender   = sanitizeGender(ocr.gender);
  const dt = inferOcrDocType(ocr);
  if (dt === "passport") {
    form.passport        = ocr.passport ?? "";
    form.passport_expiry = sanitizeDate(ocr.passportExpiry);
    form.passport_image  = imageB64;
    if (ocr.idNumber) form.id_number = ocr.idNumber;
  } else if (dt === "taibao") {
    form.taibao_number = ocr.taibaoNumber ?? "";
    form.taibao_expiry = sanitizeDate(ocr.taibaoExpiry);
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

async function hashImageData(imageData: string): Promise<string> {
  const bytes = new TextEncoder().encode(imageData);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// ─── Copy button（懸停顯示，點擊複製欄位內容） ────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text || text === "—") return null;
  return (
    <button
      onClick={e => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      title={`複製「${text.length > 24 ? text.slice(0, 24) + "…" : text}」`}
      className={`opacity-0 group-hover/cell:opacity-100 transition-opacity p-0.5 flex-shrink-0 ${
        copied ? "!opacity-100 text-emerald-500" : "text-slate-300 dark:text-slate-600 hover:text-blue-500"
      }`}>
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ─── Expiry badge ─────────────────────────────────────────────────────────────
function ExpiryBadge({ dateStr }: { dateStr?: string }) {
  if (!dateStr) return <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>;
  const today = new Date(); today.setHours(0,0,0,0);
  const exp   = new Date(dateStr);
  const days  = Math.floor((exp.getTime() - today.getTime()) / 86400000);
  const label = exp.toLocaleDateString("zh-TW");
  const badge =
    days < 0   ? <span className="px-1 py-px rounded text-[9px] font-semibold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 whitespace-nowrap leading-none">過期</span> :
    days <= 90 ? <span className="px-1 py-px rounded text-[9px] font-semibold bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 whitespace-nowrap leading-none">快到期</span> :
                 <span className="px-1 py-px rounded text-[9px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 whitespace-nowrap leading-none">有效</span>;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{label}</span>
      {badge}
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
  const [pageSize, setPageSize]   = useState<number>(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [docImages, setDocImages] = useState<Record<string, { passport_image?: string; taibao_image?: string }>>({});
  const [docImagesLoading, setDocImagesLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ src: string; label: string; x: number; y: number } | null>(null);

  // tour records per customer
  const [custTours, setCustTours] = useState<Record<string, Pick<Tour,"id"|"name">[]>>({});
  const [allTours,  setAllTours]  = useState<Pick<Tour,"id"|"name"|"status">[]>([]);
  const [tourPickerId, setTourPickerId] = useState<string|null>(null);

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
  // sort
  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [colSaved,    setColSaved]    = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const [dragCol,     setDragCol]     = useState<string|null>(null);
  const [dragOverCol, setDragOverCol] = useState<string|null>(null);
  const resizeRef = useRef<{key:string;startX:number;startW:number}|null>(null);
  // freeze
  const [frozenHeader, setFrozenHeader] = useState(true);
  const [frozenCols,   setFrozenCols]   = useState<0|1|2>(1);

  // ── localStorage cols + freeze ────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ta_crm_columns");
      if (saved) {
        const parsed: ColDef[] = JSON.parse(saved);
        // 濾掉已下架的欄位（如舊版獨立的 passport_expiry/taibao_expiry），並套用最新 label
        const defs = new Map(ALL_COLS.map(c=>[c.key,c]));
        const valid = parsed.filter(c=>defs.has(c.key)).map(c=>({ ...c, label: defs.get(c.key)!.label }));
        const savedKeys = new Set(valid.map(c=>c.key));
        setColumns([...valid, ...ALL_COLS.filter(c=>!savedKeys.has(c.key))]);
      }
      const freeze = localStorage.getItem("ta_crm_freeze");
      if (freeze) {
        const f = JSON.parse(freeze);
        if (typeof f.frozenHeader === "boolean") setFrozenHeader(f.frozenHeader);
        if ([0,1,2].includes(f.frozenCols)) setFrozenCols(f.frozenCols as 0|1|2);
      }
      const savedPageSize = Number(localStorage.getItem("ta_crm_page_size"));
      if (CRM_PAGE_SIZE_OPTIONS.includes(savedPageSize as typeof CRM_PAGE_SIZE_OPTIONS[number])) {
        setPageSize(savedPageSize);
      }
    } catch {}
  }, []);

  const saveColumns = () => {
    localStorage.setItem("ta_crm_columns", JSON.stringify(columns));
    localStorage.setItem("ta_crm_freeze", JSON.stringify({ frozenHeader, frozenCols }));
    setColSaved(true); setTimeout(()=>setColSaved(false), 1500);
  };

  // 欄位異動（調寬度/拖排序/勾顯示/凍結）自動儲存，不必按「儲存欄位設定」，重整不再跳回
  const colsAutoSaveReady = useRef(false);
  useEffect(() => {
    if (!colsAutoSaveReady.current) { colsAutoSaveReady.current = true; return; }
    const t = setTimeout(() => {
      localStorage.setItem("ta_crm_columns", JSON.stringify(columns));
      localStorage.setItem("ta_crm_freeze", JSON.stringify({ frozenHeader, frozenCols }));
    }, 400);
    return () => clearTimeout(t);
  }, [columns, frozenHeader, frozenCols]);
  const resetColumns = () => {
    localStorage.removeItem("ta_crm_columns");
    localStorage.removeItem("ta_crm_freeze");
    setColumns(ALL_COLS.map(c=>({...c})));
    setFrozenHeader(true);
    setFrozenCols(1);
  };

  // ── load ──────────────────────────────────────────────────────────────────
  // ⚡ 不載入 base64 圖片欄位（id_card_image/passport_image/taibao_image），列表頁用不到
  const LIST_COLS = [
    "id","name","name_en","gender","birthday","phone","email",
    "id_number","passport","passport_expiry",
    "taibao_number","taibao_expiry",
    "address","emergency_contact","emergency_phone",
    "notes","meal_preference","created_at",
  ].join(",");

  const load = async () => {
    // 先嘗試精簡欄位查詢；若欄位不存在（如 meal_preference 尚未 migrate）自動降級為 select("*")
    let { data, error } = await supabase
      .from("customers")
      .select(LIST_COLS)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("CRM list select fallback:", error.message);
      ({ data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false }));
    }
    setCustomers((data || []) as unknown as Customer[]);
    setLoading(false);
  };

  const loadLabels = async () => {
    // ⚡ 兩個 query 並行
    const [{ data: labels }, { data: cl }] = await Promise.all([
      supabase.from("crm_labels").select("*").order("created_at"),
      supabase.from("customer_labels").select("customer_id, label_id"),
    ]);
    setAllLabels((labels || []) as CrmLabel[]);
    const map: Record<string, string[]> = {};
    (cl || []).forEach((row: { customer_id: string; label_id: string }) => {
      if (!map[row.customer_id]) map[row.customer_id] = [];
      map[row.customer_id].push(row.label_id);
    });
    setCustLabels(map);
  };

  const loadCustTours = async () => {
    const [{ data }, { data: tours }] = await Promise.all([
      supabase.from("customer_tours").select("customer_id, tours(id, name)").neq("status", "cancelled"),
      supabase.from("tours").select("id,name,status").order("start_date", { ascending: false }),
    ]);
    const map: Record<string, Pick<Tour, "id" | "name">[]> = {};
    (data || []).forEach((row: { customer_id: string; tours: { id: string; name: string }[] | null }) => {
      const tourArr = Array.isArray(row.tours) ? row.tours : (row.tours ? [row.tours] : []);
      tourArr.forEach(t => {
        if (!map[row.customer_id]) map[row.customer_id] = [];
        if (!map[row.customer_id].find(x => x.id === t.id))
          map[row.customer_id].push({ id: t.id, name: t.name });
      });
    });
    setCustTours(map);
    setAllTours((tours || []) as Pick<Tour,"id"|"name"|"status">[]);
  };

  const toggleCustTour = async (custId: string, tour: Pick<Tour,"id"|"name">) => {
    const already = (custTours[custId] || []).find(t => t.id === tour.id);
    if (already) {
      if (!confirm(`確定移除「${customers.find(c=>c.id===custId)?.name}」從「${tour.name}」？`)) return;
      const { error } = await supabase.from("customer_tours").delete()
        .eq("customer_id", custId).eq("tour_id", tour.id);
      if (error) { alert("移除失敗：" + error.message); return; }
      setCustTours(prev => ({ ...prev, [custId]: (prev[custId]||[]).filter(t=>t.id!==tour.id) }));
    } else {
      const cust = customers.find(c => c.id === custId);
      const row: Record<string, unknown> = {
        customer_id: custId,
        tour_id: tour.id,
        status: "registered",
        paid_amount: 0,
        notes: "",
        meal_preference: cust?.meal_preference || "",
      };
      const { error } = await supabase.from("customer_tours").insert([row]);
      if (error) { alert("加入失敗：" + error.message); return; }
      setCustTours(prev => ({ ...prev, [custId]: [...(prev[custId]||[]), { id: tour.id, name: tour.name }] }));
    }
  };

  // ⚡ 三個查詢全部並行
  useEffect(() => { Promise.all([load(), loadLabels(), loadCustTours()]); }, []);

  // 證件圖片是 base64 大欄位：只有使用者勾選圖片欄位時才批次載入，避免 CRM 列表平時浪費流量。
  const passportImageVisible = columns.some(c => c.key === "passport_image" && c.visible);
  const taibaoImageVisible = columns.some(c => c.key === "taibao_image" && c.visible);
  useEffect(() => {
    if ((!passportImageVisible && !taibaoImageVisible) || customers.length === 0) return;
    const missingIds = customers
      .filter(c => {
        const cached = docImages[c.id];
        return !cached ||
          (passportImageVisible && cached.passport_image === undefined) ||
          (taibaoImageVisible && cached.taibao_image === undefined);
      })
      .map(c => c.id);
    if (missingIds.length === 0) return;

    let cancelled = false;
    const fields = ["id"];
    if (passportImageVisible) fields.push("passport_image");
    if (taibaoImageVisible) fields.push("taibao_image");
    setDocImagesLoading(true);
    supabase.from("customers").select(fields.join(",")).in("id", missingIds).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn("CRM document image load failed:", error.message);
      } else {
        setDocImages(prev => {
          const next = { ...prev };
          (data || []).forEach(row => {
            const item = row as unknown as { id: string; passport_image?: string | null; taibao_image?: string | null };
            next[item.id] = {
              ...next[item.id],
              ...(passportImageVisible ? { passport_image: item.passport_image || "" } : {}),
              ...(taibaoImageVisible ? { taibao_image: item.taibao_image || "" } : {}),
            };
          });
          return next;
        });
      }
      setDocImagesLoading(false);
    });
    return () => { cancelled = true; };
  }, [customers, passportImageVisible, taibaoImageVisible, docImages]);

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

  // ── sort ──────────────────────────────────────────────────────────────────
  const DATE_KEYS = new Set(["birthday","passport_expiry","taibao_expiry","created_at"]);
  const sorted = [...filtered].sort((a, b) => {
    let av: string | number, bv: string | number;
    if (sortKey === "tours") {
      av = (custTours[a.id] || []).length;
      bv = (custTours[b.id] || []).length;
    } else if (DATE_KEYS.has(sortKey)) {
      av = (a as unknown as Record<string,string>)[sortKey] ? new Date((a as unknown as Record<string,string>)[sortKey]).getTime() : 0;
      bv = (b as unknown as Record<string,string>)[sortKey] ? new Date((b as unknown as Record<string,string>)[sortKey]).getTime() : 0;
    } else {
      av = ((a as unknown as Record<string,string>)[sortKey] || "").toLowerCase();
      bv = ((b as unknown as Record<string,string>)[sortKey] || "").toLowerCase();
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const paginatedCustomers = sorted.slice(pageStart, pageStart + pageSize);
  const pageWindowStart = Math.max(1, Math.min(safeCurrentPage - 2, totalPages - 4));
  const visiblePageNumbers = Array.from({length: Math.min(5, totalPages)}, (_,i)=>pageWindowStart+i);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterLabelId, sortKey, sortDir, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const changePageSize = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    localStorage.setItem("ta_crm_page_size", String(size));
  };

  const cycleSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortKey("created_at"); setSortDir("desc"); }
  };

  const visibleCols = columns.filter(c => c.visible);

  // 計算凍結欄的 left offset
  const colLeftOffset: number[] = visibleCols.reduce<number[]>((acc, col, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + visibleCols[i - 1].width);
    return acc;
  }, []);

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
          // 手機原圖常超過數 MB；保留足夠 OCR/證件閱讀的清晰度，同時避免 Supabase 請求體過大。
          const b64 = await compressImage(files[idx], 1800, 0.85);
          const res = await fetch("/api/ocr/document",{
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({imageBase64:b64, docType:"auto"}),
          });
          const ocr: OcrResult & {error?:string} = await res.json();
          if (ocr.error) throw new Error(ocr.error);
          const form = buildFormFromOcr(ocr, b64);
          setBulkItems(prev=>prev.map((it,i)=>i===idx?{...it,status:"done",detectedType:inferOcrDocType(ocr),ocr,form}:it));
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

    // 同一人可能同時上傳護照與台胞證，先合併為一筆，避免產生重複旅客。
    type BulkPerson = { uids: string[]; form: Omit<Customer,"id"|"created_at"> };
    const grouped = new Map<string, BulkPerson>();
    for (const item of toCreate) {
      const nameKey = normalizeChineseName(item.form.name);
      const enKey = (item.form.name_en || "").replace(/[^a-z]/gi, "").toLowerCase();
      const key = nameKey ? `name:${nameKey}` : `en:${enKey}`;
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, { uids: [item.uid], form: { ...item.form } });
        continue;
      }
      const merged = { ...current.form };
      (Object.keys(item.form) as (keyof typeof item.form)[]).forEach(field => {
        const value = item.form[field];
        if (value !== "" && value !== null && value !== undefined && !(field === "gender" && value === "other")) {
          (merged as unknown as Record<string, unknown>)[field] = value;
        }
      });
      grouped.set(key, { uids: [...current.uids, item.uid], form: merged });
    }

    const createdUids = new Set<string>();
    const failures: {uid:string; msg:string}[] = [];

    for (const person of Array.from(grouped.values())) {
      const f = person.form;
      const normalizedName = normalizeChineseName(f.name);
      const normalizedEn = (f.name_en || "").replace(/[^a-z]/gi, "").toLowerCase();
      const existing = customers.find(c =>
        normalizeChineseName(c.name) === normalizedName ||
        (!!normalizedEn && (c.name_en || "").replace(/[^a-z]/gi, "").toLowerCase() === normalizedEn)
      );

      let error: { message: string } | null = null;
      if (existing) {
        // 只寫入本次真正辨識到的欄位，不用空值清掉 CRM 既有資料。
        const updates: Record<string, unknown> = {};
        (Object.keys(f) as (keyof typeof f)[]).forEach(field => {
          const value = f[field];
          if (value !== "" && value !== null && value !== undefined && !(field === "gender" && value === "other")) updates[field] = value;
        });
        if (f.birthday) updates.birthday = sanitizeDate(f.birthday) || null;
        if (f.passport_expiry) updates.passport_expiry = sanitizeDate(f.passport_expiry) || null;
        if (f.taibao_expiry) updates.taibao_expiry = sanitizeDate(f.taibao_expiry) || null;
        const result = await supabase.from("customers").update(updates).eq("id", existing.id);
        error = result.error;
      } else {
        const payload = {
          ...f,
          gender: sanitizeGender(f.gender),
          birthday: sanitizeDate(f.birthday)||null,
          passport_expiry: sanitizeDate(f.passport_expiry)||null,
          taibao_expiry: sanitizeDate(f.taibao_expiry)||null,
        };
        const result = await supabase.from("customers").insert([payload]);
        error = result.error;
      }

      if (error) person.uids.forEach(uid => failures.push({ uid, msg: error!.message }));
      else person.uids.forEach(uid => createdUids.add(uid));
    }
    setBulkCreating(false);
    // 讓列表的護照／台胞證縮圖立即重新向 DB 取得。
    setDocImages({});
    if (failures.length===0) {
      setBulkDone({success:grouped.size}); load(); return;
    }
    // 有失敗：成功的移出列表，失敗的標記錯誤留在畫面上
    setBulkItems(prev=>prev
      .filter(it=>!createdUids.has(it.uid))
      .map(it=>{
        const f = failures.find(x=>x.uid===it.uid);
        return f ? {...it, status:"error" as const, error:`建立失敗：${f.msg}`} : it;
      }));
    if (createdUids.size>0) load();
    alert(`成功儲存 ${createdUids.size} 張證件、失敗 ${failures.length} 張。\n失敗原因（第一筆）：${failures[0].msg}\n失敗的照片已標紅保留在列表中。`);
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
      preForm.birthday= sanitizeDate(json.birthday);
      preForm.gender  = sanitizeGender(json.gender);
      if (docType==="passport") {
        preForm.passport        = json.passport ??"";
        preForm.passport_expiry = sanitizeDate(json.passportExpiry);
        preForm.passport_image  = b64;
      } else if (docType==="taibao") {
        preForm.taibao_number = json.taibaoNumber ??"";
        preForm.taibao_expiry = sanitizeDate(json.taibaoExpiry);
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
  const openMerge = async () => {
    const pairs = new Map<string, { customers: [Customer,Customer]; reasons: string[] }>();
    const addPair = (a:Customer, b:Customer, reason:string) => {
      const key = [a.id,b.id].sort().join(":");
      if (!pairs.has(key)) pairs.set(key,{customers:[a,b],reasons:[]});
      pairs.get(key)!.reasons.push(reason);
    };
    // ① 姓名完全相同（含繁→簡轉換、去空格）
    const byName = new Map<string,Customer[]>();
    customers.forEach(c => {
      if (!c.name?.trim()) return;
      const k = normalizeChineseName(c.name);
      if (!byName.has(k)) byName.set(k,[]);
      byName.get(k)!.push(c);
    });
    byName.forEach(cs => {
      if (cs.length<2) return;
      for (let i=0;i<cs.length;i++) for (let j=i+1;j<cs.length;j++)
        addPair(cs[i],cs[j],"姓名相同（含繁簡轉換）");
    });

    // ② 護照號碼相同
    const byPass = new Map<string,Customer[]>();
    customers.forEach(c => {
      if (!c.passport?.trim()) return;
      const k = c.passport.trim().toUpperCase();
      if (!byPass.has(k)) byPass.set(k,[]);
      byPass.get(k)!.push(c);
    });
    byPass.forEach(cs => {
      if (cs.length<2) return;
      for (let i=0;i<cs.length;i++) for (let j=i+1;j<cs.length;j++)
        addPair(cs[i],cs[j],"護照號碼相同");
    });

    // ③ 身分證字號相同
    const byId = new Map<string,Customer[]>();
    customers.forEach(c => {
      if (!c.id_number?.trim()) return;
      const k = c.id_number.trim().toUpperCase();
      if (!byId.has(k)) byId.set(k,[]);
      byId.get(k)!.push(c);
    });
    byId.forEach(cs => {
      if (cs.length<2) return;
      for (let i=0;i<cs.length;i++) for (let j=i+1;j<cs.length;j++)
        addPair(cs[i],cs[j],"身分證字號相同");
    });

    // ④ 台胞證號碼相同
    const byTaibao = new Map<string,Customer[]>();
    customers.forEach(c => {
      if (!c.taibao_number?.trim()) return;
      const k = c.taibao_number.trim().toUpperCase();
      if (!byTaibao.has(k)) byTaibao.set(k,[]);
      byTaibao.get(k)!.push(c);
    });
    byTaibao.forEach(cs => {
      if (cs.length<2) return;
      for (let i=0;i<cs.length;i++) for (let j=i+1;j<cs.length;j++)
        addPair(cs[i],cs[j],"台胞證號碼相同");
    });

    // ⑤ 手機號碼相同（去除空格/符號，至少 8 碼）
    const byPhone = new Map<string,Customer[]>();
    customers.forEach(c => {
      if (!c.phone?.trim()) return;
      const k = c.phone.replace(/[\s\-\(\)\+]/g,'').replace(/^886/,'0').replace(/^0886/,'0');
      if (k.length < 8) return;
      if (!byPhone.has(k)) byPhone.set(k,[]);
      byPhone.get(k)!.push(c);
    });
    byPhone.forEach(cs => {
      if (cs.length<2) return;
      for (let i=0;i<cs.length;i++) for (let j=i+1;j<cs.length;j++)
        addPair(cs[i],cs[j],"手機號碼相同");
    });

    // ⑥ 模糊姓名：編輯距離 ≤ 1（名字 ≥ 3 字才比，避免誤判）
    for (let i=0;i<customers.length;i++) {
      for (let j=i+1;j<customers.length;j++) {
        const a = customers[i], b = customers[j];
        const na = normalizeChineseName(a.name||'');
        const nb = normalizeChineseName(b.name||'');
        if (na===nb || na.length<3 || nb.length<3) continue;
        if (editDistance(na,nb)===1)
          addPair(a,b,`姓名相似（差1字）`);
      }
    }

    // ⑦ 相同生日 + 姓名前兩字相同（常見於繁簡字差異未被轉換到的情形）
    for (let i=0;i<customers.length;i++) {
      for (let j=i+1;j<customers.length;j++) {
        const a = customers[i], b = customers[j];
        if (!a.birthday || !b.birthday || a.birthday!==b.birthday) continue;
        const na = normalizeChineseName(a.name||'');
        const nb = normalizeChineseName(b.name||'');
        if (na.length<2 || nb.length<2) continue;
        if (na.slice(0,2)===nb.slice(0,2))
          addPair(a,b,'生日相同且姓名相似');
      }
    }
    // 將 A-B、B-C 這種相連的配對合併成同一組，一次列出全部重複旅客。
    const parent = new Map<string,string>();
    const find = (id:string):string => {
      const p = parent.get(id) || id;
      if (p === id) { parent.set(id,id); return id; }
      const root = find(p); parent.set(id,root); return root;
    };
    const union = (a:string,b:string) => {
      const ra=find(a), rb=find(b);
      if (ra!==rb) parent.set(rb,ra);
    };
    pairs.forEach(({customers:[a,b]}) => union(a.id,b.id));

    const components = new Map<string,{ids:Set<string>;reasons:Set<string>}>();
    pairs.forEach(({customers:[a,b],reasons}) => {
      const root=find(a.id);
      if (!components.has(root)) components.set(root,{ids:new Set(),reasons:new Set()});
      const comp=components.get(root)!;
      comp.ids.add(a.id); comp.ids.add(b.id);
      reasons.forEach(r=>comp.reasons.add(r));
    });

    // 列表平時不載入 base64；只在開啟合併時取得候選人的完整證件與照片。
    const candidateIds = Array.from(new Set(Array.from(components.values()).flatMap(c=>Array.from(c.ids))));
    let fullById = new Map<string,Customer>();
    if (candidateIds.length > 0) {
      const {data,error} = await supabase.from("customers").select("*").in("id",candidateIds);
      if (error) { alert("載入完整證件資料失敗："+error.message); return; }
      fullById = new Map(((data||[]) as Customer[]).map(c=>[c.id,c]));
    }

    const groups: DupGroup[] = [];
    components.forEach((comp) => {
      const groupCustomers = Array.from(comp.ids)
        .map(id=>fullById.get(id) || customers.find(c=>c.id===id))
        .filter(Boolean) as Customer[];
      if (groupCustomers.length < 2) return;
      groupCustomers.sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
      const { choices, smartInfo } = buildSmartChoices(groupCustomers);
      groups.push({
        id:groupCustomers.map(c=>c.id).sort().join(":"),
        reasons:Array.from(comp.reasons), customers:groupCustomers, selected:false,
        keepId:groupCustomers[0].id, fieldChoices:choices, smartInfo,
      });
    });
    setDupGroups(groups);
    setMergeResult(null);
    setShowMerge(true);
  };

  const setFieldChoice = (gi: number, key: string, choice: string|'clear') => {
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
      'emergency_contact','emergency_phone','notes','meal_preference',
      'id_number','id_card_image','passport','passport_expiry','passport_image',
      'taibao_number','taibao_expiry','taibao_image',
    ];
    for (const group of toMerge) {
      const primary = group.customers.find(c=>c.id===group.keepId) || group.customers[0];
      const secondaryIds = group.customers.filter(c=>c.id!==primary.id).map(c=>c.id);

      // 1. 先存檔所有不同的證件照片；完全相同的圖片以 SHA-256 去重。
      const legacyDocs: {document_type:string;image_data:string;document_number:string;expiry:string|null}[] = [];
      group.customers.forEach(c=>{
        if (c.passport_image) legacyDocs.push({document_type:'passport',image_data:c.passport_image,document_number:c.passport||'',expiry:c.passport_expiry||null});
        if (c.taibao_image) legacyDocs.push({document_type:'taibao',image_data:c.taibao_image,document_number:c.taibao_number||'',expiry:c.taibao_expiry||null});
        if (c.id_card_image) legacyDocs.push({document_type:'id_card',image_data:c.id_card_image,document_number:c.id_number||'',expiry:null});
      });
      const distinctLegacy = Array.from(new Map(legacyDocs.map(d=>[`${d.document_type}:${d.image_data}`,d])).values());

      const {data:existingArchives,error:archiveReadError} = await supabase
        .from("customer_document_images")
        .select("document_type,image_data,image_hash,document_number,expiry")
        .in("customer_id",group.customers.map(c=>c.id));
      const archiveTableMissing = !!archiveReadError && (
        archiveReadError.code==='42P01' || archiveReadError.code==='PGRST205' ||
        archiveReadError.message.includes('customer_document_images')
      );
      const distinctCounts = new Map<string,number>();
      distinctLegacy.forEach(d=>distinctCounts.set(d.document_type,(distinctCounts.get(d.document_type)||0)+1));
      const needsArchive = Array.from(distinctCounts.values()).some(n=>n>1);
      if (archiveTableMissing && needsArchive) {
        setMerging(false);
        alert('為避免證件照片遺失，已中止合併。\n\n請先在 Supabase SQL Editor 執行 customer_document_images_migration.sql，再重新合併。');
        return;
      }
      if (archiveReadError && !archiveTableMissing) {
        setMerging(false); alert('載入證件照片歷史失敗：'+archiveReadError.message); return;
      }
      if (!archiveTableMissing) {
        const allDocs = [
          ...distinctLegacy,
          ...((existingArchives||[]) as {document_type:string;image_data:string;image_hash:string;document_number:string;expiry:string|null}[]),
        ];
        const uniqueDocs = Array.from(new Map(allDocs.map(d=>[`${d.document_type}:${d.image_data}`,d])).values());
        const archivePayload = await Promise.all(uniqueDocs.map(async d=>({
          customer_id:primary.id,
          document_type:d.document_type,
          image_data:d.image_data,
          image_hash:('image_hash' in d && d.image_hash) ? d.image_hash : await hashImageData(d.image_data),
          document_number:d.document_number||'',
          expiry:d.expiry||null,
        })));
        if (archivePayload.length>0) {
          const {error:archiveWriteError}=await supabase.from("customer_document_images")
            .upsert(archivePayload,{onConflict:'customer_id,document_type,image_hash',ignoreDuplicates:true});
          if (archiveWriteError) {
            setMerging(false); alert('保存證件照片歷史失敗，已中止合併：'+archiveWriteError.message); return;
          }
        }
      }

      // 2. 合併欄位：護照／台胞證號碼、效期與主圖自動來自最新效期的那一筆。
      const patch: Partial<Omit<Customer,'id'|'created_at'>> = {};
      for (const key of ALL_KEYS) {
        const choice = group.fieldChoices[key] ?? primary.id;
        const source = choice==='clear' ? null : group.customers.find(c=>c.id===choice);
        const val = source ? (source[key] ?? '') : (key === 'gender' ? 'other' : '');
        (patch as Record<string, unknown>)[key] = val;
      }
      const {error:updateError}=await supabase.from("customers").update(patch).eq("id", primary.id);
      if (updateError) { setMerging(false); alert('更新主旅客失敗：'+updateError.message); return; }

      // 3. 出團記錄轉移（整組多人一次處理，同團只保留一筆）
      const { data: existingTours } = await supabase
        .from("customer_tours").select("tour_id").eq("customer_id", primary.id);
      const existingTourIds = new Set((existingTours || []).map((r: {tour_id: string}) => r.tour_id));
      const { data: secTours } = await supabase
        .from("customer_tours").select("id,tour_id").in("customer_id", secondaryIds);
      const secToursArr = (secTours || []) as {id:string;tour_id:string}[];
      const tourDelIds:string[]=[]; const tourUpdIds:string[]=[];
      secToursArr.forEach(t=>{ if(existingTourIds.has(t.tour_id)) tourDelIds.push(t.id); else {existingTourIds.add(t.tour_id);tourUpdIds.push(t.id);} });
      if (tourDelIds.length > 0) await supabase.from("customer_tours").delete().in("id", tourDelIds);
      if (tourUpdIds.length > 0) await supabase.from("customer_tours").update({customer_id: primary.id}).in("id", tourUpdIds);

      // 4. 標籤轉移（避免重複標籤）
      const { data: existingLabels } = await supabase
        .from("customer_labels").select("label_id").eq("customer_id", primary.id);
      const existingLabelIds = new Set((existingLabels || []).map((r: {label_id: string}) => r.label_id));
      const { data: secLabels } = await supabase
        .from("customer_labels").select("id,label_id").in("customer_id", secondaryIds);
      const secLabelsArr = (secLabels || []) as {id:string;label_id:string}[];
      const labelDelIds:string[]=[]; const labelUpdIds:string[]=[];
      secLabelsArr.forEach(l=>{if(existingLabelIds.has(l.label_id))labelDelIds.push(l.id);else{existingLabelIds.add(l.label_id);labelUpdIds.push(l.id);}});
      if (labelDelIds.length > 0) await supabase.from("customer_labels").delete().in("id", labelDelIds);
      if (labelUpdIds.length > 0) await supabase.from("customer_labels").update({customer_id: primary.id}).in("id", labelUpdIds);

      // 5. 所有資料與照片都確認保留後，才批次刪除其餘帳號。
      await supabase.from("customers").delete().in("id", secondaryIds);
      merged++;
    }
    setMerging(false);
    setMergeResult({merged});
    load(); loadLabels(); loadCustTours();
  };

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">

      {/* ── header ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Users className="w-5 h-5 md:w-6 md:h-6 text-violet-600" /> 旅客 CRM
        </h1>
        <div className="flex gap-1.5 md:gap-2 flex-wrap">
          <button onClick={openMerge}
            className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs md:text-sm px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg transition-colors">
            <GitMerge className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span className="hidden sm:inline">合併重複旅客</span>
            <span className="sm:hidden">合併</span>
          </button>
          <button onClick={()=>setShowLabelMgr(true)}
            className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs md:text-sm px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg transition-colors">
            <Tag className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span className="hidden sm:inline">標籤管理</span>
            <span className="sm:hidden">標籤</span>
          </button>
          <button onClick={()=>setShowImport(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs md:text-sm px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg transition-colors">
            <FileSpreadsheet className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span className="hidden sm:inline">匯入名單</span>
            <span className="sm:hidden">匯入</span>
          </button>
          <button onClick={()=>setShowBulkScan(true)}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs md:text-sm px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg transition-colors">
            <Layers className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span className="hidden sm:inline">批量掃描建檔</span>
            <span className="sm:hidden">批量掃描</span>
          </button>
          <button onClick={()=>setShowScan(true)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg transition-colors">
            <ScanLine className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span className="hidden sm:inline">掃描證件建檔</span>
            <span className="sm:hidden">掃描</span>
          </button>
          <button onClick={()=>setShowModal(true)}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs md:text-sm px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span className="hidden sm:inline">新增旅客</span>
            <span className="sm:hidden">新增</span>
          </button>
        </div>
      </div>

      {/* ── search + label filter + col settings ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <div className="relative flex-1 sm:flex-none sm:w-64">
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
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 space-y-2">
                  {/* 凍結設定 */}
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-1 uppercase tracking-wide">凍結</p>
                  <label className="flex items-center gap-2 px-1 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                    <input type="checkbox" checked={frozenHeader} onChange={e=>setFrozenHeader(e.target.checked)} className="accent-violet-600 w-3.5 h-3.5" />
                    凍結標題列
                  </label>
                  <div className="flex items-center gap-1 px-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">凍結欄：</span>
                    {([0,1,2] as const).map(n => (
                      <button key={n} onClick={()=>setFrozenCols(n)}
                        className={`w-7 h-6 text-xs rounded transition-colors font-medium ${
                          frozenCols===n ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                        }`}>{n}</button>
                    ))}
                  </div>
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

      {/* ── Mobile card list (sm:hidden) ── */}
      {!loading && (
        <div className="sm:hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              {search||filterLabelId ? "沒有符合的旅客" : "尚無旅客，點右上角新增或掃描證件"}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm divide-y divide-slate-100 dark:divide-slate-700/60">
              {paginatedCustomers.map(c => {
                const labelIds = custLabels[c.id] || [];
                const labels = labelIds.map(lid => allLabels.find(l => l.id === lid)).filter(Boolean) as { id:string; name:string; color:string }[];
                const tours  = custTours[c.id] || [];
                const todayStr = new Date().toISOString().slice(0, 10);
                const passExpired = c.passport_expiry && c.passport_expiry < todayStr;
                const taibaoExpired = c.taibao_expiry && c.taibao_expiry < todayStr;
                return (
                  <Link key={c.id} href={`/admin/crm/${c.id}`}
                    className="block px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 active:bg-slate-100 dark:active:bg-slate-700/50 transition-colors">
                    {/* Row 1: name + labels */}
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <span className="font-semibold text-blue-600 dark:text-blue-400 text-sm">{c.name}</span>
                      {labels.length > 0 && (
                        <div className="flex gap-1 flex-wrap justify-end shrink-0 max-w-[55%]">
                          {labels.slice(0, 3).map(l => (
                            <span key={l.id} className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white leading-tight" style={{backgroundColor:l.color}}>{l.name}</span>
                          ))}
                          {labels.length > 3 && <span className="text-[10px] text-slate-400">+{labels.length-3}</span>}
                        </div>
                      )}
                    </div>
                    {/* Row 2: english name */}
                    {c.name_en && <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">{c.name_en}</div>}
                    {/* Row 3: info chips */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {c.birthday && <span>🎂 {c.birthday}</span>}
                      {c.passport && (
                        <span className={passExpired ? "text-red-500 font-medium" : ""}>
                          🛂 {c.passport}{passExpired ? " ⚠" : ""}
                        </span>
                      )}
                      {c.taibao_number && (
                        <span className={taibaoExpired ? "text-red-500 font-medium" : ""}>
                          📋 {c.taibao_number}{taibaoExpired ? " ⚠" : ""}
                        </span>
                      )}
                      {c.phone && <span>📱 {c.phone}</span>}
                    </div>
                    {/* Row 4: tours */}
                    {tours.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {tours.slice(0, 3).map(t => (
                          <span key={t.id} className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">{t.name}</span>
                        ))}
                        {tours.length > 3 && <span className="text-[10px] text-slate-400">+{tours.length-3}個團</span>}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Desktop table (hidden sm:block) ── */}
      <div className="hidden sm:block bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-x-auto">
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
            <thead className={`bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase select-none ${frozenHeader ? "sticky top-0 z-20" : ""}`}>
              <tr>
                {visibleCols.map((col, ci)=>(
                  <th key={col.key}
                    className={`text-left px-4 py-3 relative cursor-grab active:cursor-grabbing bg-slate-50 dark:bg-slate-700/80 ${
                      dragOverCol===col.key&&dragCol!==col.key ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300" : ""
                    } ${ci < frozenCols ? "sticky z-30" : ""} ${ci === frozenCols - 1 ? "shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]" : ""}`}
                    style={{width:col.width, ...(ci < frozenCols ? {left: colLeftOffset[ci]} : {})}} draggable
                    onDragStart={e=>handleColDragStart(col.key,e)}
                    onDragOver={e=>handleColDragOver(col.key,e)}
                    onDrop={()=>handleColDrop(col.key)}
                    onDragEnd={handleColDragEnd}>
                    <button
                      onClick={()=>cycleSort(col.key)}
                      className="flex items-center gap-1 truncate max-w-full hover:text-violet-600 dark:hover:text-violet-400 transition-colors group/sort"
                      title="點擊排序">
                      <span className="truncate">{col.label}</span>
                      {sortKey===col.key
                        ? sortDir==="asc"
                          ? <ArrowUp className="w-3 h-3 shrink-0 text-violet-500" />
                          : <ArrowDown className="w-3 h-3 shrink-0 text-violet-500" />
                        : <ChevronsUpDown className="w-3 h-3 shrink-0 opacity-0 group-hover/sort:opacity-40 transition-opacity" />
                      }
                    </button>
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
              {paginatedCustomers.map(c=>(
                <tr key={c.id} className="group/row hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                  {visibleCols.map((col, ci)=>(
                    <td key={col.key}
                      className={`px-4 py-2.5 truncate bg-white dark:bg-slate-800 group-hover/row:bg-slate-50 dark:group-hover/row:bg-slate-700/40 ${ci < frozenCols ? "sticky z-10" : ""} ${ci === frozenCols - 1 ? "shadow-[2px_0_4px_-2px_rgba(0,0,0,0.10)]" : ""}`}
                      style={{width:col.width,maxWidth:col.width, ...(ci < frozenCols ? {left: colLeftOffset[ci]} : {})}}>
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
                          <CopyBtn text={c.name} />
                        </div>
                      ) : col.key==="tours" ? (
                        <div className="group/cell flex flex-wrap gap-1 items-center">
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
                          <button onClick={e=>{e.stopPropagation();setTourPickerId(c.id);}}
                            className="opacity-0 group-hover/cell:opacity-100 transition-opacity p-0.5 text-slate-400 hover:text-blue-500 flex-shrink-0" title="編輯參團">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <CopyBtn text={(custTours[c.id]||[]).map(t=>t.name).join("、")} />
                        </div>
                      ) : col.key==="meal_preference" ? (
                        <div className="group/cell flex flex-wrap gap-1 items-center">
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
                          <CopyBtn text={(c.meal_preference||"").trim()} />
                        </div>
                      ) : col.key==="passport_image"||col.key==="taibao_image" ? (
                        (() => {
                          const src = docImages[c.id]?.[col.key as "passport_image" | "taibao_image"];
                          const label = col.key === "passport_image" ? `${c.name}的護照照片` : `${c.name}的台胞證照片`;
                          if (src === undefined) {
                            return docImagesLoading
                              ? <Loader2 className="w-4 h-4 text-violet-400 animate-spin mx-auto" />
                              : <span className="text-xs text-slate-300 dark:text-slate-600">載入中…</span>;
                          }
                          if (!src) return <span className="text-xs text-slate-300 dark:text-slate-600">未上傳</span>;
                          return (
                            <button
                              type="button"
                              className="block rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden bg-slate-100 dark:bg-slate-700 hover:border-violet-400 hover:ring-2 hover:ring-violet-200 dark:hover:ring-violet-900/60 transition-all"
                              title="滑鼠移入放大預覽"
                              onMouseEnter={e => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const previewW = Math.min(440, window.innerWidth - 32);
                                let x = rect.right + 12;
                                if (x + previewW > window.innerWidth - 16) x = Math.max(16, rect.left - previewW - 12);
                                const y = Math.max(16, Math.min(rect.top, window.innerHeight - 500));
                                setImagePreview({ src, label, x, y });
                              }}
                              onMouseLeave={() => setImagePreview(null)}>
                              <img src={src} alt={label} className="w-16 h-11 object-cover" />
                            </button>
                          );
                        })()
                      ) : col.key==="passport"||col.key==="taibao_number" ? (
                        (() => {
                          const num = (c as unknown as Record<string,string>)[col.key] || "";
                          const exp = col.key==="passport" ? (c.passport_expiry||"") : (c.taibao_expiry||"");
                          return (
                            <div className="group/cell flex flex-col gap-0.5 min-w-0">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-slate-600 dark:text-slate-300 font-mono text-xs truncate">{num || "—"}</span>
                                <CopyBtn text={num} />
                              </div>
                              <div className="flex items-center gap-1">
                                <ExpiryBadge dateStr={exp || undefined} />
                                <CopyBtn text={exp} />
                              </div>
                            </div>
                          );
                        })()
                      ) : col.key==="id_number" ? (
                        <div className="group/cell flex items-center gap-1 min-w-0">
                          <span className="text-slate-600 dark:text-slate-300 font-mono text-xs truncate">{getCellValue(c,col.key)}</span>
                          <CopyBtn text={c.id_number||""} />
                        </div>
                      ) : col.key==="created_at" ? (
                        <div className="group/cell flex items-center gap-1 min-w-0">
                          <span className="text-slate-400 dark:text-slate-500 text-xs truncate">{getCellValue(c,col.key)}</span>
                          <CopyBtn text={getCellValue(c,col.key)} />
                        </div>
                      ) : (
                        <div className="group/cell flex items-center gap-1 min-w-0">
                          <span className="text-slate-600 dark:text-slate-300 truncate">{getCellValue(c,col.key)}</span>
                          <CopyBtn text={getCellValue(c,col.key)==="—" ? "" : getCellValue(c,col.key)} />
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>{/* end desktop table */}

      {!loading && filtered.length>0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 sm:px-4 py-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between sm:justify-start gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>共 <strong className="text-slate-700 dark:text-slate-200">{sorted.length}</strong> 筆，顯示 {pageStart+1}–{Math.min(pageStart+pageSize,sorted.length)} 筆</span>
            <label className="flex items-center gap-1.5 whitespace-nowrap">
              每頁
              <select value={pageSize} onChange={e=>changePageSize(Number(e.target.value))}
                className="border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400">
                {CRM_PAGE_SIZE_OPTIONS.map(size=><option key={size} value={size}>{size}</option>)}
              </select>
              筆
            </label>
          </div>
          <div className="flex items-center justify-start sm:justify-center gap-1 overflow-x-auto max-w-full pb-1 [&>button]:shrink-0">
            <button onClick={()=>setCurrentPage(1)} disabled={safeCurrentPage===1}
              className="h-8 px-2 rounded-lg text-xs border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700">最前</button>
            <button onClick={()=>setCurrentPage(p=>Math.max(1,p-1))} disabled={safeCurrentPage===1}
              className="h-8 px-2 rounded-lg text-xs border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700">上一頁</button>
            {visiblePageNumbers.map(page=>(
              <button key={page} onClick={()=>setCurrentPage(page)}
                className={`h-8 min-w-8 px-2 rounded-lg text-xs font-medium transition-colors ${
                  page===safeCurrentPage
                    ? "bg-violet-600 text-white border border-violet-600"
                    : "border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}>{page}</button>
            ))}
            <button onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))} disabled={safeCurrentPage===totalPages}
              className="h-8 px-2 rounded-lg text-xs border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700">下一頁</button>
            <button onClick={()=>setCurrentPage(totalPages)} disabled={safeCurrentPage===totalPages}
              className="h-8 px-2 rounded-lg text-xs border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700">最後</button>
          </div>
        </div>
      )}

      {/* 用 fixed 浮層避免大圖被表格 overflow 容器裁切 */}
      {imagePreview && (
        <div
          className="fixed z-[80] pointer-events-none rounded-2xl border border-white/70 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-2xl p-2"
          style={{ left: imagePreview.x, top: imagePreview.y, width: "min(440px, calc(100vw - 32px))" }}>
          <img
            src={imagePreview.src}
            alt={imagePreview.label}
            className="w-full max-h-[70vh] object-contain rounded-xl bg-slate-100 dark:bg-slate-800"
          />
          <p className="px-2 pt-2 pb-1 text-xs font-medium text-slate-600 dark:text-slate-300 truncate">{imagePreview.label}</p>
        </div>
      )}

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
                    依姓名（繁簡視同）、護照、身分證、台胞證、手機、模糊姓名、生日+姓名偵測可能重複
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
                  <p className="text-sm text-slate-400">依 7 種條件（姓名、護照、身分證、台胞證、手機、模糊姓名、生日+姓名）均無重複</p>
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
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                              {group.customers.length} 筆一起合併
                            </span>
                            {clearCount > 0 && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                                已標記清空 {clearCount} 欄
                              </span>
                            )}
                          </div>
                          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 hidden sm:block">點選欄位選擇要保留哪筆資料</span>
                        </div>

                        {/* comparison table */}
                        <div className="overflow-x-auto">
                        <div className="bg-white dark:bg-slate-800 grid text-sm"
                          style={{gridTemplateColumns:`6rem repeat(${group.customers.length}, minmax(11rem, 1fr))`, width:`max(100%, ${96+group.customers.length*176}px)`}}>
                          {/* col headers */}
                          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/40 text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-end">欄位</div>
                          {group.customers.map((c,ci)=>(
                            <div key={c.id} className={`px-4 py-2 border-l border-slate-100 dark:border-slate-700 ${
                              group.keepId===c.id
                                ? "bg-emerald-50 dark:bg-emerald-900/20"
                                : "bg-slate-50 dark:bg-slate-700/40"
                            }`}>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name={`keep-${group.id}`} checked={group.keepId===c.id}
                                  onChange={()=>{
                                    setDupGroups(prev=>prev.map((g,i)=>i===gi
                                      ? {...g, keepId:c.id}
                                      : g));
                                  }}
                                  className="accent-emerald-600" />
                                <span className={`text-xs font-semibold ${
                                  group.keepId===c.id ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"
                                }`}>
                                  {group.keepId===c.id ? "✓ 保留帳號" : `旅客 ${ci+1}`}
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
                            const cells = group.customers.map(c=>({
                              v:getVal(c,fd), customerId:c.id,
                              hasImg:!!(fd.linked && (c[fd.linked] as string)),
                            }));
                            if (cells.every(c=>!c.v)) return null;
                            const diff = new Set(cells.map(c=>c.v)).size>1;
                            const choice = group.fieldChoices[fd.key] ?? group.keepId;
                            return (
                              <Fragment key={fd.key}>
                                {/* label col */}
                                <div className="px-3 py-2.5 text-[11px] font-medium text-slate-400 dark:text-slate-500 border-t border-slate-50 dark:border-slate-700/50 flex flex-col gap-0.5 justify-center">
                                  <div className="flex items-center gap-1">
                                    <span className="truncate leading-tight">{fd.label}</span>
                                    {/* trash: toggle clear */}
                                    <button
                                      title={choice==='clear' ? '恢復' : '清空此欄'}
                                      onClick={()=>setFieldChoice(gi, fd.key,
                                        choice==='clear'
                                          ? group.keepId
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
                                  {group.smartInfo[fd.key] && (
                                    <span className="text-[9px] px-1 py-px rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 leading-tight w-fit">
                                      🤖 {group.smartInfo[fd.key]}
                                    </span>
                                  )}
                                </div>
                                {/* value cells */}
                                {cells.map(({v, customerId, hasImg}) => {
                                  const isChosen = choice === customerId;
                                  const isCleared = choice === 'clear';
                                  return (
                                    <div key={customerId}
                                      onClick={()=> { if (diff && !isCleared) setFieldChoice(gi, fd.key, customerId); }}
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
                                            onChange={()=>setFieldChoice(gi, fd.key, customerId)}
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
                        </div>

                        {/* footer note */}
                        {group.selected && (
                          <div className="px-4 py-2 bg-violet-50 dark:bg-violet-900/20 border-t border-violet-100 dark:border-violet-800/40 text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                            <ChevronRight className="w-3 h-3 flex-shrink-0" />
                            <span>保留帳號「{group.customers.find(c=>c.id===group.keepId)?.name}」，各欄位依上方選擇套用
                              {clearCount>0 && `（${clearCount} 欄將清空）`}，所有不同證件照片存檔，出團與標籤一併移轉，其餘 {group.customers.length-1} 筆刪除</span>
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
      {/* ══ TOUR PICKER MODAL ══ */}
      {tourPickerId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
          onClick={()=>setTourPickerId(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-4 w-72 max-h-[70vh] flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                編輯參團紀錄
              </p>
              <button onClick={()=>setTourPickerId(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
              {customers.find(c=>c.id===tourPickerId)?.name}
            </p>
            {allTours.length===0 ? (
              <p className="text-xs text-slate-400 text-center py-4">尚無出團資料</p>
            ) : (
              <div className="overflow-y-auto space-y-0.5 flex-1">
                {allTours.map(t => {
                  const isIn = !!(custTours[tourPickerId]||[]).find(x=>x.id===t.id);
                  const clr  = tourTagColor(t.id);
                  const STATUS_LABEL: Record<string,string> = {
                    planning:"規劃中", confirmed:"已確認", ongoing:"進行中",
                    completed:"已完成", cancelled:"已取消",
                  };
                  return (
                    <button key={t.id} onClick={()=>toggleCustTour(tourPickerId, t)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                        isIn ? "bg-slate-100 dark:bg-slate-700" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      }`}>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: clr.bg, outline: `2px solid ${clr.text}`, outlineOffset:"0px"}} />
                      <span className="flex-1 text-slate-700 dark:text-slate-200 truncate">{t.name}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{STATUS_LABEL[t.status] || t.status}</span>
                      {isIn && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

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
                  <p className="text-sm text-slate-500 dark:text-slate-400">成功儲存 <strong className="text-emerald-600">{bulkDone.success}</strong> 位旅客的證件與照片</p>
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
                    {bulkCreating ? "儲存中…" : `✓ 批量儲存 ${bulkItems.filter(it=>it.selected&&it.status==="done"&&it.form.name.trim()).length} 張證件`}
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
