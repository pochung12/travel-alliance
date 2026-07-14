"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, Customer, Tour } from "@/lib/supabase";
import { ArrowLeft, Save, Trash2, Upload, ScanLine, X, CheckCircle, AlertCircle, Loader2, UtensilsCrossed, RotateCw, Wand2 } from "lucide-react";

// ─── Meal options (same as groups page) ───────────────────────────────────────
const MEAL_OPTIONS = [
  { key: "蛋奶素", color: "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300 border border-lime-200 dark:border-lime-700" },
  { key: "全素",   color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-700" },
  { key: "不吃羊", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-700" },
  { key: "不吃牛", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-200 dark:border-rose-700" },
  { key: "不吃豬", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border border-sky-200 dark:border-sky-700" },
];
import Link from "next/link";
import { useSidebarCollapsed } from "@/components/AdminShell";

const input = "w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400";
const lbl   = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";

const STATUS_COLOR: Record<string, string> = {
  planning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  confirmed:"bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  ongoing:  "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  completed:"bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  cancelled:"bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};
const STATUS_LABEL: Record<string, string> = {
  planning:"規劃中", confirmed:"已確認", ongoing:"進行中",
  completed:"已完成", cancelled:"已取消",
};

function compressImage(file: File, maxPx = 1200, quality = 0.88): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = url;
  });
}

// 以 canvas 將 base64 圖片順時針旋轉 90/180/270 度
function rotateBase64(b64: string, deg: 90 | 180 | 270): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      if (deg === 180) { canvas.width = img.width; canvas.height = img.height; }
      else { canvas.width = img.height; canvas.height = img.width; }
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(deg * Math.PI / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.src = b64;
  });
}

interface OcrResult {
  name?: string | null; nameEn?: string | null;
  passport?: string | null; birthday?: string | null;
  gender?: "male" | "female" | null; passportExpiry?: string | null;
  taibaoNumber?: string | null; taibaoExpiry?: string | null;
  idNumber?: string | null; error?: string;
}

type ScanStatus = { type: "idle" } | { type: "scanning" } | { type: "rotating" } | { type: "success"; msg: string } | { type: "error"; msg: string };

export default function CustomerDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const sidebarCollapsed = useSidebarCollapsed();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm]         = useState<Partial<Customer>>({});
  const [tours, setTours]       = useState<(Tour & { paid_amount: number })[]>([]);
  const [saving, setSaving]     = useState(false);
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());

  const [passportStatus, setPassportStatus] = useState<ScanStatus>({ type: "idle" });
  const [taibaoStatus,   setTaibaoStatus]   = useState<ScanStatus>({ type: "idle" });
  const [idCardStatus,   setIdCardStatus]   = useState<ScanStatus>({ type: "idle" });
  const [dupWarning, setDupWarning] = useState<Array<{id: string; name: string; birthday: string}>>([]);

  const passportInputRef = useRef<HTMLInputElement>(null);
  const taibaoInputRef   = useRef<HTMLInputElement>(null);
  const idCardInputRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("customers").select("*").eq("id", id).single();
      if (!data) { router.push("/admin/crm"); return; }
      setCustomer(data); setForm(data);
      const { data: ct } = await supabase
        .from("customer_tours").select("paid_amount, tour:tours(*)").eq("customer_id", id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTours((ct || []).map((r: any) => ({
        ...(Array.isArray(r.tour) ? r.tour[0] : r.tour), paid_amount: r.paid_amount,
      })));
    })();
  }, [id]);

  const flashHighlight = useCallback((fields: string[]) => {
    setHighlightedFields(new Set(fields));
    setTimeout(() => setHighlightedFields(new Set()), 3000);
  }, []);

  const save = async () => {
    setSaving(true);
    await supabase.from("customers").update({
      name: form.name, name_en: form.name_en, phone: form.phone, email: form.email,
      id_number: form.id_number, id_card_image: form.id_card_image,
      passport: form.passport, passport_expiry: form.passport_expiry || null,
      passport_image: form.passport_image, taibao_number: form.taibao_number,
      taibao_expiry: form.taibao_expiry || null, taibao_image: form.taibao_image,
      birthday: form.birthday || null, gender: form.gender,
      address: form.address, emergency_contact: form.emergency_contact,
      emergency_phone: form.emergency_phone, notes: form.notes,
      meal_preference: form.meal_preference || "",
    }).eq("id", id);
    setSaving(false);
    // 樂觀更新：直接用 form 狀態，不需要重新 fetch DB
    const updated = { ...customer!, ...form } as Customer;
    setCustomer(updated);
    setForm(updated);
  };

  const toggleMealPref = (option: string) => {
    const current = (form.meal_preference || "").split(",").map(s => s.trim()).filter(Boolean);
    const next = current.includes(option)
      ? current.filter(m => m !== option)
      : [...current, option];
    setForm(prev => ({ ...prev, meal_preference: next.join(",") }));
  };

  const del = async () => {
    if (!confirm(`確定刪除「${customer?.name}」？`)) return;
    await supabase.from("customers").delete().eq("id", id);
    router.push("/admin/crm");
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: "passport" | "taibao" | "idCard") => {
    const file = e.target.files?.[0]; if (!file) return;
    const compressed = await compressImage(file);
    if (docType === "passport") { setForm(prev => ({ ...prev, passport_image: compressed })); setPassportStatus({ type: "idle" }); }
    else if (docType === "taibao") { setForm(prev => ({ ...prev, taibao_image: compressed })); setTaibaoStatus({ type: "idle" }); }
    else { setForm(prev => ({ ...prev, id_card_image: compressed })); setIdCardStatus({ type: "idle" }); }
    e.target.value = "";
  };

  const setDocImage = (docType: "passport" | "taibao" | "idCard", b64: string) => {
    if (docType === "passport") setForm(prev => ({ ...prev, passport_image: b64 }));
    else if (docType === "taibao") setForm(prev => ({ ...prev, taibao_image: b64 }));
    else setForm(prev => ({ ...prev, id_card_image: b64 }));
  };

  // AI 智能轉正：判斷方向 → canvas 旋轉 → 更新圖片（按「儲存全部」後寫入 DB）
  const autoRotate = async (docType: "passport" | "taibao" | "idCard") => {
    const base64 = docType === "passport" ? form.passport_image : docType === "taibao" ? form.taibao_image : form.id_card_image;
    if (!base64) return;
    const setStatus = docType === "passport" ? setPassportStatus : docType === "taibao" ? setTaibaoStatus : setIdCardStatus;
    setStatus({ type: "rotating" });
    try {
      const res = await fetch("/api/ocr/orientation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const result: { rotation?: number; error?: string } = await res.json();
      if (result.error) throw new Error(result.error);
      const rotation = result.rotation as 0 | 90 | 180 | 270;
      if (!rotation) { setStatus({ type: "success", msg: "AI 判斷照片方向已是正的，無需旋轉" }); return; }
      const rotated = await rotateBase64(base64, rotation);
      setDocImage(docType, rotated);
      setStatus({ type: "success", msg: `已自動旋轉 ${rotation}°，請點「儲存全部」保存` });
    } catch {
      setStatus({ type: "error", msg: "智能轉正失敗，可改用圖片上的手動旋轉按鈕" });
    }
  };

  // 手動順時針轉 90°
  const manualRotate = async (docType: "passport" | "taibao" | "idCard") => {
    const base64 = docType === "passport" ? form.passport_image : docType === "taibao" ? form.taibao_image : form.id_card_image;
    if (!base64) return;
    const setStatus = docType === "passport" ? setPassportStatus : docType === "taibao" ? setTaibaoStatus : setIdCardStatus;
    const rotated = await rotateBase64(base64, 90);
    setDocImage(docType, rotated);
    setStatus({ type: "success", msg: "已順時針旋轉 90°，請點「儲存全部」保存" });
  };

  // 比較效期：new 是否比 existing 更新（existing 為空時視為「新的一定更新」）
  const isNewerExpiry = (newDate: string | null | undefined, existingDate: string | null | undefined): boolean => {
    if (!newDate) return false;
    if (!existingDate) return true;
    return new Date(newDate) > new Date(existingDate);
  };

  const applyOcr = (result: OcrResult, docType: "passport" | "taibao" | "idCard") => {
    const updates: Partial<Customer> = {};
    const detected: string[] = [];
    const skipped: string[] = [];

    if (result.name)     { updates.name     = result.name;     detected.push("name");     }
    if (result.nameEn)   { updates.name_en  = result.nameEn;  detected.push("name_en");  }
    if (result.birthday) { updates.birthday = result.birthday; detected.push("birthday"); }
    if (result.gender)   { updates.gender   = result.gender;  detected.push("gender");   }

    if (docType === "passport") {
      // 護照每次號碼不同：以最新效期優先，連同號碼一起更新
      const isNewer = isNewerExpiry(result.passportExpiry, form.passport_expiry);
      if (isNewer) {
        if (result.passport)       { updates.passport        = result.passport;       detected.push("passport");        }
        if (result.passportExpiry) { updates.passport_expiry = result.passportExpiry; detected.push("passport_expiry"); }
      } else if (result.passportExpiry && form.passport_expiry) {
        // 掃到的效期較舊或相同，保留現有護照資料
        skipped.push("護照（現有效期較新，已保留）");
      } else {
        // 沒有效期資訊時直接更新
        if (result.passport)       { updates.passport        = result.passport;       detected.push("passport");        }
        if (result.passportExpiry) { updates.passport_expiry = result.passportExpiry; detected.push("passport_expiry"); }
      }
      // 護照上若有身分證字號，且目前欄位為空，則一起填入
      if (result.idNumber && !form.id_number) {
        updates.id_number = result.idNumber;
        detected.push("id_number");
      }
    } else if (docType === "taibao") {
      // 台胞證號碼不變：無條件保存號碼；效期以最新為準
      if (result.taibaoNumber) { updates.taibao_number = result.taibaoNumber; detected.push("taibao_number"); }
      if (isNewerExpiry(result.taibaoExpiry, form.taibao_expiry)) {
        if (result.taibaoExpiry) { updates.taibao_expiry = result.taibaoExpiry; detected.push("taibao_expiry"); }
      } else if (result.taibaoExpiry && form.taibao_expiry) {
        skipped.push("台胞證效期（現有效期較新，已保留）");
      } else {
        if (result.taibaoExpiry) { updates.taibao_expiry = result.taibaoExpiry; detected.push("taibao_expiry"); }
      }
    } else {
      if (result.idNumber) { updates.id_number = result.idNumber; detected.push("id_number"); }
    }

    setForm(prev => ({ ...prev, ...updates }));
    flashHighlight(detected);
    return { detected, skipped };
  };

  const scanDocument = async (docType: "passport" | "taibao" | "idCard") => {
    const base64 = docType === "passport" ? form.passport_image : docType === "taibao" ? form.taibao_image : form.id_card_image;
    if (!base64) return;
    const setStatus = docType === "passport" ? setPassportStatus : docType === "taibao" ? setTaibaoStatus : setIdCardStatus;
    setStatus({ type: "scanning" });
    try {
      const res = await fetch("/api/ocr/document", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, docType }),
      });
      const result: OcrResult = await res.json();
      if (result.error) throw new Error(result.error);
      const { detected, skipped } = applyOcr(result, docType);
      if (result.name) {
        const { data: dups } = await supabase.from("customers").select("id,name,birthday")
          .ilike("name", result.name.trim()).neq("id", id);
        setDupWarning((dups || []).slice(0, 3));
      } else { setDupWarning([]); }
      const labels: Record<string, string> = {
        name:"姓名", name_en:"英文名", birthday:"生日", gender:"性別",
        passport:"護照號碼", passport_expiry:"護照效期",
        taibao_number:"台胞證號碼", taibao_expiry:"台胞證效期", id_number:"身分證字號",
      };
      const detectedLabels = detected.map(k => labels[k] || k).join("、");
      const skippedNote = skipped.length > 0 ? `（${skipped.join("、")}）` : "";
      const msg = detected.length > 0
        ? `已辨識：${detectedLabels}${skippedNote}`
        : skipped.length > 0
          ? skipped.join("、")
          : "未辨識到資料，請確認圖片清晰度";
      setStatus({ type: "success", msg });
    } catch {
      setStatus({ type: "error", msg: "辨識失敗，請確認圖片清晰度或 API 設定" });
    }
  };

  if (!customer) return (
    <div className="flex justify-center items-center h-64">
      <div className="w-6 h-6 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const totalPaid = tours.reduce((s, t) => s + (t.paid_amount || 0), 0);
  const toursDone = tours.filter(t => t.status === "completed").length;

  const hl = (field: string) =>
    highlightedFields.has(field)
      ? input + " ring-2 ring-emerald-400 bg-emerald-50 dark:bg-emerald-900/30"
      : input;

  return (
    <div className={`p-6 space-y-5 transition-[max-width] duration-300 ${sidebarCollapsed ? "max-w-7xl" : "max-w-5xl"}`}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/crm"
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{customer.name}</h1>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              加入時間：{new Date(customer.created_at).toLocaleDateString("zh-TW")}
            </div>
          </div>
        </div>
        <button onClick={del}
          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "參加出團",  value: tours.length + " 次" },
          { label: "已完成出團", value: toursDone + " 次" },
          { label: "累計付款",  value: totalPaid > 0 ? `NT$${totalPaid.toLocaleString()}` : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-slate-400 dark:text-slate-500">{label}</div>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      {/* ── Main 2-col grid ── */}
      <div className="grid lg:grid-cols-2 gap-5">

        {/* Edit form */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">基本資料</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>姓名 *</label>
              <input className={hl("name")} value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>英文拼音</label>
              <input className={hl("name_en")} placeholder="WANG XIAO MING"
                value={form.name_en || ""} onChange={e => setForm({...form, name_en: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>性別</label>
              <select className={hl("gender")} value={form.gender || "other"}
                onChange={e => setForm({...form, gender: e.target.value as Customer["gender"]})}>
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <label className={lbl}>生日</label>
              <input type="date" className={hl("birthday")} value={form.birthday || ""}
                onChange={e => setForm({...form, birthday: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>電話</label>
              <input className={input} value={form.phone || ""} onChange={e => setForm({...form, phone: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>Email</label>
              <input className={input} value={form.email || ""} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>身分證字號</label>
              <input className={hl("id_number")} value={form.id_number || ""} onChange={e => setForm({...form, id_number: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>護照號碼</label>
              <input className={hl("passport")} value={form.passport || ""} onChange={e => setForm({...form, passport: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>護照效期</label>
              <input type="date" className={hl("passport_expiry")} value={form.passport_expiry || ""}
                onChange={e => setForm({...form, passport_expiry: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>台胞證號碼</label>
              <input className={hl("taibao_number")} value={form.taibao_number || ""}
                onChange={e => setForm({...form, taibao_number: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>台胞證效期</label>
              <input type="date" className={hl("taibao_expiry")} value={form.taibao_expiry || ""}
                onChange={e => setForm({...form, taibao_expiry: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>地址</label>
              <input className={input} value={form.address || ""} onChange={e => setForm({...form, address: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>緊急聯絡人</label>
              <input className={input} value={form.emergency_contact || ""} onChange={e => setForm({...form, emergency_contact: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>緊急聯絡電話</label>
              <input className={input} value={form.emergency_phone || ""} onChange={e => setForm({...form, emergency_phone: e.target.value})} />
            </div>
            <div className="col-span-2">
              <label className={lbl}>備註</label>
              <textarea className={input + " h-16 resize-none"} value={form.notes || ""}
                onChange={e => setForm({...form, notes: e.target.value})} />
            </div>

            {/* ── 餐食偏好 ── */}
            <div className="col-span-2">
              <label className={lbl + " flex items-center gap-1"}>
                <UtensilsCrossed className="w-3 h-3" /> 餐食偏好（預設帶入出團旅客）
              </label>
              <div className="flex flex-wrap gap-2 mt-1">
                {/* 正常餐 tag */}
                {(() => {
                  const prefs = (form.meal_preference || "").split(",").map(s => s.trim()).filter(Boolean);
                  const isNormal = prefs.length === 0;
                  return (
                    <button type="button"
                      onClick={() => setForm(prev => ({ ...prev, meal_preference: "" }))}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
                        ${isNormal
                          ? "bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-500"
                          : "bg-white dark:bg-slate-700 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"
                        }`}>
                      正常餐
                    </button>
                  );
                })()}
                {MEAL_OPTIONS.map(opt => {
                  const prefs = (form.meal_preference || "").split(",").map(s => s.trim()).filter(Boolean);
                  const selected = prefs.includes(opt.key);
                  return (
                    <button key={opt.key} type="button"
                      onClick={() => toggleMealPref(opt.key)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                        ${selected
                          ? opt.color
                          : "bg-white dark:bg-slate-700 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"
                        }`}>
                      {opt.key}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors">
              <Save className="w-4 h-4" />
              {saving ? "儲存中…" : "儲存全部"}
            </button>
          </div>
        </div>

        {/* Tour history */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">出團記錄</h3>
          </div>
          {tours.length === 0 ? (
            <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-sm">尚無出團記錄</div>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {tours.map(t => (
                <Link key={t.id} href={`/admin/groups/${t.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                  <div>
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{t.name}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">
                      {t.destination} ・ {t.start_date || "未定"}
                      {t.paid_amount > 0 && ` ・ 已付 NT$${t.paid_amount.toLocaleString()}`}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[t.status]}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Document Photos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <DocumentCard title="🪪 身分證" image={form.id_card_image || ""} status={idCardStatus}
          inputRef={idCardInputRef} onUpload={e => handleDocUpload(e, "idCard")}
          onClear={() => { setForm(p => ({ ...p, id_card_image: "" })); setIdCardStatus({ type: "idle" }); }}
          onScan={() => scanDocument("idCard")}
          onAutoRotate={() => autoRotate("idCard")} onManualRotate={() => manualRotate("idCard")} />
        <DocumentCard title="🛂 護照" image={form.passport_image || ""} status={passportStatus}
          inputRef={passportInputRef} onUpload={e => handleDocUpload(e, "passport")}
          onClear={() => { setForm(p => ({ ...p, passport_image: "" })); setPassportStatus({ type: "idle" }); }}
          onScan={() => scanDocument("passport")}
          onAutoRotate={() => autoRotate("passport")} onManualRotate={() => manualRotate("passport")} />
        <DocumentCard title="🪪 台胞證" image={form.taibao_image || ""} status={taibaoStatus}
          inputRef={taibaoInputRef} onUpload={e => handleDocUpload(e, "taibao")}
          onClear={() => { setForm(p => ({ ...p, taibao_image: "" })); setTaibaoStatus({ type: "idle" }); }}
          onScan={() => scanDocument("taibao")}
          onAutoRotate={() => autoRotate("taibao")} onManualRotate={() => manualRotate("taibao")} />
      </div>

      {/* ── OCR highlight notice ── */}
      {highlightedFields.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-emerald-700 dark:text-emerald-300 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />
          AI 已自動填入綠色高亮欄位，請確認後點「儲存全部」
        </div>
      )}

      {/* ── Duplicate warning ── */}
      {dupWarning.length > 0 && (
        <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl text-amber-800 dark:text-amber-200 text-sm space-y-1.5">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            辨識資料疑似與以下旅客重複，請確認是否為同一人：
          </div>
          {dupWarning.map(d => (
            <div key={d.id} className="flex items-center gap-3 pl-6">
              <Link href={`/admin/crm/${d.id}`} className="text-violet-500 dark:text-violet-400 hover:underline font-medium">
                {d.name}
              </Link>
              <span className="text-amber-600 dark:text-amber-400 text-xs">{d.birthday || "生日未填"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DocumentCard ──────────────────────────────────────────────────────────────
function DocumentCard({
  title, image, status, inputRef, onUpload, onClear, onScan, onAutoRotate, onManualRotate,
}: {
  title: string; image: string; status: ScanStatus;
  inputRef: React.RefObject<HTMLInputElement>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void; onScan: () => void;
  onAutoRotate: () => void; onManualRotate: () => void;
}) {
  const scanning = status.type === "scanning";
  const rotating = status.type === "rotating";
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{title}</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors">
            <Upload className="w-3.5 h-3.5" /> 上傳
          </button>
          <button onClick={onAutoRotate} disabled={!image || rotating || scanning}
            title="AI 自動判斷照片方向並轉正"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg disabled:opacity-40 transition-colors">
            {rotating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            {rotating ? "轉正中…" : "智能轉正"}
          </button>
          <button onClick={onScan} disabled={!image || scanning || rotating}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-40 transition-colors">
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
            {scanning ? "辨識中…" : "AI 辨識"}
          </button>
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />

      <div className="p-4">
        {image ? (
          <div className="relative group">
            <img src={image} alt={title}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 object-contain max-h-52 bg-slate-50 dark:bg-slate-700/30" />
            <button onClick={onManualRotate} title="手動順時針旋轉 90°"
              className="absolute top-2 right-10 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-600">
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClear}
              className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-lg p-10 text-center text-slate-400 dark:text-slate-500 cursor-pointer hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50/30 dark:hover:bg-violet-900/10 transition-colors">
            <Upload className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">點此上傳{title.replace(/[🛂🪪]/g, "").trim()}圖片</p>
            <p className="text-xs mt-1 opacity-60">支援 JPG、PNG、WEBP</p>
          </div>
        )}
      </div>

      {status.type !== "idle" && (
        <div className={`mx-4 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
          ${status.type === "scanning" ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300" : ""}
          ${status.type === "rotating" ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300" : ""}
          ${status.type === "success"  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300" : ""}
          ${status.type === "error"    ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" : ""}
        `}>
          {(status.type === "scanning" || status.type === "rotating") && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
          {status.type === "success"  && <CheckCircle className="w-3.5 h-3.5 shrink-0" />}
          {status.type === "error"    && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
          {status.type === "scanning" ? "正在辨識證件資訊…" : status.type === "rotating" ? "AI 正在判斷照片方向…" : status.msg}
        </div>
      )}
    </div>
  );
}
