// 對客文件（訂金單／尾款單）的抬頭、頁尾、匯款資訊等文案設定
// 存在瀏覽器 localStorage，不動資料庫

export interface DocSettings {
  // 頁首
  companyName: string;
  companyNameEn: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;        // 統一編號
  licenseNo: string;    // 旅行業執照號碼
  logo: string;         // dataURL，可留空

  // 匯款資訊
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
  deadlineDate: string;   // YYYY-MM-DD，選了會自動帶入 deadlineLabel
  deadlineLabel: string;

  // 內文
  depositNote: string;  // 訂金單注意事項（每行一條）
  balanceNote: string;  // 尾款單注意事項

  // 護照自帶同意書
  consentTitle: string;    // 文件標題
  consentIntro: string;    // 開頭聲明段
  consentTerms: string;    // 條款（每行一條，自動編號）
  consentTail: string;     // 表格下方的補充說明（每行一條）

  // 頁尾
  footerNote: string;
  signLeft: string;
  signRight: string;
}

export const DOC_DEFAULTS: DocSettings = {
  companyName: "暖心旅行社",
  companyNameEn: "Warm Heart Travel",
  tagline: "用心規劃每一段旅程",
  address: "",
  phone: "",
  email: "",
  taxId: "",
  licenseNo: "",
  logo: "",

  bankName: "",
  bankAccountName: "",
  bankAccountNo: "",
  deadlineDate: "",
  deadlineLabel: "",

  depositNote:
    "本單金額以實際入帳為準，匯款後請保留收據並告知帳號末五碼，以利核帳。\n" +
    "訂金繳納後即完成報名手續，本公司將依約為您預訂機位與住宿。\n" +
    "如需取消，將依國外旅遊定型化契約之規定辦理。",
  balanceNote:
    "本單金額以實際入帳為準，匯款後請保留收據並告知帳號末五碼，以利核帳。\n" +
    "尾款請於出發前完成繳納，以確保各項預訂順利進行。\n" +
    "行前說明會資料與電子機票將於尾款收訖後寄送。",

  consentTitle: "護照自行攜帶同意書",
  consentIntro:
    "本人參加貴公司承辦之上列旅遊行程，茲同意自行保管並攜帶本人之護照（及台胞證等相關旅行證件）前往機場集合，不交由旅行社代為保管。本人已充分了解並承諾下列事項：",
  consentTerms:
    "於集合前自行確認護照效期距回程日仍有六個月以上，且證件完整未破損。\n" +
    "於出發當日務必攜帶護照及所需簽證／台胞證正本至機場集合。\n" +
    "如因本人未攜帶、遺失、效期不足或證件不符致無法出境、無法登機或行程受阻，所生之一切損失（含機票、住宿、地接等已產生且不可退還之費用）由本人自行負擔，與旅行社及其人員無涉，本人不得要求退費或請求賠償。\n" +
    "如需旅行社協助辦理補件或改期，相關規費與手續費由本人負擔。",
  consentTail:
    "護照效期以紅字標示者，表示效期距回程日不足六個月，請務必於出發前完成換發。\n" +
    "本同意書一式一份，由旅行社留存備查。",

  footerNote: "感謝您的支持與信任，期待與您一同啟程。",
  signLeft: "承辦人員",
  signRight: "主管核章",
};

const LS_KEY = "ta_doc_settings";

export function loadDocSettings(): DocSettings {
  if (typeof window === "undefined") return DOC_DEFAULTS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...DOC_DEFAULTS, ...JSON.parse(raw) } : DOC_DEFAULTS;
  } catch {
    return DOC_DEFAULTS;
  }
}

export function saveDocSettings(s: DocSettings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function resetDocSettings() {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

/** 設定面板的欄位定義（標籤／型別／提示）*/
export const DOC_FIELDS: {
  group: string;
  items: { key: keyof DocSettings; label: string; ph?: string; multiline?: boolean; image?: boolean; date?: boolean }[];
}[] = [
  {
    group: "頁首（抬頭）",
    items: [
      { key: "logo",          label: "Logo 圖片", image: true },
      { key: "companyName",   label: "公司名稱",   ph: "暖心旅行社" },
      { key: "companyNameEn", label: "英文名稱",   ph: "Warm Heart Travel" },
      { key: "tagline",       label: "標語",       ph: "用心規劃每一段旅程" },
      { key: "phone",         label: "聯絡電話",   ph: "02-xxxx-xxxx" },
      { key: "email",         label: "Email",     ph: "service@example.com" },
      { key: "address",       label: "地址",       ph: "台北市…" },
      { key: "taxId",         label: "統一編號",   ph: "12345678" },
      { key: "licenseNo",     label: "旅行業執照", ph: "交觀甲字第 xxxx 號" },
    ],
  },
  {
    group: "匯款資訊",
    items: [
      { key: "bankName",        label: "銀行／分行", ph: "○○銀行 ○○分行（代號 xxx）" },
      { key: "bankAccountName", label: "戶名",       ph: "暖心旅行社股份有限公司" },
      { key: "bankAccountNo",   label: "帳號",       ph: "1234-5678-9012" },
      { key: "deadlineDate",    label: "繳款期限日期", date: true },
      { key: "deadlineLabel",   label: "繳款期限文字", ph: "請於 2026/09/10（四）前完成匯款" },
    ],
  },
  {
    group: "注意事項",
    items: [
      { key: "depositNote", label: "訂金單條文", multiline: true },
      { key: "balanceNote", label: "尾款單條文", multiline: true },
    ],
  },
  {
    group: "護照自帶同意書",
    items: [
      { key: "consentTitle", label: "文件標題", ph: "護照自行攜帶同意書" },
      { key: "consentIntro", label: "開頭聲明", multiline: true },
      { key: "consentTerms", label: "承諾條款（一行一條，自動編號）", multiline: true },
      { key: "consentTail",  label: "表格下方補充說明（一行一條）", multiline: true },
    ],
  },
  {
    group: "頁尾",
    items: [
      { key: "footerNote", label: "結語", ph: "感謝您的支持與信任…" },
      { key: "signLeft",   label: "左側簽核欄", ph: "承辦人員" },
      { key: "signRight",  label: "右側簽核欄", ph: "主管核章" },
    ],
  },
];

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

/** "2026-09-10" -> "2026/09/10（四）"；格式不對就原樣回傳 */
export function fmtDeadlineDate(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || "").trim());
  if (!m) return iso || "";
  const [, y, mo, d] = m;
  const w = WEEK[new Date(Number(y), Number(mo) - 1, Number(d)).getDay()];
  return `${y}/${mo}/${d}（${w}）`;
}

/** 由日期自動組出繳款期限文字 */
export function deadlineTextFromDate(iso?: string | null): string {
  const t = fmtDeadlineDate(iso);
  return t ? `請於 ${t} 前完成匯款` : "";
}

/** 以出發日往前推 n 天，回傳 YYYY-MM-DD */
export function daysBefore(startDate?: string | null, n = 0): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((startDate || "").trim());
  if (!m) return "";
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d) - n);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
