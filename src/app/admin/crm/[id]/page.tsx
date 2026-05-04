"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, Customer, Tour } from "@/lib/supabase";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
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

export default function CustomerDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm]         = useState<Partial<Customer>>({});
  const [tours, setTours]       = useState<(Tour & { paid_amount: number })[]>([]);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("customers").select("*").eq("id", id).single();
      if (!data) { router.push("/admin/crm"); return; }
      setCustomer(data);
      setForm(data);

      // Load tour history
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

  const save = async () => {
    setSaving(true);
    await supabase.from("customers").update({
      name: form.name, phone: form.phone, email: form.email,
      id_number: form.id_number, passport: form.passport,
      birthday: form.birthday, gender: form.gender,
      address: form.address, emergency_contact: form.emergency_contact,
      emergency_phone: form.emergency_phone, notes: form.notes,
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

  if (!customer) return (
    <div className="flex justify-center items-center h-64">
      <div className="w-6 h-6 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const totalPaid  = tours.reduce((s, t) => s + (t.paid_amount || 0), 0);
  const toursDone  = tours.filter(t => t.status === "completed").length;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
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

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Edit form */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-slate-700 text-sm">基本資料</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={lbl}>姓名 *</label>
              <input className={input} value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>性別</label>
              <select className={input} value={form.gender || "other"} onChange={e => setForm({...form, gender: e.target.value as Customer["gender"]})}>
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <label className={lbl}>生日</label>
              <input type="date" className={input} value={form.birthday || ""} onChange={e => setForm({...form, birthday: e.target.value})} />
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
              <input className={input} value={form.id_number || ""} onChange={e => setForm({...form, id_number: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>護照號碼</label>
              <input className={input} value={form.passport || ""} onChange={e => setForm({...form, passport: e.target.value})} />
            </div>
            <div className="col-span-2">
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
              <textarea className={input + " h-16 resize-none"} value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? "儲存中…" : "儲存"}
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
    </div>
  );
}
