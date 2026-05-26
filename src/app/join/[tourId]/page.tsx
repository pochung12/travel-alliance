"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  User, Phone, Mail, Globe, MapPin, Heart, Utensils,
  Camera, Upload, CheckCircle2, AlertCircle, Loader2, ChevronDown,
  CalendarDays, Users, FileText, X, Image as ImageIcon, BedDouble,
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
        canvas.width = w; canvas.height = h;
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
    try { onChange(await compressImage(file)); }
    finally { setLoading(false); }
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
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handle} />
      </div>
    </div>
  );
}

// ── Section 標題 ─────────────────────────────────────────────────────────────

type SectionColor = "blue" | "purple" | "emerald" | "amber" | "rose" | "teal";

function Section({ icon, title, children, color = "blue" }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; color?: SectionColor;
}) {
  const gradients: Record<SectionColor, string> = {
    blue:    "from-blue-500 to-indigo-600",
    purple:  "from-purple-500 to-pink-600",
    emerald: "from-emerald-500 to-teal-600",
    amber:   "from-amber-500 to-orange-600",
    rose:    "from-rose-500 to-pink-600",
    teal:    "from-teal-500 to-cyan-600",
  };
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
      <div className={`bg-gradient-to-r ${gradients[color]} px-6 py-4`}>
        <div className="flex items-center gap-2.5 text-white">
          <span className="opacity-90">{icon}</span>
          <h2 className="font-semibold text-base">{title}</h2>
        </div>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

// ── 輸入框 ────────────────────────────────────────────────────────────────────

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-600">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
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

  const [tour,           setTour]           = useState<TourInfo | null>(null);
  const [itin,           setItin]           = useState<ItinInfo | null>(null);
  const [requiresTaibao, setRequiresTaibao] = useState(false);
  const [heroImageUrl,   setHeroImageUrl]   = useState("");
  const [loading,        setLoading]        = useState(true);
  const [step,           setStep]           = useState<Step>("form");
  const [submitting,     setSubmitting]     = useState(false);
  const [errMsg,         setErrMsg]         = useState("");
  const [showItin,       setShowItin]       = useState(true);
  const [imgLoaded,      setImgLoaded]      = useState(false);

  // 表單欄位
  const [name,             setName]             = useState("");
  const [nameEn,           setNameEn]           = useState("");
  const [phone,            setPhone]            = useState("");
  const [email,            setEmail]            = useState("");
  const [idNumber,         setIdNumber]         = useState("");
  const [birthday,         setBirthday]         = useState("");
  const [gender,           setGender]           = useState("female");
  const [address,          setAddress]          = useState("");
  const [passport,         setPassport]         = useState("");
  const [passportExpiry,   setPassportExpiry]   = useState("");
  const [taibaoNumber,     setTaibaoNumber]     = useState("");
  const [taibaoExpiry,     setTaibaoExpiry]     = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyPhone,   setEmergencyPhone]   = useState("");
  const [selectedMeals,    setSelectedMeals]    = useState<string[]>([]);
  const [notes,            setNotes]            = useState("");
  const [participantType,  setParticipantType]  = useState("adult");
  const [roommateName,     setRoommateName]     = useState("");
  const [singleRoom,       setSingleRoom]       = useState(false);

  // 照片
  const [passportImage, setPassportImage] = useState("");
  const [taibaoImage,   setTaibaoImage]   = useState("");

  useEffect(() => {
    fetch(`/api/join/${tourId}`)
      .then(r => r.json())
      .then(d => {
        if (d.tour) {
          setTour(d.tour);
          setItin(d.itinerary);
          setRequiresTaibao(d.requiresTaibao ?? false);
          setHeroImageUrl(d.heroImageUrl ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, [tourId]);

  const toggleMeal = (m: string) =>
    setSelectedMeals(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg("");
    if (!name.trim())    { setErrMsg("請填寫中文姓名");     return; }
    if (!nameEn.trim())  { setErrMsg("請填寫英文姓名拼音"); return; }
    if (!phone.trim())   { setErrMsg("請填寫聯絡電話");     return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/join/${tourId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), name_en: nameEn.trim(),
          phone: phone.trim(), email: email.trim(),
          id_number: idNumber.trim(), birthday: birthday || null,
          gender, address: address.trim(),
          passport: passport.trim(), passport_expiry: passportExpiry || null,
          taibao_number: requiresTaibao ? taibaoNumber.trim() : "",
          taibao_expiry: requiresTaibao ? (taibaoExpiry || null) : null,
          emergency_contact: emergencyContact.trim(),
          emergency_phone:   emergencyPhone.trim(),
          meal_preference:   selectedMeals.join(","),
          notes: notes.trim(),
          participant_type: participantType,
          roommate_name:    roommateName.trim(),
          single_room:      String(singleRoom),
          passport_image:   passportImage,
          taibao_image:     requiresTaibao ? taibaoImage : "",
        }),
      });
      const json = await res.json();
      if (json.success) setStep("success");
      else setErrMsg(json.error || "提交失敗，請再試一次");
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
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center text-lg shadow">🎉</div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">報名成功！</h1>
            <p className="text-slate-500 mt-2 text-sm leading-relaxed">
              您的報名資料已收到，<br />旅行社夥伴將與您確認詳細行程
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-emerald-100 text-left space-y-2">
            <p className="text-sm font-semibold text-slate-700">📋 行程資訊</p>
            <p className="text-sm text-slate-600"><span className="font-medium">行程名稱：</span>{tour.name}</p>
            <p className="text-sm text-slate-600"><span className="font-medium">目的地：</span>{tour.destination}</p>
            <p className="text-sm text-slate-600"><span className="font-medium">出發日期：</span>{fmtDate(tour.start_date)}</p>
            {(roommateName.trim() || singleRoom) && (
              <div className="pt-1.5 border-t border-emerald-50">
                {singleRoom && (
                  <p className="text-sm text-slate-600"><span className="font-medium">分房需求：</span>單人房（旅行社將另行確認）</p>
                )}
                {!singleRoom && roommateName.trim() && (
                  <p className="text-sm text-slate-600"><span className="font-medium">同住旅伴：</span>{roommateName.trim()}（已送出配房請求）</p>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400">如有任何疑問，請洽暖心旅行社</p>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50">

      {/* ── Hero Banner ── */}
      <div className="relative overflow-hidden text-white" style={{ minHeight: 240 }}>
        {/* 背景：真實景點圖或漸層 */}
        {heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImageUrl}
            alt={tour.destination}
            onLoad={() => setImgLoaded(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
          />
        )}
        {/* 漸層底色 / overlay */}
        <div className={`absolute inset-0 transition-opacity duration-700 ${
          heroImageUrl && imgLoaded
            ? "bg-gradient-to-b from-black/45 via-black/55 to-black/75"
            : "bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700"
        }`} />
        {/* 裝飾圓（無圖時顯示） */}
        {(!heroImageUrl || !imgLoaded) && (
          <>
            <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/5 rounded-full" />
            <div className="absolute -bottom-20 -left-10 w-80 h-80 bg-white/5 rounded-full" />
          </>
        )}

        <div className="relative max-w-2xl mx-auto px-6 py-10">
          <div className="flex items-center gap-2 mb-6 opacity-80">
            <Globe className="w-4 h-4" />
            <span className="text-xs font-medium tracking-wider uppercase">暖心旅行社 · 線上報名</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-1 drop-shadow-sm">
            {tour.name}
          </h1>
          <p className="text-blue-100 text-base mb-5 drop-shadow-sm">{tour.destination}</p>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur rounded-full px-4 py-1.5 text-sm">
              <CalendarDays className="w-4 h-4 opacity-80" />
              <span>{fmtDate(tour.start_date)}</span>
            </div>
            {tour.end_date && (
              <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur rounded-full px-4 py-1.5 text-sm">
                <CalendarDays className="w-4 h-4 opacity-80" />
                <span>→ {fmtDate(tour.end_date)}</span>
              </div>
            )}
            {nights > 0 && (
              <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur rounded-full px-4 py-1.5 text-sm">
                🌙 {nights} 晚 {nights + 1} 天
              </div>
            )}
            {tour.pax > 0 && (
              <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur rounded-full px-4 py-1.5 text-sm">
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
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${showItin ? "rotate-180" : ""}`} />
            </button>
            {showItin && (
              <div className="border-t border-slate-100">
                <iframe src={toEmbedUrl(itin.doc_url)} className="w-full" style={{ height: 520, border: "none" }} title="旅客行程" />
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
              <input className={inp} placeholder="請填寫與證件相同的姓名"
                value={name} onChange={e => setName(e.target.value)} />
            </Field>
            <Field label="英文姓名（護照拼音）" required>
              <input className={inp + " tracking-wider"} placeholder="如：CHEN MING"
                value={nameEn} onChange={e => setNameEn(e.target.value.toUpperCase())} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="性別">
              <select className={inp} value={gender} onChange={e => setGender(e.target.value)}>
                <option value="female">女</option>
                <option value="male">男</option>
                <option value="other">其他</option>
              </select>
            </Field>
            <Field label="出生日期">
              <input type="date" className={inp} value={birthday} onChange={e => setBirthday(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="聯絡電話" required>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input className={inp + " pl-9"} placeholder="0912-345-678"
                  value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            </Field>
            <Field label="Email">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input type="email" className={inp + " pl-9"} placeholder="example@mail.com"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </Field>
          </div>
          <Field label="身分證號碼">
            <input className={inp + " tracking-widest"} placeholder="A123456789"
              value={idNumber} onChange={e => setIdNumber(e.target.value.toUpperCase())} />
          </Field>
          <Field label="聯絡地址">
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-300" />
              <input className={inp + " pl-9"} placeholder="台北市中正區…"
                value={address} onChange={e => setAddress(e.target.value)} />
            </div>
          </Field>
          <Field label="參團身份">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { k: "adult",     l: "成人",   e: "👤" },
                { k: "tour_only", l: "只參團", e: "🧳" },
                { k: "child",     l: "兒童",   e: "🧒" },
                { k: "infant",    l: "嬰兒",   e: "👶" },
              ] as const).map(({ k, l, e }) => (
                <button key={k} type="button" onClick={() => setParticipantType(k)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    participantType === k
                      ? "bg-blue-50 border-blue-400 text-blue-700 shadow-sm"
                      : "border-slate-200 text-slate-500 hover:border-blue-200"
                  }`}>
                  <span>{e}</span> {l}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* 2. 旅行證件 */}
        <Section icon={<Globe className="w-5 h-5" />} title="旅行證件" color="purple">
          {/* 護照 */}
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">護照資訊</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="護照號碼">
              <input className={inp + " tracking-widest"} placeholder="A12345678"
                value={passport} onChange={e => setPassport(e.target.value.toUpperCase())} />
            </Field>
            <Field label="護照效期">
              <input type="date" className={inp} value={passportExpiry}
                onChange={e => setPassportExpiry(e.target.value)} />
            </Field>
          </div>

          {/* 台胞證（條件顯示） */}
          {requiresTaibao ? (
            <>
              <div className="flex items-start gap-2.5 p-3 bg-orange-50 rounded-xl text-xs text-orange-600 border border-orange-100">
                <span className="text-base leading-tight">🇨🇳</span>
                <span>此行程目的地需要<strong>台胞證</strong>，請填寫台胞證資訊並上傳照片</span>
              </div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">台胞證資訊</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="台胞證號碼">
                  <input className={inp + " tracking-widest"} placeholder="TA1234567"
                    value={taibaoNumber} onChange={e => setTaibaoNumber(e.target.value.toUpperCase())} />
                </Field>
                <Field label="台胞證效期">
                  <input type="date" className={inp} value={taibaoExpiry}
                    onChange={e => setTaibaoExpiry(e.target.value)} />
                </Field>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2.5 p-3 bg-emerald-50 rounded-xl text-xs text-emerald-600 border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>此行程目的地<strong>不需要台胞證</strong>，填寫護照資訊即可</span>
            </div>
          )}
        </Section>

        {/* 3. 緊急聯絡人 */}
        <Section icon={<Heart className="w-5 h-5" />} title="緊急聯絡人" color="rose">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="緊急聯絡人姓名">
              <input className={inp} placeholder="姓名"
                value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)} />
            </Field>
            <Field label="緊急聯絡人電話">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input className={inp + " pl-9"} placeholder="0912-000-000"
                  value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} />
              </div>
            </Field>
          </div>
        </Section>

        {/* 4. 分房設定 */}
        <Section icon={<BedDouble className="w-5 h-5" />} title="分房設定" color="teal">
          <div className="p-3 bg-teal-50 rounded-xl text-xs text-teal-600 flex items-start gap-2 border border-teal-100">
            <BedDouble className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              若希望與特定旅伴同房，請填寫對方的<strong>中文姓名</strong>。
              雙方都填彼此姓名時，系統自動配同一房間。
              旅伴尚未報名時，旅行社將收到您的偏好並手動配置。
            </span>
          </div>

          {/* 需要單人房 */}
          <label className="flex items-center gap-3 cursor-pointer select-none group">
            <div className="relative flex-shrink-0">
              <input type="checkbox" className="sr-only peer" checked={singleRoom}
                onChange={e => { setSingleRoom(e.target.checked); if (e.target.checked) setRoommateName(""); }} />
              <div className="w-11 h-6 rounded-full bg-slate-200 peer-checked:bg-teal-500 transition-colors" />
              <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">我需要單人房</p>
              <p className="text-xs text-slate-400">旅行社將另行確認房型費用差額</p>
            </div>
          </label>

          {!singleRoom && (
            <Field label="同住旅伴姓名（選填）">
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input className={inp + " pl-9"} placeholder="請輸入希望同房旅伴的中文姓名"
                  value={roommateName} onChange={e => setRoommateName(e.target.value)} />
              </div>
              {roommateName.trim() && (
                <p className="text-xs text-teal-600 mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  系統將嘗試自動配房給您與「{roommateName.trim()}」
                </p>
              )}
            </Field>
          )}
        </Section>

        {/* 5. 餐食偏好 */}
        <Section icon={<Utensils className="w-5 h-5" />} title="餐食偏好" color="amber">
          <p className="text-xs text-slate-400">請選擇所有適用的選項</p>
          <div className="flex flex-wrap gap-2">
            {MEAL_OPTS.map(m => (
              <button key={m} type="button" onClick={() => toggleMeal(m)}
                className={`px-4 py-2 rounded-full text-sm border font-medium transition-all ${
                  selectedMeals.includes(m)
                    ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                    : "border-slate-200 text-slate-500 hover:border-amber-300"
                }`}>
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

        {/* 6. 證件照片上傳 */}
        <Section icon={<Camera className="w-5 h-5" />} title="證件照片上傳" color="purple">
          <div className="p-3 bg-purple-50 rounded-xl text-xs text-purple-600 flex items-start gap-2 border border-purple-100">
            <ImageIcon className="w-4 h-4 mt-0.5 shrink-0" />
            <span>上傳清晰的證件照片，有助於旅行社協助您快速完成出票手續。照片僅供本次行程使用，不會對外揭露。</span>
          </div>
          <div className={`grid gap-5 ${requiresTaibao ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-1 max-w-xs"}`}>
            <PhotoUpload
              label="護照資料頁"
              icon={<Globe className="w-3.5 h-3.5" />}
              value={passportImage}
              onChange={setPassportImage}
            />
            {requiresTaibao && (
              <PhotoUpload
                label="台胞證"
                icon={<FileText className="w-3.5 h-3.5" />}
                value={taibaoImage}
                onChange={setTaibaoImage}
              />
            )}
          </div>
        </Section>

        {/* 7. 備註 */}
        <Section icon={<FileText className="w-5 h-5" />} title="其他備註" color="emerald">
          <Field label="備註說明">
            <textarea className={inp + " resize-none"} rows={3}
              placeholder="如有任何特殊需求或補充說明，請填寫於此…"
              value={notes} onChange={e => setNotes(e.target.value)} />
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
        <button type="submit" disabled={submitting}
          className="w-full py-4 rounded-2xl font-semibold text-base bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-200 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2">
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
