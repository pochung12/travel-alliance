"use client";
import { useEffect, useState } from "react";
import { TourPageFlightInfo } from "@/lib/supabase";
import { Plane, Plus, Trash2, Search, Loader2, Save, ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  flights: TourPageFlightInfo[];
  onSave: (flights: TourPageFlightInfo[]) => Promise<void>;
}

const EMPTY: TourPageFlightInfo = {
  flight_no: "", date: "", from: "", from_terminal: "", to: "", to_terminal: "", depart: "", arrive: "",
};

export default function FlightEditor({ flights, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TourPageFlightInfo[]>(flights || []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lookup, setLookup] = useState<number | null>(null);

  // 外部 flights 更新（例如重新生成後）時同步，但避免覆蓋使用者未存的編輯
  useEffect(() => { if (!dirty) setRows(flights || []); }, [flights, dirty]);

  const upd = (i: number, patch: Partial<TourPageFlightInfo>) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
    setDirty(true);
  };
  const add = () => { setRows(prev => [...prev, { ...EMPTY }]); setDirty(true); setOpen(true); };
  const del = (i: number) => { setRows(prev => prev.filter((_, idx) => idx !== i)); setDirty(true); };

  const save = async () => {
    setSaving(true);
    await onSave(rows);
    setSaving(false);
    setDirty(false);
  };

  const autoFill = async (i: number) => {
    const r = rows[i];
    if (!r.flight_no.trim()) { alert("請先填寫航班號"); return; }
    setLookup(i);
    try {
      const res = await fetch("/api/flight-lookup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flight_no: r.flight_no.trim(), date: r.date }),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "查詢失敗"); return; }
      upd(i, {
        from:          r.from          || j.from || "",
        from_terminal: r.from_terminal || j.from_terminal || "",
        to:            r.to            || j.to || "",
        to_terminal:   r.to_terminal   || j.to_terminal || "",
        depart:        r.depart        || j.depart || "",
        arrive:        r.arrive        || j.arrive || "",
      });
    } catch { alert("查詢失敗，請重試"); }
    finally { setLookup(null); }
  };

  const inp = "w-full text-xs border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <div className="border-t border-slate-100 dark:border-slate-700">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <Plane className="w-3.5 h-3.5 text-sky-500" /> 航班資訊
        {rows.length > 0 && <span className="text-[10px] bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 px-1.5 py-0.5 rounded-full">{rows.length}</span>}
        {dirty && <span className="text-[10px] text-orange-500">● 未儲存</span>}
        <span className="ml-auto text-[10px] text-slate-400">可手動填寫或用航班號自動帶入</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {rows.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 dark:border-slate-600 rounded-lg">
              尚無航班。點下方「新增航班」，填入航班號後按「自動帶入」即可帶出時間、出發/抵達地與航廈。
            </p>
          ) : rows.map((r, i) => (
            <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-600 p-2.5 bg-slate-50/50 dark:bg-slate-700/30">
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6 sm:col-span-3">
                  <label className="text-[10px] text-slate-400">航班號</label>
                  <div className="flex gap-1">
                    <input className={inp} placeholder="BR198" value={r.flight_no} onChange={e => upd(i, { flight_no: e.target.value })} />
                    <button onClick={() => autoFill(i)} disabled={lookup === i}
                      className="shrink-0 flex items-center gap-1 text-[11px] px-2 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded disabled:opacity-50 transition-colors"
                      title="依航班號自動帶入時間/航線/航廈">
                      {lookup === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />} 自動
                    </button>
                  </div>
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <label className="text-[10px] text-slate-400">日期</label>
                  <input className={inp} placeholder="2026-09-20" value={r.date} onChange={e => upd(i, { date: e.target.value })} />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <label className="text-[10px] text-slate-400">出發時間</label>
                  <input className={inp} placeholder="09:00" value={r.depart} onChange={e => upd(i, { depart: e.target.value })} />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <label className="text-[10px] text-slate-400">抵達時間</label>
                  <input className={inp} placeholder="13:00" value={r.arrive} onChange={e => upd(i, { arrive: e.target.value })} />
                </div>
                <div className="col-span-6 sm:col-span-2 flex items-end justify-end">
                  <button onClick={() => del(i)} className="p-1.5 text-slate-300 hover:text-white hover:bg-red-500 rounded-lg transition-colors" title="刪除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="col-span-12 sm:col-span-6 grid grid-cols-3 gap-1.5">
                  <div className="col-span-2">
                    <label className="text-[10px] text-slate-400">出發地</label>
                    <input className={inp} placeholder="台北桃園" value={r.from} onChange={e => upd(i, { from: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">航廈</label>
                    <input className={inp} placeholder="T2" value={r.from_terminal || ""} onChange={e => upd(i, { from_terminal: e.target.value })} />
                  </div>
                </div>
                <div className="col-span-12 sm:col-span-6 grid grid-cols-3 gap-1.5">
                  <div className="col-span-2">
                    <label className="text-[10px] text-slate-400">抵達地</label>
                    <input className={inp} placeholder="上海浦東" value={r.to} onChange={e => upd(i, { to: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">航廈</label>
                    <input className={inp} placeholder="T1" value={r.to_terminal || ""} onChange={e => upd(i, { to_terminal: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <button onClick={add}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-sky-300 dark:border-sky-700 rounded-lg text-xs text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors font-medium">
              <Plus className="w-3.5 h-3.5" /> 新增航班
            </button>
            <button onClick={save} disabled={saving || !dirty}
              className="flex items-center gap-1 text-xs px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} 儲存
            </button>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            「自動」依航班號用 AI 推估固定班表（時間/航線/航廈），<span className="text-orange-500">請務必核對實際航班</span>。儲存後同步更新前台「參考航班」。
          </p>
        </div>
      )}
    </div>
  );
}
