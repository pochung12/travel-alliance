"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { supabase, TourCost, COST_CATEGORIES, CostCategory } from "@/lib/supabase";
import { Save, Plus, Trash2, Settings, X, Camera, Upload } from "lucide-react";

interface CustomColumn {
  id: string;
  name: string;
  type: "text" | "number";
}

interface Row {
  id?: string;
  category: CostCategory;
  description: string;
  unit_price: number;
  quantity: number;
  notes: string;
  custom_data: Record<string, string | number>;
  dirty?: boolean;
  isNew?: boolean;
}

interface TourImage {
  id?: string;
  name: string;
  data: string; // base64 data URL
  caption: string;
  isNew?: boolean;
}

interface Props {
  tourId: string;
  pax: number;
  sellingPrice: number;
  onSaved?: () => void;
}

// Compress image to max 1024px, JPEG 0.82
function compressImage(file: File, maxPx = 1024, quality = 0.82): Promise<string> {
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

export default function CostSpreadsheet({ tourId, pax, sellingPrice, onSaved }: Props) {
  const [rows, setRows]               = useState<Row[]>([]);
  const [saving, setSaving]           = useState(false);
  const [lastSaved, setLastSaved]     = useState<Date | null>(null);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [showColManager, setShowColManager] = useState(false);
  const [newColName, setNewColName]   = useState("");
  const [newColType, setNewColType]   = useState<"text" | "number">("text");
  const [editingColId, setEditingColId]   = useState<string | null>(null);
  const [editingColName, setEditingColName] = useState("");
  const [images, setImages]           = useState<TourImage[]>([]);
  const [viewingImage, setViewingImage] = useState<TourImage | null>(null);
  const [savingImages, setSavingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load all data ──────────────────────────────────────────────────────────
  useEffect(() => { loadAll(); }, [tourId]);

  const loadAll = async () => {
    // Custom columns from tours table
    const { data: tourData } = await supabase
      .from("tours").select("custom_columns").eq("id", tourId).single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cols: CustomColumn[] = (tourData as any)?.custom_columns || [];
    setCustomColumns(cols);

    // Cost rows
    const { data } = await supabase
      .from("tour_costs").select("*").eq("tour_id", tourId).order("created_at");

    if (data && data.length > 0) {
      setRows(data.map((d: TourCost & { custom_data?: Record<string, string | number> }) => ({
        id: d.id,
        category: d.category as CostCategory,
        description: d.description,
        unit_price: d.unit_price,
        quantity: d.quantity,
        notes: d.notes,
        custom_data: d.custom_data || {},
      })));
    } else {
      setRows(COST_CATEGORIES.map(c => ({
        category: c.key,
        description: "",
        unit_price: 0,
        quantity: pax || 1,
        notes: "",
        custom_data: {},
        isNew: true,
        dirty: false,
      })));
    }

    // Images
    const { data: imgData } = await supabase
      .from("tour_images").select("*").eq("tour_id", tourId).order("created_at");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setImages((imgData || []).map((i: any) => ({
      id: i.id, name: i.name, data: i.data, caption: i.caption || "",
    })));
  };

  // ── Row editing ────────────────────────────────────────────────────────────
  const updateRow = useCallback((idx: number, field: keyof Row, value: string | number) => {
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, [field]: value, dirty: true } : r
    ));
  }, []);

  const updateCustomCell = (idx: number, colId: string, value: string | number) => {
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, custom_data: { ...r.custom_data, [colId]: value }, dirty: true } : r
    ));
  };

  const addRow = () => {
    setRows(prev => [...prev, {
      category: "misc", description: "", unit_price: 0,
      quantity: pax || 1, notes: "", custom_data: {}, isNew: true, dirty: true,
    }]);
  };

  const removeRow = (idx: number) => {
    const row = rows[idx];
    if (row.id) {
      supabase.from("tour_costs").delete().eq("id", row.id).then(() => {});
    }
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const dirtyRows = rows.filter(r => r.dirty);
      for (const row of dirtyRows) {
        const payload = {
          tour_id: tourId,
          category: row.category,
          description: row.description,
          unit_price: row.unit_price,
          quantity: row.quantity,
          notes: row.notes,
          custom_data: row.custom_data,
        };
        if (row.id) {
          await supabase.from("tour_costs").update(payload).eq("id", row.id);
        } else {
          const { data } = await supabase.from("tour_costs").insert([payload]).select().single();
          if (data) {
            setRows(prev => prev.map(r =>
              r === row ? { ...r, id: data.id, dirty: false, isNew: false } : r
            ));
          }
        }
      }
      setRows(prev => prev.map(r => ({ ...r, dirty: false })));
      setLastSaved(new Date());
      onSaved?.();
    } catch {
      alert("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  // ── Custom column management ───────────────────────────────────────────────
  const saveCustomColumns = async (cols: CustomColumn[]) => {
    await supabase.from("tours").update({ custom_columns: cols }).eq("id", tourId);
    setCustomColumns(cols);
  };

  const addColumn = async () => {
    if (!newColName.trim()) return;
    const newCol: CustomColumn = {
      id: `col_${Date.now()}`, name: newColName.trim(), type: newColType,
    };
    await saveCustomColumns([...customColumns, newCol]);
    setNewColName("");
    setNewColType("text");
  };

  const deleteColumn = async (colId: string) => {
    if (!confirm("確定刪除此欄位？各費用列已填入的資料也會一併移除。")) return;
    await saveCustomColumns(customColumns.filter(c => c.id !== colId));
    setRows(prev => prev.map(r => {
      const d = { ...r.custom_data };
      delete d[colId];
      return { ...r, custom_data: d, dirty: true };
    }));
  };

  const startEditColumn = (col: CustomColumn) => {
    setEditingColId(col.id);
    setEditingColName(col.name);
  };

  const saveEditColumn = async () => {
    if (!editingColId || !editingColName.trim()) return;
    await saveCustomColumns(
      customColumns.map(c => c.id === editingColId ? { ...c, name: editingColName.trim() } : c)
    );
    setEditingColId(null);
  };

  // ── Photo management ───────────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const compressed = await compressImage(file);
      setImages(prev => [...prev, {
        name: file.name, data: compressed, caption: "", isNew: true,
      }]);
    }
    e.target.value = "";
  };

  const removeImage = async (idx: number) => {
    const img = images[idx];
    if (img.id) {
      await supabase.from("tour_images").delete().eq("id", img.id);
    }
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const saveImages = async () => {
    setSavingImages(true);
    try {
      const newImgs = images.filter(img => img.isNew);
      for (const img of newImgs) {
        const { data } = await supabase.from("tour_images").insert([{
          tour_id: tourId, name: img.name, data: img.data, caption: img.caption,
        }]).select().single();
        if (data) {
          setImages(prev => prev.map(i =>
            i === img ? { ...i, id: data.id, isNew: false } : i
          ));
        }
      }
      // Update captions for existing images
      for (const img of images.filter(i => i.id && !i.isNew)) {
        await supabase.from("tour_images").update({ caption: img.caption }).eq("id", img.id!);
      }
    } catch {
      alert("照片儲存失敗");
    } finally {
      setSavingImages(false);
    }
  };

  // ── Calculations ───────────────────────────────────────────────────────────
  const totalCost  = rows.reduce((sum, r) => sum + r.unit_price * r.quantity, 0);
  const revenue    = sellingPrice * pax;
  const profit     = revenue - totalCost;
  const margin     = revenue > 0 ? (profit / revenue * 100) : 0;
  const costPerPax = pax > 0 ? totalCost / pax : 0;
  const hasDirty   = rows.some(r => r.dirty);
  const hasNewImgs = images.some(i => i.isNew);

  const categoryTotals = COST_CATEGORIES.reduce((acc, c) => {
    acc[c.key] = rows.filter(r => r.category === c.key)
      .reduce((s, r) => s + r.unit_price * r.quantity, 0);
    return acc;
  }, {} as Record<string, number>);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-slate-700 text-sm">💰 費用試算表</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowColManager(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors">
            <Settings className="w-3.5 h-3.5" /> 管理欄位
          </button>
          {lastSaved && !hasDirty && (
            <span className="text-xs text-slate-400">
              已儲存 {lastSaved.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {hasDirty && <span className="text-xs text-orange-500 font-medium">● 有未儲存的變更</span>}
          <button onClick={saveAll} disabled={saving || !hasDirty}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 transition-colors">
            <Save className="w-3.5 h-3.5" />
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </div>

      {/* Spreadsheet table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-700 text-white text-xs">
                <th className="text-left px-3 py-2.5 w-36">費用項目</th>
                <th className="text-left px-3 py-2.5 min-w-[140px]">說明</th>
                <th className="text-right px-3 py-2.5 w-28">單價 (NT$)</th>
                <th className="text-right px-3 py-2.5 w-20">數量/人數</th>
                <th className="text-right px-3 py-2.5 w-28 font-bold">小計 (NT$)</th>
                <th className="text-left px-3 py-2.5 min-w-[100px]">備註</th>
                {customColumns.map(col => (
                  <th key={col.id} className="text-left px-3 py-2.5 min-w-[110px] bg-indigo-700">
                    {col.name}
                  </th>
                ))}
                <th className="w-8 px-1 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {COST_CATEGORIES.map(cat => {
                const catRows = rows.map((r, idx) => ({ r, idx })).filter(({ r }) => r.category === cat.key);
                if (catRows.length === 0) return null;
                return catRows.map(({ r, idx }, i) => (
                  <tr key={idx} className={`border-t border-slate-100 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-blue-50/30 transition-colors`}>
                    {i === 0 ? (
                      <td rowSpan={catRows.length} className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-50 border-r border-slate-200 align-top pt-3">
                        {cat.label}
                      </td>
                    ) : null}
                    <td className="px-1 py-1">
                      <input className="cell-input rounded" placeholder="說明（選填）"
                        value={r.description} onChange={e => updateRow(idx, "description", e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" className="cell-input text-right rounded"
                        value={r.unit_price || ""} placeholder="0" min="0"
                        onChange={e => updateRow(idx, "unit_price", +e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" className="cell-input text-right rounded"
                        value={r.quantity || ""} placeholder="1" min="0"
                        onChange={e => updateRow(idx, "quantity", +e.target.value)} />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700">
                      {(r.unit_price * r.quantity).toLocaleString()}
                    </td>
                    <td className="px-1 py-1">
                      <input className="cell-input rounded" placeholder="備註"
                        value={r.notes} onChange={e => updateRow(idx, "notes", e.target.value)} />
                    </td>
                    {customColumns.map(col => (
                      <td key={col.id} className="px-1 py-1 bg-indigo-50/30">
                        <input
                          type={col.type === "number" ? "number" : "text"}
                          className="cell-input rounded"
                          placeholder="—"
                          value={r.custom_data[col.id] !== undefined ? String(r.custom_data[col.id]) : ""}
                          onChange={e => updateCustomCell(idx, col.id,
                            col.type === "number" ? +e.target.value : e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => removeRow(idx)}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ));
              })}

              {/* Uncategorized rows */}
              {rows.map((r, idx) => ({ r, idx }))
                .filter(({ r }) => !COST_CATEGORIES.find(c => c.key === r.category))
                .map(({ r, idx }) => (
                  <tr key={idx} className="border-t border-slate-100 bg-white hover:bg-blue-50/30">
                    <td className="px-3 py-2 text-xs text-slate-400 bg-slate-50 border-r border-slate-200">
                      <select className="w-full text-xs border-0 bg-transparent outline-none"
                        value={r.category} onChange={e => updateRow(idx, "category", e.target.value)}>
                        {COST_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input className="cell-input rounded" value={r.description} placeholder="說明"
                        onChange={e => updateRow(idx, "description", e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" className="cell-input text-right rounded"
                        value={r.unit_price || ""} placeholder="0" min="0"
                        onChange={e => updateRow(idx, "unit_price", +e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" className="cell-input text-right rounded"
                        value={r.quantity || ""} placeholder="1" min="0"
                        onChange={e => updateRow(idx, "quantity", +e.target.value)} />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700">
                      {(r.unit_price * r.quantity).toLocaleString()}
                    </td>
                    <td className="px-1 py-1">
                      <input className="cell-input rounded" value={r.notes} placeholder="備註"
                        onChange={e => updateRow(idx, "notes", e.target.value)} />
                    </td>
                    {customColumns.map(col => (
                      <td key={col.id} className="px-1 py-1 bg-indigo-50/30">
                        <input
                          type={col.type === "number" ? "number" : "text"}
                          className="cell-input rounded" placeholder="—"
                          value={r.custom_data[col.id] !== undefined ? String(r.custom_data[col.id]) : ""}
                          onChange={e => updateCustomCell(idx, col.id,
                            col.type === "number" ? +e.target.value : e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => removeRow(idx)}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}

              {/* Total row */}
              <tr className="bg-slate-800 text-white font-bold text-sm border-t-2 border-slate-600">
                <td className="px-3 py-3">合計成本</td>
                <td colSpan={3} className="px-3 py-3 text-xs text-slate-300 font-normal">
                  每人成本 NT${Math.round(costPerPax).toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right text-yellow-300 text-base">
                  NT${totalCost.toLocaleString()}
                </td>
                <td colSpan={2 + customColumns.length}></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Add row button */}
        <div className="px-3 py-2 bg-slate-50 border-t border-slate-200">
          <button onClick={addRow}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
            <Plus className="w-3.5 h-3.5" /> 新增費用列
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="總成本" value={`NT$${totalCost.toLocaleString()}`}
          sub={pax > 0 ? `每人 NT$${Math.round(costPerPax).toLocaleString()}` : undefined}
          color="text-red-600" bg="bg-red-50" />
        <SummaryCard label="預估收入" value={`NT$${revenue.toLocaleString()}`}
          sub={`${pax} 人 × NT$${sellingPrice.toLocaleString()}`}
          color="text-blue-600" bg="bg-blue-50" />
        <SummaryCard label="預估毛利" value={`NT$${profit.toLocaleString()}`}
          sub={profit >= 0 ? "✅ 有利潤" : "⚠️ 虧損"}
          color={profit >= 0 ? "text-green-600" : "text-red-600"}
          bg={profit >= 0 ? "bg-green-50" : "bg-red-50"} />
        <SummaryCard label="毛利率" value={`${margin.toFixed(1)}%`}
          sub={margin >= 20 ? "👍 健康毛利" : margin >= 0 ? "⚡ 低毛利" : "🚨 虧損"}
          color={margin >= 20 ? "text-green-600" : margin >= 0 ? "text-orange-600" : "text-red-600"}
          bg={margin >= 20 ? "bg-green-50" : margin >= 0 ? "bg-orange-50" : "bg-red-50"} />
      </div>

      {/* Cost breakdown */}
      {totalCost > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">費用分佈</h4>
          <div className="space-y-2">
            {COST_CATEGORIES.map(cat => {
              const amt = categoryTotals[cat.key] || 0;
              if (amt === 0) return null;
              const pct = totalCost > 0 ? amt / totalCost * 100 : 0;
              return (
                <div key={cat.key} className="flex items-center gap-3">
                  <div className="text-xs text-slate-500 w-28 shrink-0">{cat.label}</div>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="h-2 bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-slate-600 w-24 text-right shrink-0">
                    NT${amt.toLocaleString()} <span className="text-slate-400">({pct.toFixed(0)}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Photo section ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
            <Camera className="w-4 h-4 text-slate-500" /> 報價備忘照片
            {images.length > 0 && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                {images.length} 張
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors">
              <Upload className="w-3.5 h-3.5" /> 上傳照片
            </button>
            {hasNewImgs && (
              <button onClick={saveImages} disabled={savingImages}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 transition-colors">
                <Save className="w-3.5 h-3.5" />
                {savingImages ? "儲存中…" : "儲存照片"}
              </button>
            )}
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={handleFileSelect} />

        {images.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">
            <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>還沒有照片，點「上傳照片」新增報價備忘</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map((img, idx) => (
              <div key={idx} className="relative group">
                <div
                  className="aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200 cursor-pointer"
                  onClick={() => setViewingImage(img)}
                >
                  <img src={img.data} alt={img.name}
                    className="w-full h-full object-cover hover:scale-105 transition-transform" />
                  {img.isNew && (
                    <div className="absolute top-1 left-1 bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                      未儲存
                    </div>
                  )}
                </div>
                <button onClick={() => removeImage(idx)}
                  className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">
                  <X className="w-3 h-3" />
                </button>
                <input
                  className="mt-1 w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="說明文字（選填）"
                  value={img.caption}
                  onChange={e => setImages(prev => prev.map((i, ii) =>
                    ii === idx ? { ...i, caption: e.target.value } : i
                  ))}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Column Manager Modal ───────────────────────────────────────────── */}
      {showColManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">管理自訂欄位</h2>
              <button onClick={() => setShowColManager(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3 max-h-80 overflow-y-auto">
              {customColumns.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-3">還沒有自訂欄位</p>
              ) : (
                customColumns.map(col => (
                  <div key={col.id} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg">
                    {editingColId === col.id ? (
                      <>
                        <input
                          className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                          value={editingColName}
                          onChange={e => setEditingColName(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && saveEditColumn()}
                          autoFocus
                        />
                        <button onClick={saveEditColumn}
                          className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">確定</button>
                        <button onClick={() => setEditingColId(null)}
                          className="text-xs px-2.5 py-1.5 bg-slate-200 text-slate-600 rounded hover:bg-slate-300">取消</button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium text-slate-700">{col.name}</span>
                        <span className="text-xs text-slate-400 px-2 py-0.5 bg-white border border-slate-200 rounded-full">
                          {col.type === "number" ? "數字" : "文字"}
                        </span>
                        <button onClick={() => startEditColumn(col)}
                          className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors">改名</button>
                        <button onClick={() => deleteColumn(col.id)}
                          className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 mb-2">新增欄位</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="欄位名稱（例：供應商、備用數量）"
                  value={newColName}
                  onChange={e => setNewColName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addColumn()}
                />
                <select
                  className="text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={newColType}
                  onChange={e => setNewColType(e.target.value as "text" | "number")}
                >
                  <option value="text">文字</option>
                  <option value="number">數字</option>
                </select>
                <button onClick={addColumn} disabled={!newColName.trim()}
                  className="flex items-center gap-1 text-sm px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Image lightbox ─────────────────────────────────────────────────── */}
      {viewingImage && (
        <div
          className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingImage(null)}
        >
          <div className="max-w-3xl max-h-full relative" onClick={e => e.stopPropagation()}>
            <img src={viewingImage.data} alt={viewingImage.name}
              className="max-w-full max-h-[80vh] rounded-xl shadow-2xl object-contain" />
            {viewingImage.caption && (
              <div className="mt-3 text-center text-white text-sm bg-black/40 rounded-lg px-4 py-2">
                {viewingImage.caption}
              </div>
            )}
            <button onClick={() => setViewingImage(null)}
              className="absolute -top-3 -right-3 p-2 bg-white/20 text-white rounded-full hover:bg-white/40 backdrop-blur-sm">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, color, bg }: {
  label: string; value: string; sub?: string; color: string; bg: string;
}) {
  return (
    <div className={`${bg} rounded-xl p-4 border border-slate-100`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}
