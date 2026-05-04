"use client";
import { useState, useCallback, useEffect } from "react";
import { supabase, TourCost, COST_CATEGORIES, CostCategory } from "@/lib/supabase";
import { Save, Plus, Trash2 } from "lucide-react";

interface Row {
  id?: string; category: CostCategory; description: string;
  unit_price: number; quantity: number; notes: string;
  dirty?: boolean; isNew?: boolean;
}
interface Props { tourId: string; pax: number; sellingPrice: number; onSaved?: () => void; }

export default function CostSpreadsheet({ tourId, pax, sellingPrice, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("tour_costs").select("*").eq("tour_id", tourId).order("created_at");
      if (data && data.length > 0) {
        setRows(data.map((d: TourCost) => ({ id: d.id, category: d.category as CostCategory,
          description: d.description, unit_price: d.unit_price, quantity: d.quantity, notes: d.notes })));
      } else {
        setRows(COST_CATEGORIES.map(c => ({ category: c.key, description: "", unit_price: 0,
          quantity: pax || 1, notes: "", isNew: true, dirty: false })));
      }
    })();
  }, [tourId, pax]);

  const updateRow = useCallback((idx: number, field: keyof Row, value: string | number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value, dirty: true } : r));
  }, []);

  const addRow = () => setRows(prev => [...prev, { category: "misc", description: "",
    unit_price: 0, quantity: pax || 1, notes: "", isNew: true, dirty: true }]);

  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx));

  const saveAll = async () => {
    setSaving(true);
    try {
      const dirtyRows = rows.filter(r => r.dirty);
      for (const row of dirtyRows) {
        const payload = { tour_id: tourId, category: row.category, description: row.description,
          unit_price: row.unit_price, quantity: row.quantity, notes: row.notes };
        if (row.id) { await supabase.from("tour_costs").update(payload).eq("id", row.id); }
        else {
          const { data } = await supabase.from("tour_costs").insert([payload]).select().single();
          if (data) setRows(prev => prev.map(r => r === row ? { ...r, id: data.id, dirty: false, isNew: false } : r));
        }
      }
      setRows(prev => prev.map(r => ({ ...r, dirty: false }))); setLastSaved(new Date()); onSaved?.();
    } catch { alert("儲存失敗"); } finally { setSaving(false); }
  };

  const totalCost = rows.reduce((sum, r) => sum + r.unit_price * r.quantity, 0);
  const revenue = sellingPrice * pax; const profit = revenue - totalCost;
  const margin = revenue > 0 ? profit / revenue * 100 : 0;
  const costPerPax = pax > 0 ? totalCost / pax : 0; const hasDirty = rows.some(r => r.dirty);
  const categoryTotals = COST_CATEGORIES.reduce((acc, c) => {
    acc[c.key] = rows.filter(r => r.category === c.key).reduce((s, r) => s + r.unit_price * r.quantity, 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700 text-sm">💰 費用試算表</h3>
        <div className="flex items-center gap-3">
          {lastSaved && !hasDirty && <span className="text-xs text-slate-400">已儲存 {lastSaved.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})}</span>}
          {hasDirty && <span className="text-xs text-orange-500 font-medium">● 有未儲存的變更</span>}
          <button onClick={saveAll} disabled={saving || !hasDirty}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40">
            <Save className="w-3.5 h-3.5" />{saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </div>
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="bg-slate-700 text-white text-xs">
            <th className="text-left px-3 py-2.5 w-36">費用項目</th>
            <th className="text-left px-3 py-2.5 min-w-[140px]">說明</th>
            <th className="text-right px-3 py-2.5 w-28">單價 (NT$)</th>
            <th className="text-right px-3 py-2.5 w-20">數量/人數</th>
            <th className="text-right px-3 py-2.5 w-28 font-bold">小計 (NT$)</th>
            <th className="text-left px-3 py-2.5 min-w-[100px]">備註</th>
            <th className="w-8 px-1 py-2.5"></th>
          </tr></thead>
          <tbody>
            {COST_CATEGORIES.map(cat => {
              const catRows = rows.map((r, idx) => ({ r, idx })).filter(({ r }) => r.category === cat.key);
              if (catRows.length === 0) return null;
              return catRows.map(({ r, idx }, i) => (
                <tr key={idx} className={"border-t border-slate-100 " + (idx % 2 === 0 ? "bg-white" : "bg-slate-50/50") + " hover:bg-blue-50/30 transition-colors"}>
                  {i === 0 ? <td rowSpan={catRows.length} className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-50 border-r border-slate-200 align-top pt-3">{cat.label}</td> : null}
                  <td className="px-1 py-1"><input className="cell-input rounded" placeholder="說明（選填）" value={r.description} onChange={e => updateRow(idx,"description",e.target.value)} /></td>
                  <td className="px-1 py-1"><input type="number" className="cell-input text-right rounded" value={r.unit_price||""} placeholder="0" min="0" onChange={e => updateRow(idx,"unit_price",+e.target.value)} /></td>
                  <td className="px-1 py-1"><input type="number" className="cell-input text-right rounded" value={r.quantity||""} placeholder="1" min="0" onChange={e => updateRow(idx,"quantity",+e.target.value)} /></td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-700">{(r.unit_price*r.quantity).toLocaleString()}</td>
                  <td className="px-1 py-1"><input className="cell-input rounded" placeholder="備註" value={r.notes} onChange={e => updateRow(idx,"notes",e.target.value)} /></td>
                  <td className="px-1 py-1 text-center"><button onClick={() => removeRow(idx)} className="p-1 text-slate-300 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              ));
            })}
            <tr className="bg-slate-800 text-white font-bold text-sm border-t-2 border-slate-600">
              <td className="px-3 py-3 text-white">合計成本</td>
              <td colSpan={3} className="px-3 py-3 text-xs text-slate-300 font-normal">每人成本 NT${Math.round(costPerPax).toLocaleString()}</td>
              <td className="px-3 py-3 text-right text-yellow-300 text-base">NT${totalCost.toLocaleString()}</td>
              <td colSpan={2}></td>
            </tr>
          </tbody>
        </table></div>
        <div className="px-3 py-2 bg-slate-50 border-t border-slate-200">
          <button onClick={addRow} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
            <Plus className="w-3.5 h-3.5" /> 新增費用列
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="總成本" value={"NT$"+totalCost.toLocaleString()} sub={pax > 0 ? "每人 NT$"+Math.round(costPerPax).toLocaleString() : undefined} color="text-red-600" bg="bg-red-50" />
        <SummaryCard label="預估收入" value={"NT$"+revenue.toLocaleString()} sub={pax+" 人 × NT$"+sellingPrice.toLocaleString()} color="text-blue-600" bg="bg-blue-50" />
        <SummaryCard label="預估毛利" value={"NT$"+profit.toLocaleString()} sub={profit >= 0 ? "✅ 有利潤" : "⚠️ 虧損"} color={profit >= 0 ? "text-green-600" : "text-red-600"} bg={profit >= 0 ? "bg-green-50" : "bg-red-50"} />
        <SummaryCard label="毛利率" value={margin.toFixed(1)+"%"} sub={margin >= 20 ? "👍 健康毛利" : margin >= 0 ? "⚡ 低毛利" : "🚨 虧損"} color={margin >= 20 ? "text-green-600" : margin >= 0 ? "text-orange-600" : "text-red-600"} bg={margin >= 20 ? "bg-green-50" : margin >= 0 ? "bg-orange-50" : "bg-red-50"} />
      </div>
      {totalCost > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">費用分佈</h4>
          <div className="space-y-2">
            {COST_CATEGORIES.map(cat => {
              const amt = categoryTotals[cat.key] || 0; if (amt === 0) return null;
              const pct = totalCost > 0 ? amt / totalCost * 100 : 0;
              return (<div key={cat.key} className="flex items-center gap-3">
                <div className="text-xs text-slate-500 w-28 shrink-0">{cat.label}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden"><div className="h-2 bg-blue-500 rounded-full transition-all" style={{ width: pct+"%" }} /></div>
                <div className="text-xs text-slate-600 w-24 text-right shrink-0">NT${amt.toLocaleString()} <span className="text-slate-400">({pct.toFixed(0)}%)</span></div>
              </div>);
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, color, bg }: { label: string; value: string; sub?: string; color: string; bg: string; }) {
  return (<div className={bg+" rounded-xl p-4 border border-slate-100"}><div className="text-xs text-slate-500 mb-1">{label}</div><div className={"text-xl font-bold "+color}>{value}</div>{sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}</div>);
}
