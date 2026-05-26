"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  User, Phone, Mail, CreditCard, Globe, MapPin, Heart, Utensils,
  Camera, Upload, CheckCircle2, AlertCircle, Loader2, ChevronDown,
  CalendarDays, Users, FileText, X, Image as ImageIcon,
} from "lucide-react";

// ── 型別 ────────────────────────────────────────────────────────────────────────

interface TourInfo {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  pax: number;
  notes: string;
  status: string;
  selling_price: number;
}

interface ItinInfo {
  doc_url: string;
  pdf_name: string;
}

type Step = "form" | "success";

// ── 工具函式 ──────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  if (!s) return "";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
}

function nightCount(start: string, end: string) {
  if (!start || !end) return 0;
  return Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function toEmbedUrl(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/docs\.google\.com\/document\/d\/(?:e\/)?([^/?#]+)/);
  if (!m) return raw;
  if (raw.includes("/d/e/")) {
    return `https://docs.google.com/document/d/e/${m[1]}/pub?embedded=true`;
  }
  return `https://docs.google.com/document/d/${m[1]}/preview`;
}

async function compressImage(file: File, maxPx = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── 照片上傳組件 ──────────────────────────────────────────────────────────────

function PhotoUpload({
  label, icon, value, onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (b64: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("請選擇圖片檔案"); return; }
    if (file.size > 20 * 1024 * 1024) { alert("圖片大小不可超過 20MB"); return; }
    setLoading(true);
    try {
      const b64 = await compressImage(file);
      onChange(b64);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
        {icon}{label}
      </p>
      <div
        onClick={() => ref.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl overflow-hidden cursor-pointer
          transition-all duration-200 group
          ${value
            ? "border-emerald-300 bg-emerald-50"
            : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50"}
        `}
        style={{ minHeight: 140 }}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt={label} className="w-full object-cover" style={{ maxHeight: 220 }} />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <span className="hidden group-hover:flex items-center gap-1.5 bg-white/90 text-slate-700 text-xs font-medium px-3 py-1.5 rounded-full shadow">
                <Camera className="w-3.5 h-3.5" /> 重新上傳
              </span>
            </div>
            <button
              type="button"
              onClick={ev => { ev.stopPropagation(); onChange(""); }}
              className="absolute top-2 right-2 bg-white/90 hover:bg-red-50 text-slate-500 hover:text-red-500 rounded-full p-1 shadow transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
            {loading
              ? <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              : <Upload className="w-8 h-8 text-slate-300 group-hover:text-blue-400 transition-colors" />
            }
            <p className="text-xs text-slate-400 text-center">
              {loading ? "壓縮中…" : "點擊或拖曳上傳"}
            </p>
          </div>
        )}
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handle}
        />
      </div>
    </div>
  );
}

// ── Section 標題組件 ──────────────────────────────────────────────────────────

function Section({ icon, title, children, color = "blue" }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  color?: "blue" | "purple" | "emerald" | "amber" | "rose" | "teal";
}) {
  const colors = {
    blue:    "from-blue-500 to-indigo-600",
    purple:  "from-purple-500 to-pink-600",
    emerald: "from-emerald-500 to-teal-600",
    amber:   "from-amber-500 to-orange-600",
    rose:    "from-rose-500 to-pink-600",
    teal:    "from-teal-500 to-cyan-600",
  };
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
      <div className={`bg-gradient-to-r ${colors[color]} px-6 py-4`}>
        <div className="flex items-center gap-2.5 text-white">
          <span className="opacity-90">{icon}</span>
          <h2 className="font-semibold text-base">{title}</h2>
        </div>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

// ── 輸入框組件 ────────────────────────────────────────────────────────────────

function Field({ label, required, children }: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-600">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

const inp =
  "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white " +
  "focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 " +
  "placeholder:text-slate-300 transition-shadow";

const MEAL_OPTS = ["蛋奶素", "全素", "不吃羊", "不吃牛", "不吃豬", "不吃海鮮", "清真食品"];

// ── 主頁面 ────────────────────────────────────────────────────────────────────

export default function JoinPage() {
  const { tourId } = useParams<{ tourId: string }>();

  const [tour,    setTour]    = useState<TourInfo | null>(null);
  const [itin,    setItin]    = useState<ItinInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [step,    setStep]    = useState<Step>("form");
  const [submitting, setSubmitting] = useState(false);
  const [errMsg,  setErrMsg]  = useState("");
  const [showItin, setShowItin] = useState(true);

  // 表單欄位
  const [name,              setName]              = useState("");
  const [nameEn,            setNameEn]            = useState("");
  const [phone,             setPhone]             = useState("");
  const [email,             setEmail]             = useState("");
  const [idNumber,          setIdNumber]          = useState("");
  const [birthday,          setBirthday]          = useState("");
  const [gender,            setGender]            = useState("female");
  const [address,           setAddress]           = useState("");
  const [passport,          setPassport]          = useState("");
  const [passportExpiry,    setPassportExpiry]    = useState("");
  const [taibaoNumber,      setTaibaoNumber]      = useState("");
  const [taibaoExpiry,      setTaibaoExpiry]      = useState("");
  const [emergencyContact,  setEmergencyContact]  = useState("");
  const [emergencyPhone,    setEmergencyPhone]    = useState("");
  const [selectedMeals,     setSelectedMeals]     = useState<string[]>([]);
  const [notes,             setNotes]             = useState("");
  const [participantType,   setParticipantType]   = useState("adult");

  // 照片
  const [idCardImage,    setIdCardImage]    = useState("");
  const [passportImage,  setPassportImage]  = useState("");
  const [taibaoImage,    setTaibaoImage]    = useState("");

  useEffect(() => {
    fetch(`/api/join/${tourId}`)
      .then(r => r.json())
      .then(d => {
        if (d.tour) { setTour(d.tour); setItin(d.itinerary); }
      })
      .finally(() => setLoading(false));
  }, [tourId]);

  const toggleMeal = (m: string) => {
    setSelectedMeals(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg("");

    if (!name.trim())  { setErrMsg("請填寫中文姓名");   return; }
    if (!phone.trim()) { setErrMsg("請填寫聯絡電話");   return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/join/${tourId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          name_en: nameEn.trim(),
          phone: phone.trim(),
          email: email.trim(),
          id_number: idNumber.trim(),
          birthday: birthday || null,
          gender,
          address: address.trim(),
          passport: passport.trim(),
          passport_expiry: passportExpiry || null,
          taibao_number: taibaoNumber.trim(),
          taibao_expiry: taibaoExpiry || null,
          emergency_contact: emergencyContact.trim(),
          emergency_phone: emergencyPhone.trim(),
          meal_preference: selectedMeals.join(","),
          notes: notes.trim(),
          participant_type: participantType,
          id_card_image:   idCardImage,
          passport_image:  passportImage,
          taibao_image:    taibaoImage,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStep("success");
      } else {
        setErrMsg(json.error || "提交失敗，請再試一次");
      }
    } catch {
      setErrMsg("網路錯誤，請再試一次");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-slate-500 text-sm">載入行程資訊…</p>
        </div>
      </div>
    );
  }

  if (!tour) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <AlertCircle className="w-14 h-14 text-red-400 mx-auto" />
          <h1 className="text-xl font-bold text-slate-700">找不到此行程</h1>
          <p className="text-slate-500 text-sm">連結可能已失效，請聯絡旅行社</p>
        </div>
      </div>
    );
  }

  const nights = nightCount(tour.start_date, tour.end_date);

  // ── Success ──
  if (step === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="relative">
            <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-200">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center text-lg shadow">
              🎉
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">報名成功！</h1>
            <p className="text-slate-500 mt-2 text-sm leading-relaxed">
              您的報名資料已收到，<br />
              旅行社夥伴將與您確認詳細行程
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-emerald-100 text-left space-y-2">
            <p className="text-sm font-semibold text-slate-700">📋 行程資訊</p>
            <p className="text-sm text-slate-600">
              <span className="font-medium">行程名稱：</span>{tour.name}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-medium">目的地：</span>{tour.destination}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-medium">出發日期：</span>{fmtDate(tour.start_date)}
            </p>
          </div>
          <p className="text-xs text-slate-400">
            如有任何疑問，請洽暖心旅行社
          </p>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50">

      {/* ── Hero Banner ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
        {/* 背景裝飾圓 */}
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/5 rounded-full" />
        <div className="absolute -bottom-20 -left-10 w-80 h-80 bg-white/5 rounded-full" />
        <div className="absolute top-8 left-1/3 w-32 h-32 bg-white/5 rounded-full" />

        <div className="relative max-w-2xl mx-auto px-6 py-10">
          {/* 品牌 */}
          <div className="flex items-center gap-2 mb-6 opacity-80">
            <Globe className="w-4 h-4" />
            <span className="text-xs font-medium tracking-wider uppercase">暖心旅行社 · 線上報名</span>
          </div>

          {/* 行程主標題 */}
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-1">
            {tour.name}
          </h1>
          <p className="text-blue-200 text-base mb-5">{tour.destination}</p>

          {/* 行程 Info Chips */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-4 py-1.5 text-sm">
              <CalendarDays className="w-4 h-4 opacity-80" />
              <span>{fmtDate(tour.start_date)}</span>
            </div>
            {tour.end_date && (
              <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-4 py-1.5 text-sm">
                <CalendarDays className="w-4 h-4 opacity-80" />
                <span>→ {fmtDate(tour.end_date)}</span>
              </div>
            )}
            {nights > 0 && (
              <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-4 py-1.5 text-sm">
                <span>🌙 {nights} 晚 {nights + 1} 天</span>
              </div>
            )}
            {tour.pax > 0 && (
              <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-4 py-1.5 text-sm">
                <Users className="w-4 h-4 opacity-80" />
                <span>預計 {tour.pax} 人</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 旅客行程 ── */}
      {itin?.doc_url && (
        <div className="max-w-2xl mx-auto px-4 pt-6">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowItin(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <FileText className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-slate-700">旅客行程內容</span>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${showItin ? "rotate-180" : ""}`}
              />
            </button>
            {showItin && (
              <div className="border-t border-slate-100">
                <iframe
                  src={toEmbedUrl(itin.doc_url)}
                  className="w-full"
                  style={{ height: 520, border: "none" }}
                  title="旅客行程"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 表單 ── */}
      <form onSubmit={submit} className="max-w-2xl mx-auto px-4 py-6 space-y-5 pb-12">

        {/* 1. 基本資料 */}
        <Section icon={<User className="w-5 h-5" />} title="基本資料" color="blue">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="中文姓名" required>
              <input
                className={inp}
                placeholder="請填寫與證件相同的姓名"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </Field>
            <Field label="英文姓名 (護照拼音)">
              <input
                className={inp}
                placeholder="如：CHEN MING"
                value={nameEn}
                onChange={e => setNameEn(e.target.value.toUpperCase())}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="性別">
              <select
                className={inp}
                value={gender}
                onChange={e => setGender(e.target.value)}
              >
                <option value="female">女</option>
                <option value="male">男</option>
                <option value="other">其他</option>
              </select>
            </Field>
            <Field label="出生日期">
              <input
                type="date"
                className={inp}
                value={birthday}
                onChange={e => setBirthday(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="聯絡電話" required>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input
                  className={inp + " pl-9"}
                  placeholder="0912-345-678"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>
            </Field>
            <Field label="Email">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input
                  type="email"
                  className={inp + " pl-9"}
                  placeholder="example@mail.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </Field>
          </div>
          <Field label="身分證號碼">
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                className={inp + " pl-9 tracking-widest"}
                placeholder="A123456789"
                value={idNumber}
                onChange={e => setIdNumber(e.target.value.toUpperCase())}
              />
            </div>
          </Field>
          <Field label="聯絡地址">
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-300" />
              <input
                className={inp + " pl-9"}
                placeholder="台北市中正區…"
                value={address}
                onChange={e => setAddress(e.target.value)}
              />
            </div>
          </Field>
          <Field label="參團身份">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { k: "adult",     l: "成人",   e: "👤" },
                { k: "tour_only", l: "只參團", e: "🧳" },
                { k: "child",     l: "兒童",   e: "🧒" },
                { k: "infant",    l: "嬰兒",   e: "👶" },
              ].map(({ k, l, e }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setParticipantType(k)}
                  className={`
                    flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-medium transition-all
                    ${participantType === k
                      ? "bg-blue-50 border-blue-400 text-blue-700 shadow-sm"
                      : "border-slate-200 text-slate-500 hover:border-blue-200"}
                  `}
                >
                  <span>{e}</span> {l}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* 2. 旅行證件 */}
        <Section icon={<Globe className="w-5 h-5" />} title="旅行證件" color="purple">
          <div className="p-3 bg-purple-50 rounded-xl text-xs text-purple-600 flex items-start gap-2">
            <span className="text-base leading-tight">💡</span>
            <span>填寫護照或台胞證資料，以利後續出票作業。出境台灣（往中國大陸）請填台胞證；出境其他國家請填護照。</span>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-1">護照資訊</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="護照號碼">
              <input
                className={inp + " tracking-widest"}
                placeholder="A12345678"
                value={passport}
                onChange={e => setPassport(e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="護照效期">
              <input
                type="date"
                className={inp}
                value={passportExpiry}
                onChange={e => setPassportExpiry(e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-1">台胞證資訊</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="台胞證號碼">
              <input
                className={inp + " tracking-widest"}
                placeholder="TA1234567"
                value={taibaoNumber}
                onChange={e => setTaibaoNumber(e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="台胞證效期">
              <input
                type="date"
                className={inp}
                value={taibaoExpiry}
                onChange={e => setTaibaoExpiry(e.target.value)}
              />
            </Field>
          </div>
        </Section>

        {/* 3. 緊急聯絡人 */}
        <Section icon={<Heart className="w-5 h-5" />} title="緊急聯絡人" color="rose">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="緊急聯絡人姓名">
              <input
                className={inp}
                placeholder="姓名"
                value={emergencyContact}
                onChange={e => setEmergencyContact(e.target.value)}
              />
            </Field>
            <Field label="緊急聯絡人電話">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input
                  className={inp + " pl-9"}
                  placeholder="0912-000-000"
                  value={emergencyPhone}
                  onChange={e => setEmergencyPhone(e.target.value)}
                />
              </div>
            </Field>
          </div>
        </Section>

        {/* 4. 餐食偏好 */}
        <Section icon={<Utensils className="w-5 h-5" />} title="餐食偏好" color="amber">
          <p className="text-xs text-slate-400">請選擇所有適用的選項</p>
          <div className="flex flex-wrap gap-2">
            {MEAL_OPTS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => toggleMeal(m)}
                className={`
                  px-4 py-2 rounded-full text-sm border font-medium transition-all
                  ${selectedMeals.includes(m)
                    ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                    : "border-slate-200 text-slate-500 hover:border-amber-300"}
                `}
              >
                {m}
              </button>
            ))}
          </div>
          {selectedMeals.length > 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              已選擇：{selectedMeals.join("、")}
            </p>
          )}
        </Section>

        {/* 5. 證件照片上傳 */}
        <Section icon={<Camera className="w-5 h-5" />} title="證件照片上傳" color="teal">
          <div className="p-3 bg-teal-50 rounded-xl text-xs text-teal-600 flex items-start gap-2">
            <ImageIcon className="w-4 h-4 mt-0.5 shrink-0" />
            <span>上傳清晰的證件照片，有助於旅行社協助您快速完成出票手續。照片僅供本次行程使用，不會對外揭露。</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <PhotoUpload
              label="身分證（正面）"
              icon={<CreditCard className="w-3.5 h-3.5" />}
              value={idCardImage}
              onChange={setIdCardImage}
            />
            <PhotoUpload
              label="護照資料頁"
              icon={<Globe className="w-3.5 h-3.5" />}
              value={passportImage}
              onChange={setPassportImage}
            />
            <PhotoUpload
              label="台胞證"
              icon={<FileText className="w-3.5 h-3.5" />}
              value={taibaoImage}
              onChange={setTaibaoImage}
            />
          </div>
        </Section>

        {/* 6. 備註 */}
        <Section icon={<FileText className="w-5 h-5" />} title="其他備註" color="emerald">
          <Field label="備註說明">
            <textarea
              className={inp + " resize-none"}
              rows={3}
              placeholder="如有任何特殊需求或補充說明，請填寫於此…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </Field>
        </Section>

        {/* Error */}
        {errMsg && (
          <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-4 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errMsg}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="
            w-full py-4 rounded-2xl font-semibold text-base
            bg-gradient-to-r from-blue-600 to-indigo-600
            hover:from-blue-700 hover:to-indigo-700
            text-white shadow-lg shadow-blue-200
            disabled:opacity-60 disabled:cursor-not-allowed
            transition-all duration-200 flex items-center justify-center gap-2
          "
        >
          {submitting
            ? <><Loader2 className="w-5 h-5 animate-spin" /> 提交中…</>
            : <><CheckCircle2 className="w-5 h-5" /> 送出報名表</>
          }
        </button>

        <p className="text-center text-xs text-slate-400 pb-4">
          填寫完成後，旅行社夥伴將與您確認報名細節
        </p>
      </form>
    </div>
  );
}
