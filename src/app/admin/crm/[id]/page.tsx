"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, Customer, Tour } from "@/lib/supabase";
import { ArrowLeft, Save, Trash2, Upload, ScanLine, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";

const input = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400";
const lbl   = "block text-xs font-medium text-slate-500 mb-1";

const STATUS_COLOR: Record<string, string> = {
  planning:"bg-yellow-100 text-yellow-800", confirmed:"bg-blue-100 text-blue-800",
  ongoing:"bg-green-100 text-green-800", completed:"bg-slate-100 text-slate-600",
  cancelled:"bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  planning:"規劃中", confirmed:"已確認", ongoing:"進行中",
  completed:"已完成", cancelled:"已取消",
};

// Compress image for document storage / OCR (1200px, high quality for text readability)
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

interface OcrResult {
  name?: string | null;
  nameEn?: string | null;
  passport?: string | null;
  birthday?: string | null;
  gender?: "male" | "female" | null;
  passportExpiry?: string | null;
  taibaoNumber?: string | null;
  taibaoExpiry?: string | null;
  idNumber?: string | null;
  error?: string;
}

type ScanStatus = { type: "idle" } | { type: "scanning" } | { type: "success"; msg: string } | { type: "error"; msg: string };

export default function CustomerDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm]         = useState<Partial<Customer>>({});
  const [tours, setTours]       = useState<(Tour & { paid_amount: number })[]>([]);
  const [saving, setSaving]     = useState(false);
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());

  // Document scan status
  const [passportStatus, setPassportStatus] = useState<ScanStatus>({ type: "idle" });
  const [taibaoStatus,   setTaibaoStatus]   = useState<ScanStatus>({ type: "idle" });
  const [idCardStatus,   setIdCardStatus]   = useState<ScanStatus>({ type: "idle" });

  const [dupWarning, setDupWarning] = useState<Array<{id: string; name: string; birthday: string}>>([]);

  // File input refs
  const passportInputRef = useRef<HTMLInputElement>(null);
  const taibaoInputRef   = useRef<HTMLInputElement>(null);
  const idCardInputRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("customers").select("*").eq("id", id).single();
      if (!data) { router.push("/admin/crm"); return; }
      setCustomer(data);
      setForm(data);

      const { data: ct } = await supabase
        .from("customer_tours")
        .select("paid_amount, tour:tours(*)")
        .eq("customer_id", id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tourList = (ct || []).map((r: any) => ({
        ...(Array.isArray(r.tour) ? r.tour[0] : r.tour),
        paid_amount: r.paid_amount,
      }));
      setTours(tourList);
    })();
  }, [id]);

  // Highlight fields temporarily after OCR fill
  const flashHighlight = useCallback((fields: string[]) => {
    setHighlightedFields(new Set(fields));
    setTimeout(() => setHighlightedFields(new Set()), 3000);
  }, []);

  const save = async () => {
    setSaving(true);
    await supabase.from("customers").update({
      name:              form.name,
      name_en:           form.name_en,
      phone:             form.phone,
      email:             form.email,
      id_number:         form.id_number,
      id_card_image:     form.id_card_image,
      passport:          form.passport,
      passport_expiry:   form.passport_expiry   || null,
      passport_image:    form.passport_image,
      taibao_number:     form.taibao_number,
      taibao_expiry:     form.taibao_expiry     || null,
      taibao_image:      form.taibao_image,
      birthday:          form.birthday          || null,
      gender:            form.gender,
      address:           form.address,
      emergency_contact: form.emergency_contact,
      emergency_phone:   form.emergency_phone,
      notes:             form.notes,
    }).eq("id", id);
    setSaving(false);
    const { data } = await supabase.from("customers").select("*").eq("id", id).single();
    if (data) { setCustomer(data); setForm(data); }
  };

  const del = async () => {
    if (!confirm(`確定刪除「${customer?.name}」？`)) return;
    await supabase.from("customers").delete().eq("id", id);
    router.push("/admin/crm");
  };

  // Handle document photo upload
  const handleDocUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    docType: "passport" | "taibao" | "idCard"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    if (docType === "passport") {
      setForm(prev => ({ ...prev, passport_image: compressed }));
      setPassportStatus({ type: "idle" });
    } else if (docType === "taibao") {
      setForm(prev => ({ ...prev, taibao_image: compressed }));
      setTaibaoStatus({ type: "idle" });
    } else {
      setForm(prev => ({ ...prev, id_card_image: compressed }));
      setIdCardStatus({ type: "idle" });
    }
    e.target.value = "";
  };

  // Apply OCR result to form
  const applyOcr = useCallback((result: OcrResult, docType: "passport" | "taibao" | "idCard") => {
    const updates: Partial<Customer> = {};
    const detected: string[] = [];

    if (result.name)    { updates.name    = result.name;    detected.push("name");    }
    if (result.nameEn)  { updates.name_en = result.nameEn;  detected.push("name_en"); }
    if (result.birthday){ updates.birthday = result.birthday; detected.push("birthday"); }
    if (result.gender)  { updates.gender  = result.gender;  detected.push("gender");  }

    if (docType === "passport") {
      if (result.passport)       { updates.passport        = result.passport;       detected.push("passport");        }
      if (result.passportExpiry) { updates.passport_expiry = result.passportExpiry; detected.push("passport_expiry"); }
    } else if (docType === "taibao") {
      if (result.taibaoNumber) { updates.taibao_number = result.taibaoNumber; detected.push("taibao_number"); }
      if (result.taibaoExpiry) { updates.taibao_expiry = result.taibaoExpiry; detected.push("taibao_expiry"); }
    } else {
      if (result.idNumber) { updates.id_number = result.idNumber; detected.push("id_number"); }
    }

    setForm(prev => ({ ...prev, ...updates }));
    flashHighlight(detected);
    return detected;
  }, [flashHighlight]);

  // Run OCR scan
  const scanDocument = async (docType: "passport" | "taibao" | "idCard") => {
    const base64 = docType === "passport" ? form.passport_image
                 : docType === "taibao"   ? form.taibao_image
                 : form.id_card_image;
    if (!base64) return;

    const setStatus = docType === "passport" ? setPassportStatus
                    : docType === "taibao"   ? setTaibaoStatus
                    : setIdCardStatus;
    setStatus({ type: "scanning" });

    try {
      const res = await fetch("/api/ocr/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, docType }),
      });
      const result: OcrResult = await res.json();

      if (result.error) throw new Error(result.error);

      const detected = applyOcr(result, docType);

      // Search for other customers with the same name (possible duplicate)
      if (result.name) {
        const { data: dups } = await supabase
          .from("customers").select("id,name,birthday")
          .ilike("name", result.name.trim()).neq("id", id);
        setDupWarning((dups || []).slice(0, 3));
      } else {
        setDupWarning([]);
      }

      const labels: Record<string, string> = {
        name: "姓名", name_en: "英文名", birthday: "生日", gender: "性別",
        passport: "護照號碼", passport_expiry: "護照效期",
        taibao_number: "台胞證號碼", taibao_expiry: "台胞證效期",
        id_number: "身分證字號",
      };
      const detectedLabels = detected.map(k => labels[k] || k).join("、");
      setStatus({ type: "success", msg: detected.length > 0 ? `已辨識：${detectedLabels}` : "未辨識到資料，請確認圖片清晰度" });
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

  // Highlight class helper
  const hl = (field: string) =>
    highlightedFields.has(field)
      ? input + " ring-2 ring-emerald-400 bg-emerald-50 transition-all"
      : input;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/crm" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{customer.name}</h1>
            <div className="text-sm text-slate-500 mt-0.5">加入時間：{new Date(customer.created_at).toLocaleDateString("zh-TW")}</div>
          </div>
        </div>
        <button onClick={del} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "參加出團", value: tours.length + " 次" },
          { label: "已完成出團", value: toursDone + " 次" },
          { label: "累計付款", value: totalPaid > 0 ? `NT$${totalPaid.toLocaleString()}` : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-slate-400">{label}</div>
            <div className="text-lg font-bold text-slate-800 mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      {/* Main 2-col grid */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Edit form */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-slate-700 text-sm">基本資料</h3>
          <div className="grid grid-cols-2 gap-3">
            {/* 姓名 + 英文名 */}
            <div>
              <label className={lbl}>姓名 *</label>
              <input className={hl("name")} value={form.name || ""}
                onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>英文拼音</label>
              <input className={hl("name_en")} placeholder="WANG XIAO MING"
                value={form.name_en || ""} onChange={e => setForm({...form, name_en: e.target.value})} />
            </div>
            {/* 性別 + 生日 */}
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
            {/* 電話 + Email */}
            <div>
              <label className={lbl}>電話</label>
              <input className={input} value={form.phone || ""} onChange={e => setForm({...form, phone: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>Email</label>
              <input className={input} value={form.email || ""} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            {/* 身分證 + 護照號碼 */}
            <div>
              <label className={lbl}>身分證字號</label>
              <input className={hl("id_number")} value={form.id_number || ""} onChange={e => setForm({...form, id_number: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>護照號碼</label>
              <input className={hl("passport")} value={form.passport || ""}
                onChange={e => setForm({...form, passport: e.target.value})} />
            </div>
            {/* 護照效期 + 台胞證號碼 */}
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
            {/* 台胞證效期 + 地址 */}
            <div>
              <label className={lbl}>台胞證效期</label>
              <input type="date" className={hl("taibao_expiry")} value={form.taibao_expiry || ""}
                onChange={e => setForm({...form, taibao_expiry: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>地址</label>
              <input className={input} value={form.address || ""} onChange={e => setForm({...form, address: e.target.value})} />
            </div>
            {/* 緊急聯絡人 */}
            <div>
              <label className={lbl}>緊急聯絡人</label>
              <input className={input} value={form.emergency_contact || ""} onChange={e => setForm({...form, emergency_contact: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>緊急聯絡電話</label>
              <input className={input} value={form.emergency_phone || ""} onChange={e => setForm({...form, emergency_phone: e.target.value})} />
            </div>
            {/* 備註 */}
            <div className="col-span-2">
              <label className={lbl}>備註</label>
              <textarea className={input + " h-16 resize-none"} value={form.notes || ""}
                onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? "儲存中…" : "儲存全部"}
            </button>
          </div>
        </div>

        {/* Tour history */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-700 text-sm">出團記錄</h3>
          </div>
          {tours.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">尚無出團記錄</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {tours.map(t => (
                <Link key={t.id} href={`/admin/groups/${t.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{t.name}</div>
                    <div className="text-xs text-slate-400">
                      {t.destination} ・ {t.start_date || "未定"}
                      {t.paid_amount > 0 && ` ・ 已付 NT$${t.paid_amount.toLocaleString()}`}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[t.status]}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Document Photos Section ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ID Card */}
        <DocumentCard
          title="🪪 身分證"
          image={form.id_card_image || ""}
          status={idCardStatus}
          inputRef={idCardInputRef}
          onUpload={e => handleDocUpload(e, "idCard")}
          onClear={() => { setForm(p => ({ ...p, id_card_image: "" })); setIdCardStatus({ type: "idle" }); }}
          onScan={() => scanDocument("idCard")}
        />
        {/* Passport Card */}
        <DocumentCard
          title="🛂 護照"
          image={form.passport_image || ""}
          status={passportStatus}
          inputRef={passportInputRef}
          onUpload={e => handleDocUpload(e, "passport")}
          onClear={() => { setForm(p => ({ ...p, passport_image: "" })); setPassportStatus({ type: "idle" }); }}
          onScan={() => scanDocument("passport")}
        />
        {/* Taibao Card */}
        <DocumentCard
          title="🪪 台胞證"
          image={form.taibao_image || ""}
          status={taibaoStatus}
          inputRef={taibaoInputRef}
          onUpload={e => handleDocUpload(e, "taibao")}
          onClear={() => { setForm(p => ({ ...p, taibao_image: "" })); setTaibaoStatus({ type: "idle" }); }}
          onScan={() => scanDocument("taibao")}
        />
      </div>

      {highlightedFields.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />
          AI 已自動填入綠色高亮欄位，請確認後點「儲存全部」
        </div>
      )}

      {dupWarning.length > 0 && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm space-y-1.5">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            辨識資料疑似與以下旅客重複，請確認是否為同一人：
          </div>
          {dupWarning.map(d => (
            <div key={d.id} className="flex items-center gap-3 pl-6">
              <Link href={`/admin/crm/${d.id}`} className="text-violet-600 hover:underline font-medium">
                {d.name}
              </Link>
              <span className="text-amber-700 text-xs">{d.birthday || "生日未填"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DocumentCard sub-component ────────────────────────────────────────────────
function DocumentCard({
  title, image, status, inputRef, onUpload, onClear, onScan,
}: {
  title: string;
  image: string;
  status: ScanStatus;
  inputRef: React.RefObject<HTMLInputElement>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onScan: () => void;
}) {
  const scanning = status.type === "scanning";

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-700 text-sm">{title}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            上傳
          </button>
          <button
            onClick={onScan}
            disabled={!image || scanning}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-40 transition-colors"
          >
            {scanning
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <ScanLine className="w-3.5 h-3.5" />
            }
            {scanning ? "辨識中…" : "AI 辨識"}
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onUpload}
      />

      {/* Image area */}
      <div className="p-4">
        {image ? (
          <div className="relative group">
            <img
              src={image}
              alt={title}
              className="w-full rounded-lg border border-slate-200 object-contain max-h-52 bg-slate-50"
            />
            <button
              onClick={onClear}
              className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-lg p-10 text-center text-slate-400 cursor-pointer hover:border-violet-300 hover:bg-violet-50/30 transition-colors"
          >
            <Upload className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">點此上傳{title.replace(/[🛂🪪]/g, "").trim()}圖片</p>
            <p className="text-xs mt-1 opacity-60">支援 JPG、PNG、WEBP</p>
          </div>
        )}
      </div>

      {/* Status bar */}
      {status.type !== "idle" && (
        <div className={`mx-4 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
          ${status.type === "scanning" ? "bg-violet-50 text-violet-600" : ""}
          ${status.type === "success"  ? "bg-emerald-50 text-emerald-700" : ""}
          ${status.type === "error"    ? "bg-red-50 text-red-600" : ""}
        `}>
          {status.type === "scanning" && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
          {status.type === "success"  && <CheckCircle className="w-3.5 h-3.5 shrink-0" />}
          {status.type === "error"    && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
          {status.type === "scanning" ? "正在辨識證件資訊…" : status.msg}
        </div>
      )}
    </div>
  );
}
