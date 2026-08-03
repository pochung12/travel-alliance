"use client";
import { useEffect, useState } from "react";
import { supabase, Customer, CustomerTour } from "@/lib/supabase";
import {
  X, Save, Loader2, ExternalLink, User, ScanLine, Plane, CreditCard,
  UtensilsCrossed, BedDouble, Phone, CheckCircle2, Copy, Check,
} from "lucide-react";

type Part = CustomerTour & { customer: Customer };

const MEAL_OPTIONS = ["蛋奶素", "全素", "不吃羊", "不吃牛", "不吃豬"];

interface Props {
  part: Part | null;
  onClose: () => void;
  onSaved: () => void;
  onViewImage: (src: string, title: string) => void;
}

// 效期是否即將到期（6 個月內）／已過期
function expiryState(d?: string | null): "none" | "ok" | "soon" | "expired" {
  if (!d) return "none";
  const t = new Date(d).getTime();
  if (isNaN(t)) return "none";
  const days = (t - Date.now()) / 86400000;
  return days < 0 ? "expired" : days < 180 ? "soon" : "ok";
}

/** 英文姓名清理：逗號換空白、拿掉連字號（訂票網頁通常不接受標點）*/
export function cleanNameEn(s?: string | null): string {
  return (s || "").replace(/,/g, " ").replace(/-/g, "").replace(/\s+/g, " ").trim();
}

/** 一鍵複製小圖示（給訂票網頁貼上用）*/
function CopyBtn({ value, title, clean }: { value?: string | null; title: string; clean?: (s?: string | null) => string }) {
  const [ok, setOk] = useState(false);
  const v = clean ? clean(value) : (value || "").trim();
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
    } catch {
      // 舊瀏覽器 / 非安全環境退回 execCommand
      const ta = document.createElement("textarea");
      ta.value = v;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setOk(true);
    setTimeout(() => setOk(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      disabled={!v}
      title={v ? `複製${title}：${v}` : `${title}（沒有資料）`}
      className={`shrink-0 p-0.5 rounded transition-colors ${
        !v ? "text-slate-200 dark:text-slate-600 cursor-not-allowed"
        : ok ? "text-emerald-500"
        : "text-slate-300 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400"
      }`}
    >
      {ok ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function ParticipantDetailModal({ part, onClose, onSaved, onViewImage }: Props) {
  const [form, setForm]   = useState<Partial<Customer>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    if (part) { setForm(part.customer); setSaved(false); }
  }, [part]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (part) window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [part, onClose]);

  if (!part) return null;
  const c = part.customer;

  const save = async () => {
    if (!form.name?.trim()) { alert("請填寫姓名"); return; }
    setSaving(true);
    const patch = {
      name: form.name, name_en: form.name_en || "", phone: form.phone || "", email: form.email || "",
      id_number: form.id_number || "", passport: form.passport || "", taibao_number: form.taibao_number || "",
      birthday: form.birthday || null,
      passport_expiry: form.passport_expiry || null,
      taibao_expiry: form.taibao_expiry || null,
      gender: form.gender || "other",
      address: form.address || "", emergency_contact: form.emergency_contact || "",
      emergency_phone: form.emergency_phone || "", notes: form.notes || "",
      meal_preference: form.meal_preference || "",
    };
    const { error } = await supabase.from("customers").update(patch).eq("id", c.id);
    setSaving(false);
    if (error) { alert("儲存失敗：" + error.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
  };

  const toggleMeal = (m: string) => {
    const cur = (form.meal_preference || "").split(",").map(s => s.trim()).filter(Boolean);
    const next = cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m];
    setForm(f => ({ ...f, meal_preference: next.join(",") }));
  };

  const inp = "w-full border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400";
  const lbl = "block text-[11px] font-medium text-slate-400 mb-0.5";
  const lblRow = "flex items-center justify-between gap-1 text-[11px] font-medium text-slate-400 mb-0.5";

  const docs = [
    { key: "passport", label: "護照",   num: c.passport,      exp: c.passport_expiry, img: c.passport_image },
    { key: "taibao",   label: "台胞證", num: c.taibao_number, exp: c.taibao_expiry,   img: c.taibao_image },
    { key: "idcard",   label: "身分證", num: c.id_number,     exp: null,              img: c.id_card_image },
  ].filter(d => d.num || d.img);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <User className="w-4.5 h-4.5 text-blue-600 dark:text-blue-300" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate">{c.name}</h3>
              {c.name_en && <p className="text-[11px] text-slate-400 truncate">{c.name_en}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a href={`/admin/crm/${c.id}`} target="_blank" rel="noopener noreferrer"
              title="在新分頁開啟完整 CRM 資料"
              className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 rounded-lg transition-colors">
              CRM <ExternalLink className="w-3 h-3" />
            </a>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 本團資訊（唯讀摘要）*/}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-slate-400 flex items-center gap-1 mb-0.5"><BedDouble className="w-3 h-3" /> 房號</div>
              <div className="font-semibold text-slate-700 dark:text-slate-200">{part.room_number || "—"}</div>
            </div>
            <div>
              <div className="text-slate-400 flex items-center gap-1 mb-0.5"><CreditCard className="w-3 h-3" /> 訂金 / 尾款</div>
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                {(part.deposit_amount || 0).toLocaleString()} / {(part.balance_amount || 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-slate-400 flex items-center gap-1 mb-0.5"><User className="w-3 h-3" /> 身份</div>
              <div className="font-semibold text-slate-700 dark:text-slate-200">{part.participant_type || "adult"}</div>
            </div>
            <div>
              <div className="text-slate-400 flex items-center gap-1 mb-0.5"><Plane className="w-3 h-3" /> 已訂票</div>
              <div className="font-semibold text-slate-700 dark:text-slate-200">{part.ticket_booked ? "✅ 已訂" : "—"}</div>
            </div>
          </div>

          {/* 證件（含照片）*/}
          {docs.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <ScanLine className="w-3.5 h-3.5" /> 證件資料
              </div>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {docs.map(d => {
                  const st = expiryState(d.exp);
                  return (
                    <div key={d.key} className="rounded-xl border border-slate-200 dark:border-slate-600 p-2.5 flex gap-2.5">
                      {d.img ? (
                        <button onClick={() => onViewImage(d.img!, `${c.name} — ${d.label}`)}
                          className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 shrink-0 hover:ring-2 hover:ring-blue-400 transition-all">
                          <img src={d.img} alt={d.label} className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] text-slate-400 shrink-0">無照片</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-slate-400">{d.label}</div>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{d.num || "—"}</span>
                          <CopyBtn value={d.num} title={`${d.label}號碼`} />
                        </div>
                        {d.exp && (
                          <div className={`text-[11px] mt-0.5 flex items-center gap-1 ${
                            st === "expired" ? "text-red-500 font-semibold"
                            : st === "soon" ? "text-orange-500 font-semibold" : "text-slate-400"}`}>
                            <span className="truncate">效期 {d.exp}{st === "expired" ? "（已過期）" : st === "soon" ? "（半年內到期）" : ""}</span>
                            <CopyBtn value={d.exp} title={`${d.label}效期`} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 可編輯欄位 */}
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">基本資料（可直接修改）</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div><label className={lbl}>中文姓名 *</label><input className={inp} value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div>
                <div className={lblRow}><span>英文姓名</span><CopyBtn value={form.name_en} title="英文姓名" clean={cleanNameEn} /></div>
                <input className={inp} value={form.name_en || ""} onChange={e => setForm(f => ({ ...f, name_en: e.target.value }))} />
              </div>
              <div>
                <div className={lblRow}><span>生日</span><CopyBtn value={form.birthday} title="生日" /></div>
                <input className={inp} value={form.birthday || ""} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} placeholder="YYYY-MM-DD" />
              </div>
              <div><label className={lbl}>電話</label><input className={inp} value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><label className={lbl}>Email</label><input className={inp} value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div>
                <label className={lbl}>性別</label>
                <select className={inp} value={form.gender || "other"} onChange={e => setForm(f => ({ ...f, gender: e.target.value as Customer["gender"] }))}>
                  <option value="male">男</option><option value="female">女</option><option value="other">其他</option>
                </select>
              </div>
              <div><label className={lbl}>身分證字號</label><input className={inp} value={form.id_number || ""} onChange={e => setForm(f => ({ ...f, id_number: e.target.value }))} /></div>
              <div>
                <div className={lblRow}><span>護照號碼</span><CopyBtn value={form.passport} title="護照號碼" /></div>
                <input className={inp} value={form.passport || ""} onChange={e => setForm(f => ({ ...f, passport: e.target.value }))} />
              </div>
              <div>
                <div className={lblRow}><span>護照效期</span><CopyBtn value={form.passport_expiry} title="護照效期" /></div>
                <input className={inp} value={form.passport_expiry || ""} onChange={e => setForm(f => ({ ...f, passport_expiry: e.target.value }))} placeholder="YYYY-MM-DD" />
              </div>
              <div>
                <div className={lblRow}><span>台胞證號碼</span><CopyBtn value={form.taibao_number} title="台胞證號碼" /></div>
                <input className={inp} value={form.taibao_number || ""} onChange={e => setForm(f => ({ ...f, taibao_number: e.target.value }))} />
              </div>
              <div>
                <div className={lblRow}><span>台胞證效期</span><CopyBtn value={form.taibao_expiry} title="台胞證效期" /></div>
                <input className={inp} value={form.taibao_expiry || ""} onChange={e => setForm(f => ({ ...f, taibao_expiry: e.target.value }))} placeholder="YYYY-MM-DD" />
              </div>
              <div className="col-span-2 sm:col-span-3"><label className={lbl}>地址</label><input className={inp} value={form.address || ""} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            </div>
          </div>

          {/* 緊急聯絡 */}
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> 緊急聯絡
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div><label className={lbl}>聯絡人</label><input className={inp} value={form.emergency_contact || ""} onChange={e => setForm(f => ({ ...f, emergency_contact: e.target.value }))} /></div>
              <div><label className={lbl}>電話</label><input className={inp} value={form.emergency_phone || ""} onChange={e => setForm(f => ({ ...f, emergency_phone: e.target.value }))} /></div>
            </div>
          </div>

          {/* 餐食偏好 */}
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
              <UtensilsCrossed className="w-3.5 h-3.5" /> 餐食偏好
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MEAL_OPTIONS.map(m => {
                const on = (form.meal_preference || "").split(",").map(s => s.trim()).includes(m);
                return (
                  <button key={m} onClick={() => toggleMeal(m)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                      on ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"}`}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 備註 */}
          <div>
            <label className={lbl}>備註</label>
            <textarea className={inp + " h-20 resize-none"} value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-400">
            {saved ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> 已儲存</span> : "修改後請按儲存"}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">關閉</button>
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 儲存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
