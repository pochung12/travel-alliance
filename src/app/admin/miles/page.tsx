"use client";
import { useEffect, useState } from "react";
import {
  supabase, MileageListing, MileageInquiry, MileageListingStatus,
  MILEAGE_AIRLINES, MILEAGE_CABINS,
} from "@/lib/supabase";
import {
  Coins, Plane, Loader2, CheckCircle2, XCircle, Trash2, Phone,
  ChevronDown, ChevronRight, Handshake, RotateCcw, MessageCircle, CalendarDays,
} from "lucide-react";

function airlineOf(key: string) {
  return MILEAGE_AIRLINES.find(a => a.key === key) || MILEAGE_AIRLINES[MILEAGE_AIRLINES.length - 1];
}
function cabinLabel(key: string) {
  return MILEAGE_CABINS.find(c => c.key === key)?.label || "";
}
function fmtDT(d: string) {
  return new Date(d).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_TABS: { key: MileageListingStatus; label: string; color: string }[] = [
  { key: "pending", label: "待審核", color: "text-amber-600 border-amber-500" },
  { key: "open",    label: "上架中", color: "text-sky-600 border-sky-500" },
  { key: "matched", label: "已媒合", color: "text-emerald-600 border-emerald-500" },
  { key: "closed",  label: "已關閉", color: "text-slate-500 border-slate-400" },
];

export default function AdminMilesPage() {
  const [listings, setListings]   = useState<MileageListing[]>([]);
  const [inquiries, setInquiries] = useState<MileageInquiry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<MileageListingStatus>("pending");
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [acting, setActing]       = useState<string | null>(null);

  const load = async () => {
    const [{ data: ls }, { data: iq }] = await Promise.all([
      supabase.from("mileage_listings").select("*").order("created_at", { ascending: false }),
      supabase.from("mileage_inquiries").select("*").order("created_at", { ascending: false }),
    ]);
    setListings((ls || []) as MileageListing[]);
    setInquiries((iq || []) as MileageInquiry[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: MileageListingStatus) => {
    setActing(id);
    const { error } = await supabase.from("mileage_listings")
      .update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (!error) setListings(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    setActing(null);
  };

  const removeListing = async (id: string) => {
    if (!confirm("確定刪除此刊登？相關媒合意願也會一併刪除。")) return;
    setActing(id);
    const { error } = await supabase.from("mileage_listings").delete().eq("id", id);
    if (!error) {
      setListings(prev => prev.filter(l => l.id !== id));
      setInquiries(prev => prev.filter(i => i.listing_id !== id));
    }
    setActing(null);
  };

  const toggleHandled = async (inq: MileageInquiry) => {
    const next = !inq.handled;
    const { error } = await supabase.from("mileage_inquiries").update({ handled: next }).eq("id", inq.id);
    if (!error) setInquiries(prev => prev.map(i => i.id === inq.id ? { ...i, handled: next } : i));
  };

  const countOf = (s: MileageListingStatus) => listings.filter(l => l.status === s).length;
  const shown = listings.filter(l => l.status === tab);
  const inquiriesOf = (id: string) => inquiries.filter(i => i.listing_id === id);
  const unhandledTotal = inquiries.filter(i => !i.handled).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Coins className="w-5 h-5 text-sky-600" /> 哩程交易管理
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            審核刊登、查看媒合意願、撮合買賣雙方
            {unhandledTotal > 0 && (
              <span className="ml-2 text-orange-500 font-semibold">● {unhandledTotal} 筆意願待處理</span>
            )}
          </p>
        </div>
        <a href="/miles" target="_blank" rel="noopener noreferrer"
          className="text-xs border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 hover:border-sky-400 hover:text-sky-600 px-3 py-2 rounded-lg transition-colors">
          查看前台頁面 ↗
        </a>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 gap-0.5 overflow-x-auto scrollbar-none">
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors shrink-0 ${
              tab === t.key ? t.color : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            }`}>
            {t.label}
            <span className="ml-1.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-1.5 py-0.5 rounded-full">
              {countOf(t.key)}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /></div>
      ) : shown.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
          <Coins className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">此狀態沒有刊登</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(l => {
            const al = airlineOf(l.airline);
            const iqs = inquiriesOf(l.id);
            const unhandled = iqs.filter(i => !i.handled).length;
            const isOpen = expanded.has(l.id);
            const total = Math.round((l.miles / 1000) * l.price_per_k);
            return (
              <div key={l.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                {/* Main row */}
                <div className="p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          l.type === "sell" ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" : "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300"
                        }`}>
                          {l.type === "sell" ? "賣" : "買"}
                        </span>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${al.color}`}>{al.short}</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {l.miles > 0 ? `${l.miles.toLocaleString()} 哩` : "哩數未定"}
                        </span>
                        {l.price_per_k > 0 && (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                            NT${l.price_per_k.toLocaleString()}/千哩
                            {l.miles > 0 && <span className="text-slate-400 font-normal">（約 NT${total.toLocaleString()}）</span>}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                          <Phone className="w-3 h-3" /> {l.contact_name}・{l.contact_info}
                        </span>
                        {l.type === "buy" && l.route && <span><Plane className="w-3 h-3 inline mr-0.5" />{l.route}{l.cabin ? `（${cabinLabel(l.cabin)}）` : ""}</span>}
                        {l.type === "buy" && l.travel_date && <span><CalendarDays className="w-3 h-3 inline mr-0.5" />{l.travel_date}</span>}
                        {l.type === "sell" && l.expiry_date && <span><CalendarDays className="w-3 h-3 inline mr-0.5" />效期 {new Date(l.expiry_date).toLocaleDateString("zh-TW")}</span>}
                        <span className="text-slate-400">{fmtDT(l.created_at)} 刊登</span>
                      </div>
                      {l.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{l.notes}</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {l.status === "pending" && (
                        <>
                          <button onClick={() => setStatus(l.id, "open")} disabled={acting === l.id}
                            className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 核准上架
                          </button>
                          <button onClick={() => setStatus(l.id, "closed")} disabled={acting === l.id}
                            className="flex items-center gap-1 text-xs border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-red-500 hover:border-red-300 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                            <XCircle className="w-3.5 h-3.5" /> 退回
                          </button>
                        </>
                      )}
                      {l.status === "open" && (
                        <>
                          <button onClick={() => setStatus(l.id, "matched")} disabled={acting === l.id}
                            className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                            <Handshake className="w-3.5 h-3.5" /> 標記已媒合
                          </button>
                          <button onClick={() => setStatus(l.id, "closed")} disabled={acting === l.id}
                            className="flex items-center gap-1 text-xs border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-orange-500 hover:border-orange-300 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                            <XCircle className="w-3.5 h-3.5" /> 下架
                          </button>
                        </>
                      )}
                      {(l.status === "matched" || l.status === "closed") && (
                        <button onClick={() => setStatus(l.id, "open")} disabled={acting === l.id}
                          className="flex items-center gap-1 text-xs border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-sky-600 hover:border-sky-300 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                          <RotateCcw className="w-3.5 h-3.5" /> 重新上架
                        </button>
                      )}
                      <button onClick={() => removeListing(l.id)} disabled={acting === l.id}
                        className="p-1.5 text-slate-300 hover:text-white hover:bg-red-500 rounded-lg transition-colors" title="刪除刊登">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 意願 toggle */}
                  <button
                    onClick={() => setExpanded(prev => {
                      const s = new Set(prev);
                      if (s.has(l.id)) s.delete(l.id); else s.add(l.id);
                      return s;
                    })}
                    className="mt-3 flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline">
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <MessageCircle className="w-3.5 h-3.5" />
                    媒合意願 {iqs.length} 筆
                    {unhandled > 0 && (
                      <span className="bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300 px-1.5 py-0.5 rounded-full font-semibold">
                        {unhandled} 待處理
                      </span>
                    )}
                  </button>
                </div>

                {/* Inquiries */}
                {isOpen && (
                  <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-700/20 px-4 md:px-5 py-3">
                    {iqs.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">還沒有人表達媒合意願</p>
                    ) : (
                      <div className="space-y-2">
                        {iqs.map(iq => (
                          <div key={iq.id} className="flex items-start justify-between gap-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 px-3.5 py-2.5">
                            <div className="text-xs">
                              <div className="font-semibold text-slate-700 dark:text-slate-200">
                                {iq.name}
                                <span className="ml-2 font-normal text-slate-500">{iq.contact_info}</span>
                                <span className="ml-2 font-normal text-slate-400">{fmtDT(iq.created_at)}</span>
                              </div>
                              {iq.message && <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{iq.message}</p>}
                            </div>
                            <button onClick={() => toggleHandled(iq)}
                              className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                                iq.handled
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                  : "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300 hover:bg-orange-200"
                              }`}>
                              {iq.handled ? "✓ 已聯繫" : "待處理"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
