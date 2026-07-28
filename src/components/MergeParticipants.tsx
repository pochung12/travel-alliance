"use client";
import { useState } from "react";
import { supabase, Customer, CustomerTour } from "@/lib/supabase";
import { GitMerge, Loader2, X, CheckCircle2, AlertCircle } from "lucide-react";

type Part = CustomerTour & { customer: Customer };
type Side = "a" | "b";

interface DupPair {
  id: string;
  reasons: string[];
  a: Part; b: Part;
  selected: boolean;
  keep: Side;                       // 保留哪一位為主帳號
  choices: Record<string, Side>;    // 各欄位取哪一側
  smart: Record<string, string>;    // 自動判斷原因
}

const FIELDS: { key: keyof Customer; label: string; linked?: keyof Customer }[] = [
  { key: "name",              label: "姓名" },
  { key: "name_en",           label: "英文姓名" },
  { key: "phone",             label: "電話" },
  { key: "email",             label: "Email" },
  { key: "birthday",          label: "生日" },
  { key: "id_number",         label: "身分證字號", linked: "id_card_image" },
  { key: "passport",          label: "護照號碼",   linked: "passport_image" },
  { key: "passport_expiry",   label: "護照效期" },
  { key: "taibao_number",     label: "台胞證號碼", linked: "taibao_image" },
  { key: "taibao_expiry",     label: "台胞證效期" },
  { key: "address",           label: "地址" },
  { key: "emergency_contact", label: "緊急聯絡人" },
  { key: "emergency_phone",   label: "緊急電話" },
  { key: "notes",             label: "備註" },
  { key: "meal_preference",   label: "餐食偏好" },
];
const ALL_KEYS: (keyof Customer)[] = [
  "name", "name_en", "phone", "email", "birthday", "gender", "address",
  "emergency_contact", "emergency_phone", "notes", "meal_preference",
  "id_number", "id_card_image", "passport", "passport_expiry", "passport_image",
  "taibao_number", "taibao_expiry", "taibao_image",
];

const normName = (s: string) => (s || "").replace(/[\s·・.]/g, "").trim();
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1]
      : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

// 智慧預選：證件取效期較新者，其他欄位非空優先
function buildChoices(a: Customer, b: Customer) {
  const choices: Record<string, Side> = {};
  const smart: Record<string, string> = {};
  const newer = (da?: string | null, db?: string | null): Side | null => {
    if (!da && !db) return null;
    if (!da) return "b";
    if (!db) return "a";
    return new Date(da) >= new Date(db) ? "a" : "b";
  };
  const pass = newer(a.passport_expiry, b.passport_expiry) ?? (a.passport ? "a" : b.passport ? "b" : "a");
  choices.passport = pass; choices.passport_expiry = pass; choices.passport_image = pass;
  if (a.passport_expiry && b.passport_expiry) smart.passport = `效期較新（${pass === "a" ? a.passport_expiry : b.passport_expiry}）`;
  else if (a.passport || b.passport) smart.passport = "僅一方有護照";

  const tb = newer(a.taibao_expiry, b.taibao_expiry) ?? (a.taibao_number ? "a" : b.taibao_number ? "b" : "a");
  choices.taibao_number = tb; choices.taibao_expiry = tb; choices.taibao_image = tb;
  if (a.taibao_expiry && b.taibao_expiry) smart.taibao_number = `效期較新（${tb === "a" ? a.taibao_expiry : b.taibao_expiry}）`;
  else if (a.taibao_number || b.taibao_number) smart.taibao_number = "僅一方有台胞證";

  for (const k of ["name", "name_en", "phone", "email", "birthday", "gender", "id_number", "id_card_image",
    "address", "emergency_contact", "emergency_phone", "notes", "meal_preference"] as (keyof Customer)[]) {
    const va = (a[k] as string) || "", vb = (b[k] as string) || "";
    if (!va && vb) { choices[k] = "b"; smart[k] = "僅乙方有資料"; }
    else { choices[k] = "a"; if (va && !vb) smart[k] = "僅甲方有資料"; }
  }
  return { choices, smart };
}

interface Props {
  tourId: string;
  participants: Part[];
  onDone: () => void;
}

export default function MergeParticipants({ tourId, participants, onDone }: Props) {
  const [open, setOpen]       = useState(false);
  const [pairs, setPairs]     = useState<DupPair[]>([]);
  const [merging, setMerging] = useState(false);
  const [result, setResult]   = useState<{ merged: number } | null>(null);

  // ── 偵測本團內的重複旅客 ────────────────────────────────────────────────────
  const scan = () => {
    const map = new Map<string, DupPair>();
    const add = (x: Part, y: Part, reason: string) => {
      const [p, q] = x.customer.id < y.customer.id ? [x, y] : [y, x];
      const key = `${p.customer.id}|${q.customer.id}`;
      const exist = map.get(key);
      if (exist) { if (!exist.reasons.includes(reason)) exist.reasons.push(reason); return; }
      const { choices, smart } = buildChoices(p.customer, q.customer);
      map.set(key, { id: key, reasons: [reason], a: p, b: q, selected: true, keep: "a", choices, smart });
    };

    const byKey = (get: (c: Customer) => string, reason: string) => {
      const g = new Map<string, Part[]>();
      participants.forEach(p => {
        const k = get(p.customer);
        if (!k) return;
        if (!g.has(k)) g.set(k, []);
        g.get(k)!.push(p);
      });
      g.forEach(list => {
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++) add(list[i], list[j], reason);
      });
    };

    byKey(c => normName(c.name).toLowerCase(), "姓名相同");
    byKey(c => (c.passport || "").trim().toUpperCase(), "護照號碼相同");
    byKey(c => (c.id_number || "").trim().toUpperCase(), "身分證字號相同");
    byKey(c => (c.taibao_number || "").trim().toUpperCase(), "台胞證號碼相同");
    byKey(c => {
      const k = (c.phone || "").replace(/[\s\-()+]/g, "").replace(/^886/, "0");
      return k.length >= 8 ? k : "";
    }, "手機號碼相同");

    // 姓名相似（差1字）／生日相同且姓名相似
    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        const a = participants[i].customer, b = participants[j].customer;
        const na = normName(a.name), nb = normName(b.name);
        if (na && nb && na !== nb && na.length >= 3 && nb.length >= 3 && editDistance(na, nb) === 1)
          add(participants[i], participants[j], "姓名相似（差1字）");
        if (a.birthday && b.birthday && a.birthday === b.birthday &&
            na.length >= 2 && nb.length >= 2 && na.slice(0, 2) === nb.slice(0, 2))
          add(participants[i], participants[j], "生日相同且姓名相似");
      }
    }

    setPairs(Array.from(map.values()));
    setResult(null);
    setOpen(true);
  };

  const setChoice = (pi: number, key: string, side: Side) => {
    setPairs(prev => prev.map((p, i) => {
      if (i !== pi) return p;
      const next = { ...p.choices, [key]: side };
      const fd = FIELDS.find(f => f.key === key);
      if (fd?.linked) next[fd.linked] = side;
      return { ...p, choices: next };
    }));
  };

  // ── 執行合併 ────────────────────────────────────────────────────────────────
  const run = async () => {
    const todo = pairs.filter(p => p.selected);
    if (!todo.length) return;
    setMerging(true);
    let merged = 0;

    for (const p of todo) {
      const primary   = p.keep === "a" ? p.a : p.b;
      const secondary = p.keep === "a" ? p.b : p.a;
      const A = p.a.customer, B = p.b.customer;

      // 1) 合併旅客欄位
      const patch: Record<string, unknown> = {};
      for (const k of ALL_KEYS) {
        const side = p.choices[k] ?? p.keep;
        patch[k] = (side === "a" ? A[k] : B[k]) ?? "";
      }
      for (const dk of ["birthday", "passport_expiry", "taibao_expiry"]) {
        if (!patch[dk]) patch[dk] = null;
      }
      await supabase.from("customers").update(patch).eq("id", primary.customer.id);

      // 2) 合併本團報名資料（金額相加、非空保留、已訂票取聯集）
      const ctPatch: Record<string, unknown> = {
        paid_amount:     (primary.paid_amount || 0) + (secondary.paid_amount || 0),
        deposit_amount:  (primary.deposit_amount || 0) + (secondary.deposit_amount || 0),
        balance_amount:  (primary.balance_amount || 0) + (secondary.balance_amount || 0),
        room_number:     primary.room_number || secondary.room_number || "",
        meal_preference: primary.meal_preference || secondary.meal_preference || "",
        notes:           [primary.notes, secondary.notes].filter(Boolean).join(" / "),
        participant_type: primary.participant_type && primary.participant_type !== "adult"
          ? primary.participant_type
          : (secondary.participant_type || primary.participant_type || "adult"),
        status: primary.status === "confirmed" || secondary.status === "confirmed" ? "confirmed" : primary.status,
      };
      if (primary.ticket_booked !== undefined || secondary.ticket_booked !== undefined) {
        ctPatch.ticket_booked = !!(primary.ticket_booked || secondary.ticket_booked);
      }
      const { error: ctErr } = await supabase.from("customer_tours").update(ctPatch).eq("id", primary.id);
      if (ctErr && ctPatch.ticket_booked !== undefined) {
        // ticket_booked 欄位可能尚未建立 → 移除後重試
        delete ctPatch.ticket_booked;
        await supabase.from("customer_tours").update(ctPatch).eq("id", primary.id);
      }

      // 3) 收付款紀錄的旅客連結改指向主帳號（避免刪除後失聯）
      const { data: pays } = await supabase
        .from("tour_payments").select("id,customer_ids").eq("tour_id", tourId);
      for (const pay of (pays || []) as { id: string; customer_ids: string[] | null }[]) {
        const ids = pay.customer_ids || [];
        if (!ids.includes(secondary.customer.id)) continue;
        const next = Array.from(new Set(ids.map(x => x === secondary.customer.id ? primary.customer.id : x)));
        await supabase.from("tour_payments").update({ customer_ids: next }).eq("id", pay.id);
      }

      // 4) 其他團的報名記錄轉移（同團的次要報名直接刪除，已併入主帳號）
      const { data: primTours } = await supabase
        .from("customer_tours").select("tour_id").eq("customer_id", primary.customer.id);
      const primTourIds = new Set((primTours || []).map((r: { tour_id: string }) => r.tour_id));
      const { data: secTours } = await supabase
        .from("customer_tours").select("id,tour_id").eq("customer_id", secondary.customer.id);
      const secArr = (secTours || []) as { id: string; tour_id: string }[];
      const delIds = secArr.filter(t => primTourIds.has(t.tour_id)).map(t => t.id);
      const movIds = secArr.filter(t => !primTourIds.has(t.tour_id)).map(t => t.id);
      if (delIds.length) await supabase.from("customer_tours").delete().in("id", delIds);
      if (movIds.length) await supabase.from("customer_tours").update({ customer_id: primary.customer.id }).in("id", movIds);

      // 5) 標籤轉移（去重）
      const { data: pl } = await supabase.from("customer_labels").select("label_id").eq("customer_id", primary.customer.id);
      const have = new Set((pl || []).map((r: { label_id: string }) => r.label_id));
      const { data: sl } = await supabase.from("customer_labels").select("id,label_id").eq("customer_id", secondary.customer.id);
      const slArr = (sl || []) as { id: string; label_id: string }[];
      const lDel = slArr.filter(l => have.has(l.label_id)).map(l => l.id);
      const lMov = slArr.filter(l => !have.has(l.label_id)).map(l => l.id);
      if (lDel.length) await supabase.from("customer_labels").delete().in("id", lDel);
      if (lMov.length) await supabase.from("customer_labels").update({ customer_id: primary.customer.id }).in("id", lMov);

      // 6) 刪除次要旅客
      await supabase.from("customers").delete().eq("id", secondary.customer.id);
      merged++;
    }

    setMerging(false);
    setResult({ merged });
    onDone();
  };

  const selCount = pairs.filter(p => p.selected).length;

  return (
    <>
      <button onClick={scan}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors">
        <GitMerge className="w-3.5 h-3.5" />
        <span>合併重複</span>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-violet-600" /> 合併本團重複旅客
              </h3>
              <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {result ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">合併完成！</p>
                  <p className="text-sm text-slate-500 mt-1">已合併 <strong className="text-violet-600">{result.merged}</strong> 組重複旅客</p>
                  <button onClick={() => setOpen(false)} className="mt-5 bg-violet-600 hover:bg-violet-700 text-white px-8 py-2.5 rounded-xl text-sm font-medium">完成</button>
                </div>
              ) : pairs.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">沒有偵測到重複的旅客</p>
                  <p className="text-xs mt-1">（比對姓名、護照/台胞證/身分證號、電話、生日）</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">找到 <strong className="text-violet-600">{pairs.length}</strong> 組疑似重複</span>
                    <div className="flex gap-2">
                      <button onClick={() => setPairs(p => p.map(x => ({ ...x, selected: true })))} className="text-violet-600 hover:underline">全選</button>
                      <button onClick={() => setPairs(p => p.map(x => ({ ...x, selected: false })))} className="text-slate-400 hover:underline">取消全選</button>
                    </div>
                  </div>

                  {pairs.map((p, pi) => {
                    const A = p.a.customer, B = p.b.customer;
                    return (
                      <div key={p.id} className={`rounded-xl border-2 p-3 transition-colors ${p.selected ? "border-violet-300 dark:border-violet-700 bg-violet-50/40 dark:bg-violet-900/10" : "border-slate-200 dark:border-slate-600"}`}>
                        <div className="flex items-start gap-2 mb-2.5">
                          <input type="checkbox" checked={p.selected}
                            onChange={e => setPairs(prev => prev.map((x, i) => i === pi ? { ...x, selected: e.target.checked } : x))}
                            className="mt-0.5 w-4 h-4 accent-violet-600" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{A.name} ⟷ {B.name}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {p.reasons.map(r => (
                                <span key={r} className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">{r}</span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* 保留哪一位 */}
                        <div className="flex items-center gap-2 mb-2 text-xs">
                          <span className="text-slate-400">保留為主資料：</span>
                          {(["a", "b"] as Side[]).map(s => (
                            <button key={s} onClick={() => setPairs(prev => prev.map((x, i) => i === pi ? { ...x, keep: s } : x))}
                              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${p.keep === s ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>
                              {s === "a" ? "甲" : "乙"}：{(s === "a" ? A : B).name}
                            </button>
                          ))}
                        </div>

                        {/* 欄位選擇（只顯示兩邊有差異的） */}
                        <div className="rounded-lg border border-slate-200 dark:border-slate-600 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
                          {FIELDS.filter(f => ((A[f.key] as string) || "") !== ((B[f.key] as string) || "")).map(f => {
                            const va = (A[f.key] as string) || "", vb = (B[f.key] as string) || "";
                            const cur = p.choices[f.key] ?? p.keep;
                            return (
                              <div key={f.key} className="flex items-center gap-2 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800">
                                <span className="w-20 shrink-0 text-slate-400">{f.label}</span>
                                {(["a", "b"] as Side[]).map(s => {
                                  const v = s === "a" ? va : vb;
                                  return (
                                    <button key={s} onClick={() => setChoice(pi, f.key, s)}
                                      className={`flex-1 min-w-0 text-left px-2 py-1 rounded border transition-colors truncate ${
                                        cur === s ? "border-violet-400 bg-violet-50 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200 font-medium"
                                          : "border-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                                      title={v || "（空）"}>
                                      {v || <span className="text-slate-300">（空）</span>}
                                    </button>
                                  );
                                })}
                                {p.smart[f.key] && <span className="shrink-0 text-[10px] text-emerald-600">{p.smart[f.key]}</span>}
                              </div>
                            );
                          })}
                        </div>

                        <p className="text-[10px] text-slate-400 mt-1.5">
                          合併後：本團的訂金/尾款/已收金額會相加、房號與餐食保留非空值、收付款紀錄自動改指向保留的旅客。
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {!result && pairs.length > 0 && (
              <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3 shrink-0">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  {selCount > 0 ? `已選 ${selCount} 組，合併後將刪除重複的旅客資料` : "請勾選要合併的組別"}
                </span>
                <button onClick={run} disabled={merging || selCount === 0}
                  className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-5 py-2 rounded-xl disabled:opacity-40 transition-colors">
                  {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                  {merging ? "合併中…" : `確認合併 ${selCount} 組`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
