"use client";
import { useEffect, useState } from "react";
import { supabase, Customer } from "@/lib/supabase";
import { Plus, Search, Users } from "lucide-react";
import Link from "next/link";

const EMPTY: Omit<Customer, "id"|"created_at"> = {
  name:"", phone:"", email:"", id_number:"", passport:"",
  birthday:"", gender:"other", address:"", emergency_contact:"",
  emergency_phone:"", notes:"",
};
const input = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";

export default function CRMPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch]       = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState({...EMPTY});
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);

  const load = async () => {
    const { data } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
    setCustomers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = customers.filter(c =>
    c.name.includes(search) || c.phone.includes(search) || c.email.includes(search)
  );

  const handleCreate = async () => {
    if (!form.name.trim()) return alert("請填寫姓名");
    setSaving(true);
    const { error } = await supabase.from("customers").insert([form]);
    setSaving(false);
    if (error) { alert("建立失敗：" + error.message); return; }
    setShowModal(false);
    setForm({...EMPTY});
    load();
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Users className="w-6 h-6 text-violet-600" /> 旅客 CRM
        </h1>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> 新增旅客
        </button>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="搜尋姓名、電話、Email…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            {search ? "沒有符合的旅客" : "尚無旅客，點右上角新增"}
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
                    <Link href={"/admin/crm/" + c.id} className="font-medium text-violet-600 hover:underline">
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

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-slate-800">新增旅客</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Field label="姓名 *">
                    <input className={input} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="真實姓名" />
                  </Field>
                </div>
                <Field label="性別">
                  <select className={input} value={form.gender} onChange={e => setForm({...form, gender: e.target.value as Customer["gender"]})}>
                    <option value="male">男</option>
                    <option value="female">女</option>
                    <option value="other">其他</option>
                  </select>
                </Field>
                <Field label="生日">
                  <input type="date" className={input} value={form.birthday} onChange={e => setForm({...form, birthday: e.target.value})} />
                </Field>
                <Field label="電話">
                  <input className={input} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="09xx-xxx-xxx" />
                </Field>
                <Field label="Email">
                  <input type="email" className={input} value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                </Field>
                <Field label="身分證字號">
                  <input className={input} value={form.id_number} onChange={e => setForm({...form, id_number: e.target.value})} placeholder="A123456789" />
                </Field>
                <Field label="護照號碼">
                  <input className={input} value={form.passport} onChange={e => setForm({...form, passport: e.target.value})} placeholder="A12345678" />
                </Field>
                <div className="col-span-2">
                  <Field label="地址">
                    <input className={input} value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
                  </Field>
                </div>
                <Field label="緊急聯絡人">
                  <input className={input} value={form.emergency_contact} onChange={e => setForm({...form, emergency_contact: e.target.value})} placeholder="姓名" />
                </Field>
                <Field label="緊急聯絡電話">
                  <input className={input} value={form.emergency_phone} onChange={e => setForm({...form, emergency_phone: e.target.value})} />
                </Field>
                <div className="col-span-2">
                  <Field label="備註">
                    <textarea className={input + " h-16 resize-none"} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
                  </Field>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              <button onClick={handleCreate} disabled={saving}
                className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50">
                {saving ? "建立中…" : "建立"}
              </button>
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
