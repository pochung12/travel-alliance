"use client";
import { useState } from "react";
import { Sparkles, Loader2, X, RefreshCw, Check, AlertCircle } from "lucide-react";

const OPTIONS = [
  { key: "longer",  label: "增加字數" },
  { key: "premium", label: "高級感" },
  { key: "days",    label: "寫出天數" },
  { key: "hotel",   label: "飯店特色" },
  { key: "spots",   label: "景點特色" },
] as const;

interface Props {
  currentName: string;
  destination: string;
  days: number;
  onPick: (name: string) => void;
}

export default function TourNameGenerator({ currentName, destination, days, onPick }: Props) {
  const [open, setOpen]       = useState(false);
  const [opts, setOpts]       = useState<Set<string>>(new Set());
  const [extra, setExtra]     = useState("");
  const [names, setNames]     = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [picked, setPicked]   = useState("");

  const toggle = (key: string) =>
    setOpts(prev => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tour-name/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentName,
          destination,
          days,
          options: Array.from(opts),
          extra,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "生成失敗，請重試"); return; }
      setNames(json.names || []);
      setPicked("");
    } catch {
      setError("生成失敗，請檢查網路後重試");
    } finally {
      setLoading(false);
    }
  };

  const pick = (n: string) => {
    onPick(n);
    setPicked(n);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all shadow-sm shrink-0"
      >
        <Sparkles className="w-3.5 h-3.5" />
        AI 生成團名
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] sm:w-[400px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-violet-500" /> AI 生成團名
            </h4>
            <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 偏好選項 */}
          <div>
            <span className="text-xs text-slate-400 block mb-1.5">命名偏好（可複選）</span>
            <div className="flex flex-wrap gap-1.5">
              {OPTIONS.map(o => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => toggle(o.key)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    opts.has(o.key)
                      ? "bg-violet-600 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:text-violet-600"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* 補充素材 */}
          <input
            className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
            placeholder="補充素材（選填）：飯店名、景點、行程亮點…"
            value={extra}
            onChange={e => setExtra(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !loading && generate()}
          />

          {/* 生成按鈕 */}
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 text-sm px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium disabled:opacity-50 transition-colors"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> 生成中…</>
              : names.length > 0
                ? <><RefreshCw className="w-4 h-4" /> 重新生成</>
                : <><Sparkles className="w-4 h-4" /> 生成 6 個團名</>
            }
          </button>

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </p>
          )}

          {/* 候選清單 */}
          {names.length > 0 && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              <span className="text-xs text-slate-400 block">點選套用：</span>
              {names.map((n, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(n)}
                  className={`w-full text-left text-sm px-3.5 py-2.5 rounded-xl border transition-colors flex items-center gap-2 ${
                    picked === n
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium"
                      : "border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-900/20"
                  }`}
                >
                  {picked === n && <Check className="w-4 h-4 shrink-0 text-violet-600" />}
                  <span className="flex-1">{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
