"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Save, Loader2, CheckCircle2 } from "lucide-react";

type Accent = "emerald" | "rose" | "amber";

const ACCENT: Record<Accent, { chip: string; btn: string; ring: string }> = {
  emerald: {
    chip: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300",
    btn:  "bg-emerald-600 hover:bg-emerald-700",
    ring: "focus:ring-emerald-400",
  },
  rose: {
    chip: "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300",
    btn:  "bg-rose-600 hover:bg-rose-700",
    ring: "focus:ring-rose-400",
  },
  amber: {
    chip: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300",
    btn:  "bg-amber-600 hover:bg-amber-700",
    ring: "focus:ring-amber-400",
  },
};

interface Props {
  title: string;                 // 例：✅ 費用包含
  items: string[];
  placeholder?: string;
  accent?: Accent;
  hint?: string;
  onSave: (items: string[]) => Promise<void>;
}

/** 字串清單編輯器：逐項編輯 / 新增 / 刪除 / 上下移動，統一儲存 */
export default function PageListEditor({
  title, items, placeholder, accent = "emerald", hint, onSave,
}: Props) {
  const [draft, setDraft] = useState<string[]>(items);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const A = ACCENT[accent];

  // 外部內容變動（重新生成、切換版本）時同步回來
  useEffect(() => { setDraft(items); }, [items]);

  const dirty = draft.length !== items.length || draft.some((v, i) => v !== items[i]);

  const update = (i: number, v: string) => setDraft(p => p.map((x, k) => k === i ? v : x));
  const remove = (i: number) => setDraft(p => p.filter((_, k) => k !== i));
  const add    = () => { setDraft(p => [...p, ""]); setOpen(true); };
  const move   = (i: number, dir: -1 | 1) => setDraft(p => {
    const j = i + dir;
    if (j < 0 || j >= p.length) return p;
    const n = p.slice();
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  const save = async () => {
    setSaving(true);
    try {
      // 儲存時去掉全空白項目
      await onSave(draft.map(s => s.trim()).filter(Boolean));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        <button onClick={() => setOpen(v => !v)}
          className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 hover:text-violet-600 transition-colors">
          {title}（{items.length} 項）
          <span className="text-violet-500 underline font-normal">{open ? "收合" : "展開編輯"}</span>
        </button>
        <div className="flex items-center gap-2">
          {saved && !dirty && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> 已儲存
            </span>
          )}
          {dirty && (
            <button onClick={save} disabled={saving}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 text-white rounded-lg disabled:opacity-40 transition-colors ${A.btn}`}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} 儲存
            </button>
          )}
        </div>
      </div>

      {hint && open && (
        <p className="text-[11px] text-slate-400 mb-1.5">{hint}</p>
      )}

      {open ? (
        <div className="space-y-1.5">
          {draft.map((v, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="shrink-0 mt-2 w-5 text-[11px] text-slate-300 dark:text-slate-500 text-right">{i + 1}.</span>
              <textarea
                rows={1}
                className={`flex-1 min-w-0 text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 ${A.ring} resize-y`}
                placeholder={placeholder}
                value={v}
                onChange={e => update(i, e.target.value)}
              />
              <div className="flex flex-col shrink-0">
                <button onClick={() => move(i, -1)} disabled={i === 0} title="上移"
                  className="p-0.5 text-slate-400 hover:text-violet-600 disabled:opacity-20 disabled:cursor-default rounded transition-colors">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === draft.length - 1} title="下移"
                  className="p-0.5 text-slate-400 hover:text-violet-600 disabled:opacity-20 disabled:cursor-default rounded transition-colors">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <button onClick={() => remove(i)} title="刪除此項"
                className="shrink-0 mt-1 p-1 text-slate-300 hover:text-white hover:bg-red-500 rounded-lg transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {draft.length === 0 && (
            <p className="text-[11px] text-slate-400 py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-700/40">
              目前沒有項目，點下方「新增一項」開始填寫
            </p>
          )}
          <button onClick={add}
            className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-700 font-medium pt-0.5">
            <Plus className="w-3.5 h-3.5" /> 新增一項
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.length === 0 && <span className="text-[11px] text-slate-400">尚未填寫</span>}
          {items.map((s, i) => (
            <span key={i} className={`text-[11px] px-2.5 py-1 rounded-full max-w-full truncate ${A.chip}`} title={s}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
