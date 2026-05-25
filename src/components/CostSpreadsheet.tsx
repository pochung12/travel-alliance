"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { supabase, TourCost, TourCostVersion, COST_CATEGORIES, CostCategory } from "@/lib/supabase";
import { Save, Plus, Trash2, Settings, X, Camera, Upload, Check, ChevronDown, Pencil, Copy, ExternalLink } from "lucide-react";

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
  reference_url: string;
  custom_data: Record<string, string | number>;
  dirty?: boolean;
  isNew?: boolean;
}

interface TourImage {
  id?: string;
  name: string;
  data: string;
  caption: string;
  isNew?: boolean;
}

interface Props {
  tourId: string;
  pax: number;
  revenue: number;
  onSaved?: () => void;
}

function compressImage(file: File, maxPx = 2400, quality = 0.92): Promise<string> {
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

export default function CostSpreadsheet({ tourId, pax, revenue, onSaved }: Props) {
  // ── Versions ───────────────────────────────────────────────────────────────
  const [versions,        setVersions]        = useState<TourCostVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [showNewVersion,  setShowNewVersion]  = useState(false);
  const [newVersionName,  setNewVersionName]  = useState("");
  const [copyFromId,      setCopyFromId]      = useState<string>("none");
  const [renamingId,      setRenamingId]      = useState<string | null>(null);
  const [renameVal,       setRenameVal]       = useState("");
  const [versionMenuId,   setVersionMenuId]   = useState<string | null>(null);

  // ── Rows / Cols / Images ───────────────────────────────────────────────────
  const [rows,            setRows]            = useState<Row[]>([]);
  const [saving,          setSaving]          = useState(false);
  const [lastSaved,       setLastSaved]       = useState<Date | null>(null);
  const [customColumns,   setCustomColumns]   = useState<CustomColumn[]>([]);
  const [showColManager,  setShowColManager]  = useState(false);
  const [newColName,      setNewColName]      = useState("");
  const [newColType,      setNewColType]      = useState<"text" | "number">("text");
  const [editingColId,    setEditingColId]    = useState<string | null>(null);
  const [editingColName,  setEditingColName]  = useState("");
  const [images,          setImages]          = useState<TourImage[]>([]);
  const [viewingImage,    setViewingImage]    = useState<TourImage | null>(null);
  const [savingImages,    setSavingImages]    = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => { initLoad(); }, [tourId]);
  useEffect(() => { if (activeVersionId) loadRows(activeVersionId); }, [activeVersionId]);

  const initLoad = async () => {
    // Custom columns
    const { data: tourData } = await supabase
      .from("tours").select("custom_columns").eq("id", tourId).single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCustomColumns((tourData as any)?.custom_columns || []);

    // Images
    const { data: imgData } = await supabase
      .from("tour_images").select("*").eq("tour_id", tourId).order("created_at");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setImages((imgData || []).map((i: any) => ({ id: i.id, name: i.name, data: i.data, caption: i.caption || "" })));

    // Versions
    const { data: vData } = await supabase
      .from("tour_cost_versions")
      .select("*").eq("tour_id", tourId).order("created_at");

    if (!vData || vData.length === 0) {
      // 沒有版本 → 自動建「版本 1」，並把舊的無版本費用列遷移過去
      const { data: newVer } = await supabase
        .from("tour_cost_versions")
        .insert([{ tour_id: tourId, name: "版本 1", is_selected: false, notes: "" }])
        .select().single();
      if (newVer) {
        // 遷移舊資料（version_id IS NULL）
        await supabase.from("tour_costs")
          .update({ version_id: newVer.id })
          .eq("tour_id", tourId)
          .is("version_id", null);
        setVersions([newVer as TourCostVersion]);
        setActiveVersionId(newVer.id);
      }
    } else {
      setVersions(vData as TourCostVersion[]);
      setActiveVersionId(vData[0].id);
    }
  };

  const loadRows = async (versionId: string) => {
    const { data } = await supabase
      .from("tour_costs").select("*")
      .eq("tour_id", tourId).eq("version_id", versionId).order("created_at");

    const dbRows: Row[] = (data || []).map((d: TourCost & { custom_data?: Record<string, string | number> }) => ({
      id: d.id, category: d.category as CostCategory,
      description: d.description, unit_price: d.unit_price,
      quantity: d.quantity, notes: d.notes,
      reference_url: d.reference_url || "",
      custom_data: d.custom_data || {},
    }));

    const existingCats = new Set(dbRows.map(r => r.category));
    const defaultRows: Row[] = COST_CATEGORIES
      .filter(c => !existingCats.has(c.key))
      .map(c => ({
        category: c.key, description: "", unit_price: 0,
        quantity: pax || 1, notes: "", reference_url: "", custom_data: {}, isNew: true, dirty: false,
      }));
    setRows([...dbRows, ...defaultRows]);
    setLastSaved(null);
  };

  // ── Version actions ────────────────────────────────────────────────────────
  const createVersion = async () => {
    const name = newVersionName.trim() || `版本 ${versions.length + 1}`;
    const { data: newVer } = await supabase
      .from("tour_cost_versions")
      .insert([{ tour_id: tourId, name, is_selected: false, notes: "" }])
      .select().single();
    if (!newVer) return;

    // 複製費用列
    if (copyFromId !== "none") {
      const { data: srcRows } = await supabase
        .from("tour_costs").select("*")
        .eq("tour_id", tourId).eq("version_id", copyFromId);
      if (srcRows && srcRows.length > 0) {
        const copies = srcRows.map((r: TourCost & { custom_data?: Record<string, string | number> }) => ({
          tour_id: tourId, version_id: newVer.id,
          category: r.category, description: r.description,
          unit_price: r.unit_price, quantity: r.quantity,
          notes: r.notes, reference_url: r.reference_url || "",
          custom_data: r.custom_data || {},
        }));
        await supabase.from("tour_costs").insert(copies);
      }
    }

    const updated = [...versions, newVer as TourCostVersion];
    setVersions(updated);
    setActiveVersionId(newVer.id);
    setShowNewVersion(false);
    setNewVersionName("");
    setCopyFromId("none");
  };

  const renameVersion = async (id: string, name: string) => {
    if (!name.trim()) return;
    await supabase.from("tour_cost_versions").update({ name: name.trim() }).eq("id", id);
    setVersions(prev => prev.map(v => v.id === id ? { ...v, name: name.trim() } : v));
    setRenamingId(null);
  };

  const selectVersion = async (id: string) => {
    await supabase.from("tour_cost_versions")
      .update({ is_selected: false }).eq("tour_id", tourId);
    await supabase.from("tour_cost_versions")
      .update({ is_selected: true }).eq("id", id);
    setVersions(prev => prev.map(v => ({ ...v, is_selected: v.id === id })));
    setVersionMenuId(null);
  };

  const deleteVersion = async (id: string) => {
    if (versions.length <= 1) { alert("至少要保留一個版本"); return; }
    if (!confirm(`確定刪除這個版本？版本內的所有費用資料也會一併刪除。`)) return;
    await supabase.from("tour_costs").delete().eq("version_id", id);
    await supabase.from("tour_cost_versions").delete().eq("id", id);
    const remaining = versions.filter(v => v.id !== id);
    setVersions(remaining);
    if (activeVersionId === id) setActiveVersionId(remaining[0].id);
    setVersionMenuId(null);
  };

  const switchVersion = async (id: string) => {
    if (id === activeVersionId) return;
    if (rows.some(r => r.dirty)) {
      if (!confirm("有未儲存的變更，切換版本將會遺失。確定要切換嗎？")) return;
    }
    setActiveVersionId(id);
  };

  // ── Row editing ────────────────────────────────────────────────────────────
  const updateRow = useCallback((idx: number, field: keyof Row, value: string | number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value, dirty: true } : r));
  }, []);

  const updateCustomCell = (idx: number, colId: string, value: string | number) => {
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, custom_data: { ...r.custom_data, [colId]: value }, dirty: true } : r
    ));
  };

  const addRow = () => {
    setRows(prev => [...prev, {
      category: "misc", description: "", unit_price: 0,
      quantity: pax || 1, notes: "", reference_url: "", custom_data: {}, isNew: true, dirty: true,
    }]);
  };

  const removeRow = (idx: number) => {
    const row = rows[idx];
    if (row.id) supabase.from("tour_costs").delete().eq("id", row.id).then(() => {});
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const saveAll = async () => {
    if (!activeVersionId) return;
    setSaving(true);
    const failedCount = { n: 0 };
    const indexed = rows.map((r, idx) => ({ r, idx })).filter(({ r }) => r.dirty || r.isNew);

    for (const { r: row, idx } of indexed) {
      const payload = {
        tour_id: tourId, version_id: activeVersionId,
        category: row.category, description: row.description,
        unit_price: row.unit_price, quantity: row.quantity,
        notes: row.notes, reference_url: row.reference_url || "",
      };
      if (row.id) {
        const { error } = await supabase.from("tour_costs").update(payload).eq("id", row.id);
        if (error) { failedCount.n++; continue; }
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, dirty: false } : r));
      } else {
        const { data, error } = await supabase.from("tour_costs").insert([payload]).select("id").single();
        if (error || !data) { failedCount.n++; continue; }
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, id: data.id, dirty: false, isNew: false } : r));
      }
    }
    setSaving(false);
    if (failedCount.n === 0) { setLastSaved(new Date()); onSaved?.(); }
    else alert(`${failedCount.n} 筆儲存失敗，請重試`);
  };

  // ── Custom columns ─────────────────────────────────────────────────────────
  const saveCustomColumns = async (cols: CustomColumn[]) => {
    await supabase.from("tours").update({ custom_columns: cols }).eq("id", tourId);
    setCustomColumns(cols);
  };
  const addColumn = async () => {
    if (!newColName.trim()) return;
    await saveCustomColumns([...customColumns, { id: `col_${Date.now()}`, name: newColName.trim(), type: newColType }]);
    setNewColName(""); setNewColType("text");
  };
  const deleteColumn = async (colId: string) => {
    if (!confirm("確定刪除此欄位？")) return;
    await saveCustomColumns(customColumns.filter(c => c.id !== colId));
    setRows(prev => prev.map(r => { const d = { ...r.custom_data }; delete d[colId]; return { ...r, custom_data: d, dirty: true }; }));
  };
  const startEditColumn = (col: CustomColumn) => { setEditingColId(col.id); setEditingColName(col.name); };
  const saveEditColumn = async () => {
    if (!editingColId || !editingColName.trim()) return;
    await saveCustomColumns(customColumns.map(c => c.id === editingColId ? { ...c, name: editingColName.trim() } : c));
    setEditingColId(null);
  };

  // ── Photos ─────────────────────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(e.target.files || [])) {
      if (!file.type.startsWith("image/")) continue;
      const compressed = await compressImage(file);
      setImages(prev => [...prev, { name: file.name, data: compressed, caption: "", isNew: true }]);
    }
    e.target.value = "";
  };
  const removeImage = async (idx: number) => {
    const img = images[idx];
    if (img.id) await supabase.from("tour_images").delete().eq("id", img.id);
    setImages(prev => prev.filter((_, i) => i !== idx));
  };
  const saveImages = async () => {
    setSavingImages(true);
    try {
      for (const img of images.filter(i => i.isNew)) {
        const { data } = await supabase.from("tour_images")
          .insert([{ tour_id: tourId, name: img.name, data: img.data, caption: img.caption }]).select().single();
        if (data) setImages(prev => prev.map(i => i === img ? { ...i, id: data.id, isNew: false } : i));
      }
      for (const img of images.filter(i => i.id && !i.isNew))
        await supabase.from("tour_images").update({ caption: img.caption }).eq("id", img.id!);
    } catch { alert("照片儲存失敗"); }
    finally { setSavingImages(false); }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalCost  = rows.reduce((sum, r) => sum + r.unit_price * r.quantity, 0);
  const profit     = revenue - totalCost;
  const margin     = revenue > 0 ? (profit / revenue * 100) : 0;
  const costPerPax = pax > 0 ? totalCost / pax : 0;
  const hasDirty   = rows.some(r => r.dirty);
  const hasNewImgs = images.some(i => i.isNew);
  const categoryTotals = COST_CATEGORIES.reduce((acc, c) => {
    acc[c.key] = rows.filter(r => r.category === c.key).reduce((s, r) => s + r.unit_price * r.quantity, 0);
    return acc;
  }, {} as Record<string, number>);
  const activeVersion = versions.find(v => v.id === activeVersionId);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4" onClick={() => setVersionMenuId(null)}>

      {/* ── Version tabs ────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 pt-3 pb-0 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-slate-400 mr-1 shrink-0">報價版本：</span>
            {versions.map(v => (
              <div key={v.id} className="relative flex items-center">
                {renamingId === v.id ? (
                  <div className="flex items-center gap-1 mb-2">
                    <input
                      autoFocus
                      className="text-sm border border-blue-400 rounded-lg px-2 py-1 w-32 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={renameVal}
                      onChange={e => setRenameVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") renameVersion(v.id, renameVal);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                    />
                    <button onClick={() => renameVersion(v.id, renameVal)}
                      className="text-xs px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700">確定</button>
                    <button onClick={() => setRenamingId(null)}
                      className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">取消</button>
                  </div>
                ) : (
                  <div
                    onClick={e => { e.stopPropagation(); switchVersion(v.id); }}
                    className={`group relative flex items-center gap-1.5 px-3 py-2 mb-0 rounded-t-lg text-sm cursor-pointer border-b-2 transition-colors ${
                      activeVersionId === v.id
                        ? "border-blue-600 text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20 font-medium"
                        : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    }`}>
                    {v.is_selected && <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                    <span>{v.name}</span>
                    {/* Dropdown trigger */}
                    <button
                      onClick={e => { e.stopPropagation(); setVersionMenuId(versionMenuId === v.id ? null : v.id); }}
                      className="opacity-0 group-hover:opacity-100 ml-0.5 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-all">
                      <ChevronDown className="w-3 h-3" />
                    </button>

                    {/* Dropdown menu */}
                    {versionMenuId === v.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className="absolute top-full left-0 mt-1 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 py-1 text-sm">
                        {!v.is_selected && (
                          <button onClick={() => selectVersion(v.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                            <Check className="w-3.5 h-3.5" /> 選定此方案
                          </button>
                        )}
                        {v.is_selected && (
                          <div className="flex items-center gap-2 px-3 py-2 text-emerald-600 text-xs font-medium">
                            <Check className="w-3.5 h-3.5" /> 已選定方案
                          </div>
                        )}
                        <button onClick={() => { setRenamingId(v.id); setRenameVal(v.name); setVersionMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <Pencil className="w-3.5 h-3.5" /> 重新命名
                        </button>
                        <button onClick={() => { setCopyFromId(v.id); setShowNewVersion(true); setVersionMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <Copy className="w-3.5 h-3.5" /> 複製此版本
                        </button>
                        {versions.length > 1 && (
                          <button onClick={() => deleteVersion(v.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-t border-slate-100 dark:border-slate-700 mt-1">
                            <Trash2 className="w-3.5 h-3.5" /> 刪除版本
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Add version button */}
            <button onClick={e => { e.stopPropagation(); setShowNewVersion(true); setCopyFromId("none"); setNewVersionName(""); }}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 mb-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors border border-dashed border-slate-300 dark:border-slate-600">
              <Plus className="w-3.5 h-3.5" /> 新增版本
            </button>
          </div>
        </div>

        {/* Selected version badge */}
        {activeVersion && (
          <div className="px-4 py-2 flex items-center justify-between bg-slate-50/50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                目前查看：<span className="font-semibold text-slate-700 dark:text-slate-200">{activeVersion.name}</span>
              </span>
              {activeVersion.is_selected && (
                <span className="flex items-center gap-1 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                  <Check className="w-3 h-3" /> 已選定方案
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowColManager(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors">
                <Settings className="w-3.5 h-3.5" /> 管理欄位
              </button>
              {lastSaved && !hasDirty && (
                <span className="text-xs text-slate-400">已儲存 {lastSaved.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}</span>
              )}
              {hasDirty && <span className="text-xs text-orange-500 font-medium">● 有未儲存的變更</span>}
              <button onClick={saveAll} disabled={saving || !hasDirty}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 transition-colors">
                <Save className="w-3.5 h-3.5" />
                {saving ? "儲存中…" : "儲存"}
              </button>
            </div>
          </div>
        )}

        {/* Spreadsheet */}
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
                <th className="text-left px-3 py-2.5 min-w-[160px]">參考網址</th>
                {customColumns.map(col => (
                  <th key={col.id} className="text-left px-3 py-2.5 min-w-[110px] bg-indigo-700">{col.name}</th>
                ))}
                <th className="w-8 px-1 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {COST_CATEGORIES.map(cat => {
                const catRows = rows.map((r, idx) => ({ r, idx })).filter(({ r }) => r.category === cat.key);
                if (catRows.length === 0) return null;
                return catRows.map(({ r, idx }, i) => (
                  <tr key={idx} className={`border-t border-slate-100 dark:border-slate-700 ${idx % 2 === 0 ? "bg-white dark:bg-slate-800" : "bg-slate-50/50 dark:bg-slate-800/50"} hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors`}>
                    {i === 0 ? (
                      <td rowSpan={catRows.length} className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 border-r border-slate-200 dark:border-slate-600 align-top pt-3">
                        {cat.label}
                      </td>
                    ) : null}
                    <td className="px-1 py-1"><input className="cell-input rounded" placeholder="說明（選填）" value={r.description} onChange={e => updateRow(idx, "description", e.target.value)} /></td>
                    <td className="px-1 py-1"><input type="number" className="cell-input text-right rounded" value={r.unit_price || ""} placeholder="0" min="0" onChange={e => updateRow(idx, "unit_price", +e.target.value)} /></td>
                    <td className="px-1 py-1"><input type="number" className="cell-input text-right rounded" value={r.quantity || ""} placeholder="1" min="0" onChange={e => updateRow(idx, "quantity", +e.target.value)} /></td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">{(r.unit_price * r.quantity).toLocaleString()}</td>
                    <td className="px-1 py-1"><input className="cell-input rounded" placeholder="備註" value={r.notes} onChange={e => updateRow(idx, "notes", e.target.value)} /></td>
                    <td className="px-1 py-1">
                      <div className="flex items-center gap-1">
                        <input className="cell-input rounded flex-1 min-w-0" placeholder="貼上網址…" value={r.reference_url}
                          onChange={e => updateRow(idx, "reference_url", e.target.value)} />
                        {r.reference_url && (
                          <a href={r.reference_url.startsWith("http") ? r.reference_url : `https://${r.reference_url}`}
                            target="_blank" rel="noopener noreferrer"
                            className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors shrink-0"
                            title="開啟網址">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                    {customColumns.map(col => (
                      <td key={col.id} className="px-1 py-1 bg-indigo-50/30">
                        <input type={col.type === "number" ? "number" : "text"} className="cell-input rounded" placeholder="—"
                          value={r.custom_data[col.id] !== undefined ? String(r.custom_data[col.id]) : ""}
                          onChange={e => updateCustomCell(idx, col.id, col.type === "number" ? +e.target.value : e.target.value)} />
                      </td>
                    ))}
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => removeRow(idx)} title="刪除此列"
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-red-500 transition-colors rounded-lg">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ));
              })}

              {/* Uncategorized */}
              {rows.map((r, idx) => ({ r, idx }))
                .filter(({ r }) => !COST_CATEGORIES.find(c => c.key === r.category))
                .map(({ r, idx }) => (
                  <tr key={idx} className="border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-blue-50/30">
                    <td className="px-3 py-2 text-xs text-slate-400 bg-slate-50 dark:bg-slate-700/50 border-r border-slate-200 dark:border-slate-600">
                      <select className="w-full text-xs border-0 bg-transparent outline-none dark:text-slate-300"
                        value={r.category} onChange={e => updateRow(idx, "category", e.target.value)}>
                        {COST_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1"><input className="cell-input rounded" value={r.description} placeholder="說明" onChange={e => updateRow(idx, "description", e.target.value)} /></td>
                    <td className="px-1 py-1"><input type="number" className="cell-input text-right rounded" value={r.unit_price || ""} placeholder="0" min="0" onChange={e => updateRow(idx, "unit_price", +e.target.value)} /></td>
                    <td className="px-1 py-1"><input type="number" className="cell-input text-right rounded" value={r.quantity || ""} placeholder="1" min="0" onChange={e => updateRow(idx, "quantity", +e.target.value)} /></td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">{(r.unit_price * r.quantity).toLocaleString()}</td>
                    <td className="px-1 py-1"><input className="cell-input rounded" value={r.notes} placeholder="備註" onChange={e => updateRow(idx, "notes", e.target.value)} /></td>
                    <td className="px-1 py-1">
                      <div className="flex items-center gap-1">
                        <input className="cell-input rounded flex-1 min-w-0" placeholder="貼上網址…" value={r.reference_url}
                          onChange={e => updateRow(idx, "reference_url", e.target.value)} />
                        {r.reference_url && (
                          <a href={r.reference_url.startsWith("http") ? r.reference_url : `https://${r.reference_url}`}
                            target="_blank" rel="noopener noreferrer"
                            className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors shrink-0"
                            title="開啟網址">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                    {customColumns.map(col => (
                      <td key={col.id} className="px-1 py-1 bg-indigo-50/30">
                        <input type={col.type === "number" ? "number" : "text"} className="cell-input rounded" placeholder="—"
                          value={r.custom_data[col.id] !== undefined ? String(r.custom_data[col.id]) : ""}
                          onChange={e => updateCustomCell(idx, col.id, col.type === "number" ? +e.target.value : e.target.value)} />
                      </td>
                    ))}
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => removeRow(idx)} className="p-1.5 text-slate-400 hover:text-white hover:bg-red-500 transition-colors rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}

              {/* Total */}
              <tr className="bg-slate-800 text-white font-bold text-sm border-t-2 border-slate-600">
                <td className="px-3 py-3">合計成本</td>
                <td colSpan={3} className="px-3 py-3 text-xs text-slate-300 font-normal">每人成本 NT${Math.round(costPerPax).toLocaleString()}</td>
                <td className="px-3 py-3 text-right text-yellow-300 text-base">NT${totalCost.toLocaleString()}</td>
                <td colSpan={2 + customColumns.length}></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-600">
          <button onClick={addRow} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
            <Plus className="w-3.5 h-3.5" /> 新增費用列
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="總成本" value={`NT$${totalCost.toLocaleString()}`} sub={pax > 0 ? `每人 NT$${Math.round(costPerPax).toLocaleString()}` : undefined} color="text-red-600 dark:text-red-400" bg="bg-red-50 dark:bg-red-900/20" />
        <SummaryCard label="預估收入" value={`NT$${revenue.toLocaleString()}`} sub={`共 ${pax} 人`} color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/20" />
        <SummaryCard label="預估毛利" value={`NT$${profit.toLocaleString()}`} sub={profit >= 0 ? "✅ 有利潤" : "⚠️ 虧損"} color={profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"} bg={profit >= 0 ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"} />
        <SummaryCard label="毛利率" value={`${margin.toFixed(1)}%`} sub={margin >= 20 ? "👍 健康毛利" : margin >= 0 ? "⚡ 低毛利" : "🚨 虧損"} color={margin >= 20 ? "text-green-600 dark:text-green-400" : margin >= 0 ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400"} bg={margin >= 20 ? "bg-green-50 dark:bg-green-900/20" : margin >= 0 ? "bg-orange-50 dark:bg-orange-900/20" : "bg-red-50 dark:bg-red-900/20"} />
      </div>

      {/* Cost breakdown */}
      {totalCost > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">費用分佈</h4>
          <div className="space-y-2">
            {COST_CATEGORIES.map(cat => {
              const amt = categoryTotals[cat.key] || 0;
              if (amt === 0) return null;
              const pct = totalCost > 0 ? amt / totalCost * 100 : 0;
              return (
                <div key={cat.key} className="flex items-center gap-3">
                  <div className="text-xs text-slate-500 w-28 shrink-0">{cat.label}</div>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div className="h-2 bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 w-24 text-right shrink-0">
                    NT${amt.toLocaleString()} <span className="text-slate-400">({pct.toFixed(0)}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Photo section */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm flex items-center gap-2">
            <Camera className="w-4 h-4 text-slate-500" /> 報價備忘照片
            {images.length > 0 && <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded-full">{images.length} 張</span>}
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-lg transition-colors">
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
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
        {images.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">
            <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>還沒有照片，點「上傳照片」新增報價備忘</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map((img, idx) => (
              <div key={idx} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200 cursor-pointer" onClick={() => setViewingImage(img)}>
                  <img src={img.data} alt={img.name} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                  {img.isNew && <div className="absolute top-1 left-1 bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">未儲存</div>}
                </div>
                <button onClick={() => removeImage(idx)}
                  className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">
                  <X className="w-3 h-3" />
                </button>
                <input className="mt-1 w-full text-xs border border-slate-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="說明文字（選填）" value={img.caption}
                  onChange={e => setImages(prev => prev.map((i, ii) => ii === idx ? { ...i, caption: e.target.value } : i))} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── New Version Modal ──────────────────────────────────────────────── */}
      {showNewVersion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNewVersion(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" /> 新增報價版本
            </h2>
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">版本名稱</label>
              <input autoFocus
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder={`例如：地接社A、昂旅、自行操作`}
                value={newVersionName}
                onChange={e => setNewVersionName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createVersion()}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">複製費用列自</label>
              <select value={copyFromId} onChange={e => setCopyFromId(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="none">從空白開始</option>
                {versions.map(v => <option key={v.id} value={v.id}>複製「{v.name}」的費用</option>)}
              </select>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowNewVersion(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                取消
              </button>
              <button onClick={createVersion}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
                建立版本
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Column Manager */}
      {showColManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">管理自訂欄位</h2>
              <button onClick={() => setShowColManager(false)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 space-y-3 max-h-80 overflow-y-auto">
              {customColumns.length === 0
                ? <p className="text-sm text-slate-400 text-center py-3">還沒有自訂欄位</p>
                : customColumns.map(col => (
                  <div key={col.id} className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    {editingColId === col.id ? (
                      <>
                        <input className="flex-1 text-sm border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                          value={editingColName} onChange={e => setEditingColName(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && saveEditColumn()} autoFocus />
                        <button onClick={saveEditColumn} className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">確定</button>
                        <button onClick={() => setEditingColId(null)} className="text-xs px-2.5 py-1.5 bg-slate-200 text-slate-600 rounded hover:bg-slate-300">取消</button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{col.name}</span>
                        <span className="text-xs text-slate-400 px-2 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-full">{col.type === "number" ? "數字" : "文字"}</span>
                        <button onClick={() => startEditColumn(col)} className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded">改名</button>
                        <button onClick={() => deleteColumn(col.id)} className="p-1 text-slate-300 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                ))
              }
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700">
              <p className="text-xs font-medium text-slate-500 mb-2">新增欄位</p>
              <div className="flex gap-2">
                <input className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="欄位名稱" value={newColName} onChange={e => setNewColName(e.target.value)} onKeyDown={e => e.key === "Enter" && addColumn()} />
                <select className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={newColType} onChange={e => setNewColType(e.target.value as "text" | "number")}>
                  <option value="text">文字</option>
                  <option value="number">數字</option>
                </select>
                <button onClick={addColumn} disabled={!newColName.trim()} className="flex items-center gap-1 text-sm px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {viewingImage && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4" onClick={() => setViewingImage(null)}>
          <div className="max-w-3xl max-h-full relative" onClick={e => e.stopPropagation()}>
            <img src={viewingImage.data} alt={viewingImage.name} className="max-w-full max-h-[80vh] rounded-xl shadow-2xl object-contain" />
            {viewingImage.caption && <div className="mt-3 text-center text-white text-sm bg-black/40 rounded-lg px-4 py-2">{viewingImage.caption}</div>}
            <button onClick={() => setViewingImage(null)} className="absolute -top-3 -right-3 p-2 bg-white/20 text-white rounded-full hover:bg-white/40 backdrop-blur-sm"><X className="w-5 h-5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, color, bg }: { label: string; value: string; sub?: string; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-xl p-4 border border-slate-100 dark:border-slate-700`}>
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
