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
  deadlineLabel: string;

  // 內文
  depositNote: string;  // 訂金單注意事項（每行一條）
  balanceNote: string;  // 尾款單注意事項

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
  deadlineLabel: "",

  depositNote:
    "本單金額以實際入帳為準，匯款後請保留收據並告知帳號末五碼，以利核帳。\n" +
    "訂金繳納後即完成報名手續，本公司將依約為您預訂機位與住宿。\n" +
    "如需取消，將依國外旅遊定型化契約之規定辦理。",
  balanceNote:
    "本單金額以實際入帳為準，匯款後請保留收據並告知帳號末五碼，以利核帳。\n" +
    "尾款請於出發前完成繳納，以確保各項預訂順利進行。\n" +
    "行前說明會資料與電子機票將於尾款收訖後寄送。",

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
  items: { key: keyof DocSettings; label: string; ph?: string; multiline?: boolean; image?: boolean }[];
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
      { key: "deadlineLabel",   label: "繳款期限",   ph: "請於 2026/09/10 前完成匯款" },
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
    group: "頁尾",
    items: [
      { key: "footerNote", label: "結語", ph: "感謝您的支持與信任…" },
      { key: "signLeft",   label: "左側簽核欄", ph: "承辦人員" },
      { key: "signRight",  label: "右側簽核欄", ph: "主管核章" },
    ],
  },
];
