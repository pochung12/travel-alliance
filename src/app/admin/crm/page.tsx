"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Customer } from "@/lib/supabase";
import {
  Plus, Search, Users, ScanLine, Upload,
  Loader2, CheckCircle, AlertCircle, X,
} from "lucide-react";
import Link from "next/link";

// ─── types ───────────────────────────────────────────────────────────────────
type DocType = "passport" | "taibao" | "idCard";
type ScanStatus = "idle" | "scanning" | "done" | "error";

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

// ─── helpers ─────────────────────────────────────────────────────────────────
async function compressImage(file: File, maxPx = 1200, quality = 0.88): Promise<string> {
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

// ─── constants ───────────────────────────────────────────────────────────────
const EMPTY: Omit<Customer, "id" | "created_at"> = {
  name: "", name_en: "", phone: "", email: "",
  id_number: "", passport: "", passport_expiry: "", passport_image: "",
  taibao_number: "", taibao_expiry: "", taibao_image: "",
  birthday: "", gender: "other",
  address: "", emergency_contact: "", emergency_phone: "", notes: "",
};

const input = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
const lbl   = "block text-xs font-medium text-slate-500 mb-1";

// ─── component ───────────────────────────────────────────────────────────────
export default function CRMPage() {
  const router = useRouter();

  // list state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(true);

  // manual-create modal
  const [showModal, setShowModal] = useState(false);
  const [form,      setForm]      = useState({ ...EMPTY });
  const [saving,    setSaving]    = useState(false);

  // scan-to-create modal
  const [showScan,    setShowScan]    = useState(false);
  const [docType,     setDocType]     = useState<DocType>("passport");
  const [scanImg,     setScanImg]     = useState<string>("");   // base64 preview
  const [scanStatus,  setScanStatus]  = useState<ScanStatus>("idle");
  const [scanError,   setScanError]   = useState("");
  const [ocrResult,   setOcrResult]   = useState<OcrResult | null>(null);
  const [scanForm,    setScanForm]    = useState({ ...EMPTY });
  const [duplicates,  setDuplicates]  = useState<Customer[]>([]);
  const [creating,    setCreating]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── load ──────────────────────────────────────────────────────────────────
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

  // ── manual create ─────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.name.trim()) return alert("請填寫姓名");
    setSaving(true);
    const payload = { ...form, birthday: form.birthday || null, passport_expiry: form.passport_expiry || null, taibao_expiry: form.taibao_expiry || null };
    const { error } = await supabase.from("customers").insert([payload]);
    setSaving(false);
    if (error) { alert("建立失敗：" + error.message); return; }
    setShowModal(false);
    setForm({ ...EMPTY });
    load();
  };

  // ── scan: image selected ──────────────────────────────────────────────────
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

      // build pre-filled form
      const preForm: typeof EMPTY = { ...EMPTY };
      preForm.name            = json.name           ?? "";
      preForm.name_en         = json.nameEn          ?? "";
      preForm.birthday        = json.birthday        ?? "";
      preForm.gender          = (json.gender as Customer["gender"]) ?? "other";

      if (docType === "passport") {
        preForm.passport         = json.passport        ?? "";
        preForm.passport_expiry  = json.passportExpiry  ?? "";
        preForm.passport_image   = b64;
      } else if (docType === "taibao") {
        preForm.taibao_number    = json.taibaoNumber    ?? "";
        preForm.taibao_expiry    = json.taibaoExpiry    ?? "";
        preForm.taibao_image     = b64;
      } else {
        preForm.id_number        = json.idNumber        ?? "";
        preForm.id_card_image    = b64;
      }

      setScanForm(preForm);

      // check duplicates by name
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

  // drag & drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // ── scan: create customer ─────────────────────────────────────────────────
  const handleScanCreate = async () => {
    if (!scanForm.name.trim()) return alert("請確認姓名欄位");
    setCreating(true);
    const payload = { ...scanForm, birthday: scanForm.birthday || null, passport_expiry: scanForm.passport_expiry || null, taibao_expiry: scanForm.taibao_expiry || null };
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
      if (scanForm.passport)        updates.passport        = scanForm.passport;
      if (scanForm.passport_expiry) updates.passport_expiry = scanForm.passport_expiry || null;
      if (scanForm.passport_image)  updates.passport_image  = scanForm.passport_image;
    } else if (docType === "taibao") {
      if (scanForm.taibao_number)   updates.taibao_number   = scanForm.taibao_number;
      if (scanForm.taibao_expiry)   updates.taibao_expiry   = scanForm.taibao_expiry || null;
      if (scanForm.taibao_image)    updates.taibao_image    = scanForm.taibao_image;
    } else {
      if (scanForm.id_number)       updates.id_number       = scanForm.id_number;
      if (scanForm.id_card_image)   updates.id_card_image   = scanForm.id_card_image;
    }
    if (scanForm.name_en)  updates.name_en  = scanForm.name_en;
    if (scanForm.birthday) updates.birthday = scanForm.birthday || null;
    await supabase.from("customers").update(updates).eq("id", existingId);
    setCreating(false);
    closeScan();
    router.push(`/admin/crm/${existingId}`);
  };

  const closeScan = () => {
    setShowScan(false);
    setScanImg("");
    setScanStatus("idle");
    setScanError("");
    setOcrResult(null);
    setScanForm({ ...EMPTY });
    setDuplicates([]);
    setDocType("passport");
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">
      {/* header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Users className="w-6 h-6 text-violet-600" /> 旅客 CRM
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setShowScan(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <ScanLine className="w-4 h-4" /> 掃描證件建檔
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> 新增旅客
          </button>
        </div>
      </div>

      {/* search */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="搜尋姓名、電話、Email…"
          value={search} onChange={e => setSearch(e.target.value)}
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
            {search ? "沒有符合的旗客" : "尚無旅客，點右上角新增或掃描證件"}
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
                    <input className={input} value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })} placeholder="真實姓名" />
                  </Field>
                </div>
                <Field label="性別">
                  <select className={input} value={form.gender}
                    onChange={e => setForm({ ...form, gender: e.target.value as Customer["gender"] })}>
                    <option value="male">男</option>
                    <option value="female">女</option>
                    <option value="other">其他</option>
                  </select>
                </Field>
                <Field label="生日">
                  <input type="date" className={input} value={form.birthday}
                    onChange={e => setForm({ ...form, birthday: e.target.value })} />
                </Field>
                <Field label="電話">
                  <input className={input} value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="09xx-xxx-xxx" />
                </Field>
                <Field label="Email">
                  <input type="email" className={input} value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label="身分證字號">
                  <input className={input} value={form.id_number}
                    onChange={e => setForm({ ...form, id_number: e.target.value })} placeholder="A123456789" />
                </Field>
                <Field label="護照號碼">
                  <input className={input} value={form.passport}
                    onChange={e => setForm({ ...form, passport: e.target.value })} placeholder="A12345678" />
                </Field>
                <div className="col-span-2">
                  <Field label="地址">
                    <input className={input} value={form.address}
                      onChange={e => setForm({ ...form, address: e.target.value })} />
                  </Field>
                </div>
                <Field label="緊急聯絡人">
                  <input className={input} value={form.emergency_contact}
                    onChange={e => setForm({ ...form, emergency_contact: e.target.value })} placeholder="姓名" />
                </Field>
                <Field label="緊急聯絡電話">
                  <input className={input} value={form.emergency_phone}
                    onChange={e => setForm({ ...form, emergency_phone: e.target.value })} />
                </Field>
                <div className="col-span-2">
                  <Field label="備註">
                    <textarea className={input + " h-16 resize-none"} value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })} />
                  </Field>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              <button onClick={handleCreate} disabled={saving}
                className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50">
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
                <ScanLine className="w-5 h-5 text-emerald-600" /> 掃描證件快速建檔
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
                  {([ ["passport","🛂 護照"],["idCard","🪪 身分證"],["taibao","🏮 台胞證"] ] as [DocType, string][]).map(([v, label]) => (
                    <button key={v}
                      onClick={() => { setDocType(v); setScanStatus("idle"); setScanImg(""); setOcrResult(null); }}
                      className={`flex-1 py-2 text-sm rounded-lg border transition-colors font-medium ${
                        docType === v
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "text-slate-600 border-slate-200 hover:border-emerald-400"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* upload zone */}
              <div>
                <label className={lbl}>上傳證件照片</label>
                <input
                  ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
                <div
                  onClick={() => fileRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={e => e.preventDefault()}
                  className={`relative border-2 border-dashed rounded-xl cursor-pointer transition-colors
                    ${scanStatus === "scanning"
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30"
                    }`}
                >
                  {scanImg ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={scanImg} alt="證件預覽"
                        className="w-full max-h-52 object-contain rounded-xl" />
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

                {/* OCR status messages */}
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

              {/* OCR result form — only shown after successful scan */}
              {scanStatus === "done" && (
                <>
                  {/* duplicate warning with merge option */}
                  {duplicates.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                      <p className="font-semibold mb-2">⚠️ 資料庫中已有疑似相同旅客，本否要合併證件資料？</p>
                      {duplicates.map(d => (
                        <div key={d.id} className="flex items-center justify-between py-2 border-b border-amber-100 last:border-0">
                          <div className="flex items-center gap-2">
                            <Link href={`/admin/crm/${d.id}`} target="_blank"
                              className="text-violet-600 hover:underline font-medium">
                              {d.name}
                            </Link>
                            <span className="text-amber-700 text-xs">{d.phone} · {d.birthday}</span>
                          </div>
                          <button
                            onClick={() => handleMerge(d.id)}
                            disabled={creating}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                          >
                            {creating && <Loader2 className="w-3 h-3 animate-spin" />}
                            合併到此旅客
                          </button>
                        </div>
                      ))}
                      <p className="mt-2 text-amber-600 text-xs">若確認本全新旅客，請忽略提示並點「建立旅客」。</p>
                    </div>
                  )}

                  {/* editable fields */}
                  <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">辨識結果（可編輯）</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className={lbl}>中文姓名 *</label>
                        <input className={input} value={scanForm.name}
                          onChange={e => setScanForm({ ...scanForm, name: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <label className={lbl}>英文拼音姓名</label>
                        <input className={input} value={scanForm.name_en}
                          onChange={e => setScanForm({ ...scanForm, name_en: e.target.value })} />
                      </div>
                      <div>
                        <label className={lbl}>性別</label>
                        <select className={input} value={scanForm.gender}
                          onChange={e => setScanForm({ ...scanForm, gender: e.target.value as Customer["gender"] })}>
                          <option value="male">男</option>
                          <option value="female">女</option>
                          <option value="other">其他</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>生日</label>
                        <input type="date" className={input} value={scanForm.birthday}
                          onChange={e => setScanForm({ ...scanForm, birthday: e.target.value })} />
                      </div>

                      {docType === "passport" ? (<>
                        <div>
                          <label className={lbl}>護照號碼</label>
                          <input className={input} value={scanForm.passport}
                            onChange={e => setScanForm({ ...scanForm, passport: e.target.value })} />
                        </div>
                        <div>
                          <label className={lbl}>護照效期</label>
                          <input type="date" className={input} value={scanForm.passport_expiry}
                            onChange={e => setScanForm({ ...scanForm, passport_expiry: e.target.value })} />
                        </div>
                      </>) : docType === "taibao" ? (<>
                        <div>
                          <label className={lbl}>台胞證號碼</label>
                          <input className={input} value={scanForm.taibao_number}
                            onChange={e => setScanForm({ ...scanForm, taibao_number: e.target.value })} />
                        </div>
                        <div>
                          <label className={lbl}>台胞證效期</label>
                          <input type="date" className={input} value={scanForm.taibao_expiry}
                            onChange={e => setScanForm({ ...scanForm, taibao_expiry: e.target.value })} />
                        </div>
                      </>) : (<>
                        <div className="col-span-2">
                          <label className={lbl}>身分證字號</label>
                          <input className={input} value={scanForm.id_number}
                            onChange={e => setScanForm({ ...scanForm, id_number: e.target.value })} placeholder="A123456789" />
                        </div>
                      </>)}

                      <div>
                        <label className={lbl}>電話（可補填）</label>
                        <input className={input} value={scanForm.phone}
                          onChange={e => setScanForm({ ...scanForm, phone: e.target.value })} placeholder="09xx-xxx-xxx" />
                      </div>
                      <div>
                        <label className={lbl}>Email（可補填）</label>
                        <input type="email" className={input} value={scanForm.email}
                          onChange={e => setScanForm({ ...scanForm, email: e.target.value })} />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* footer */}
            <div className="px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white flex items-center justify-between gap-3">
              <button
                onClick={() => { setScanStatus("idle"); setScanImg(""); setOcrResult(null); setDuplicates([]); }}
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
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
