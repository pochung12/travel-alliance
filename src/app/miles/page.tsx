"use client";
import { useEffect, useState } from "react";
import {
  Plane, Coins, X, Send, Loader2, CheckCircle2,
  CalendarDays, ShieldCheck, Handshake, BadgePercent, MessageCircle,
} from "lucide-react";
import {
  supabase, MileageListing, MILEAGE_AIRLINES, MILEAGE_CABINS,
} from "@/lib/supabase";
import PublicNavbar from "@/components/PublicNavbar";

// ── Helpers ───────────────────────────────────────────────────────────────────
function airlineOf(key: string) {
  return MILEAGE_AIRLINES.find(a => a.key === key) || MILEAGE_AIRLINES[MILEAGE_AIRLINES.length - 1];
}
function cabinLabel(key: string) {
  return MILEAGE_CABINS.find(c => c.key === key)?.label || "";
}
function maskName(name: string) {
  if (!name) return "匿名";
  return name.slice(0, 1) + "◯◯";
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
}

const EMPTY_POST = {
  type: "sell" as "sell" | "buy",
  airline: "eva",
  miles: 0,
  price_per_k: 0,
  expiry_date: "",
  route: "",
  travel_date: "",
  cabin: "economy",
  notes: "",
  contact_name: "",
  contact_info: "",
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function MilesPage() {
  const [listings, setListings] = useState<MileageListing[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<"sell" | "buy">("sell");
  const [airlineFilter, setAirlineFilter] = useState("");

  // 刊登表單
  const [showPost, setShowPost] = useState(false);
  const [post, setPost]         = useState({ ...EMPTY_POST });
  const [posting, setPosting]   = useState(false);
  const [postDone, setPostDone] = useState(false);
  const [postErr, setPostErr]   = useState("");

  // 媒合意願
  const [inquiryFor, setInquiryFor] = useState<MileageListing | null>(null);
  const [inq, setInq]               = useState({ name: "", contact_info: "", message: "" });
  const [inquiring, setInquiring]   = useState(false);
  const [inqDone, setInqDone]       = useState(false);
  const [inqErr, setInqErr]         = useState("");

  useEffect(() => {
    supabase
      .from("mileage_listings")
      .select("id,type,airline,miles,price_per_k,expiry_date,route,travel_date,cabin,notes,contact_name,status,created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setListings((data || []) as unknown as MileageListing[]);
        setLoading(false);
      });
  }, []);

  const filtered = listings.filter(l =>
    l.type === tab && (!airlineFilter || l.airline === airlineFilter));

  const openPost = (type: "sell" | "buy") => {
    setPost({ ...EMPTY_POST, type });
    setPostDone(false);
    setPostErr("");
    setShowPost(true);
  };

  const submitPost = async () => {
    if (!post.contact_name.trim() || !post.contact_info.trim()) {
      setPostErr("請填寫姓名與聯絡方式"); return;
    }
    if (post.type === "sell" && (!post.miles || !post.price_per_k)) {
      setPostErr("請填寫哩數與每千哩開價"); return;
    }
    if (post.type === "buy" && !post.route.trim() && !post.miles) {
      setPostErr("請至少填寫需求航線或需求哩數"); return;
    }
    setPosting(true);
    setPostErr("");
    const { error } = await supabase.from("mileage_listings").insert([{
      type: post.type,
      airline: post.airline,
      miles: post.miles || 0,
      price_per_k: post.price_per_k || 0,
      expiry_date: post.expiry_date || null,
      route: post.route.trim(),
      travel_date: post.travel_date.trim(),
      cabin: post.type === "buy" ? post.cabin : "",
      notes: post.notes.trim(),
      contact_name: post.contact_name.trim(),
      contact_info: post.contact_info.trim(),
      status: "pending",
    }]);
    setPosting(false);
    if (error) { setPostErr("送出失敗：" + error.message); return; }
    setPostDone(true);
    // 橋接：刊登者進 CRM（fire-and-forget，不影響流程）
    fetch("/api/bridge/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "mileage_listing",
        name: post.contact_name.trim(),
        contact: post.contact_info.trim(),
        airline: airlineOf(post.airline).label,
        miles: post.miles || 0,
        listing_type: post.type,
      }),
    }).catch(() => {});
  };

  const submitInquiry = async () => {
    if (!inquiryFor) return;
    if (!inq.name.trim() || !inq.contact_info.trim()) {
      setInqErr("請填寫姓名與聯絡方式"); return;
    }
    setInquiring(true);
    setInqErr("");
    const { error } = await supabase.from("mileage_inquiries").insert([{
      listing_id: inquiryFor.id,
      name: inq.name.trim(),
      contact_info: inq.contact_info.trim(),
      message: inq.message.trim(),
    }]);
    setInquiring(false);
    if (error) { setInqErr("送出失敗：" + error.message); return; }
    setInqDone(true);
    // 橋接：意願者進 CRM（fire-and-forget，不影響流程）
    fetch("/api/bridge/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "mileage_inquiry",
        name: inq.name.trim(),
        contact: inq.contact_info.trim(),
        airline: airlineOf(inquiryFor.airline).label,
        miles: inquiryFor.miles || 0,
        listing_type: inquiryFor.type,
        message: inq.message.trim(),
      }),
    }).catch(() => {});
  };

  const inputCls = "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400";
  const lblCls = "block text-xs font-medium text-slate-500 mb-1";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <PublicNavbar />

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0c4a6e 0%, #075985 55%, #0369a1 100%)" }}>
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "32px 32px" }} />
        <div className="relative z-10 max-w-6xl mx-auto px-4 py-16 md:py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-sky-200 text-xs font-semibold px-4 py-1.5 rounded-full mb-5">
            <Coins className="w-3.5 h-3.5" /> Mileage Exchange
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight">
            哩程交易媒合平台
          </h1>
          <p className="text-sky-100 text-base md:text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
            哩程換機票，比現金買票划算得多。哩程太多用不完？想用哩程換便宜機票？
            <br className="hidden md:block" />
            交給暖心旅行社替您安全媒合。
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button onClick={() => openPost("sell")}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors shadow-lg">
              <Coins className="w-4.5 h-4.5" /> 我要賣哩程
            </button>
            <button onClick={() => openPost("buy")}
              className="flex items-center gap-2 bg-white text-sky-800 hover:bg-sky-50 font-semibold px-7 py-3.5 rounded-xl transition-colors shadow-lg">
              <Plane className="w-4.5 h-4.5" /> 我要買哩程／換機票
            </button>
          </div>
        </div>
      </section>

      {/* ── 流程說明 ─────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 -mt-8 relative z-20 mb-10">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {[
            { icon: Send,        title: "1. 免費刊登", desc: "填寫哩程資訊或購買需求，送出後由專員審核上架" },
            { icon: Handshake,   title: "2. 平台媒合", desc: "買賣雙方表達意願後，由暖心旅行社專員居中聯繫撮合" },
            { icon: ShieldCheck, title: "3. 安心交易", desc: "雙方確認條件後完成交易，全程有專人協助更有保障" },
          ].map((s) => (
            <div key={s.title} className="flex items-start gap-3.5 p-5 md:p-6">
              <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-slate-800 mb-1">{s.title}</div>
                <div className="text-xs text-slate-500 leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 列表 ─────────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        {/* Tabs */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl">
            <button onClick={() => setTab("sell")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === "sell" ? "bg-sky-600 text-white shadow-sm" : "text-slate-500 hover:text-sky-600"
              }`}>
              <Coins className="w-4 h-4" /> 出售哩程
              <span className="text-xs opacity-75">({listings.filter(l => l.type === "sell").length})</span>
            </button>
            <button onClick={() => setTab("buy")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === "buy" ? "bg-orange-500 text-white shadow-sm" : "text-slate-500 hover:text-orange-500"
              }`}>
              <Plane className="w-4 h-4" /> 收購需求
              <span className="text-xs opacity-75">({listings.filter(l => l.type === "buy").length})</span>
            </button>
          </div>
          {/* Airline filter */}
          <select value={airlineFilter} onChange={e => setAirlineFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-400">
            <option value="">全部航空</option>
            {MILEAGE_AIRLINES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse space-y-3">
                <div className="h-5 bg-slate-200 rounded w-1/2" />
                <div className="h-8 bg-slate-200 rounded w-2/3" />
                <div className="h-4 bg-slate-200 rounded w-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-100">
            <div className="text-5xl mb-4">{tab === "sell" ? "🪙" : "✈️"}</div>
            <p className="font-medium mb-1">目前沒有{tab === "sell" ? "出售中的哩程" : "收購需求"}</p>
            <p className="text-sm mb-5">成為第一個刊登的人吧！</p>
            <button onClick={() => openPost(tab)}
              className="text-sm bg-sky-600 hover:bg-sky-700 text-white font-medium px-6 py-2.5 rounded-xl transition-colors">
              立即刊登
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(l => {
              const al = airlineOf(l.airline);
              const total = Math.round((l.miles / 1000) * l.price_per_k);
              return (
                <div key={l.id}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 p-5 flex flex-col">
                  {/* Top */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${al.color}`}>{al.short}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      l.type === "sell" ? "bg-sky-50 text-sky-600" : "bg-orange-50 text-orange-500"
                    }`}>
                      {l.type === "sell" ? "出售" : "收購"}
                    </span>
                  </div>

                  {/* Miles + price */}
                  <div className="mb-3">
                    {l.miles > 0 && (
                      <div className="text-2xl font-bold text-slate-800">
                        {l.miles.toLocaleString()}
                        <span className="text-sm font-medium text-slate-400 ml-1">哩</span>
                      </div>
                    )}
                    {l.price_per_k > 0 && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <BadgePercent className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-sm font-semibold text-emerald-600">
                          NT${l.price_per_k.toLocaleString()} / 千哩
                        </span>
                        {l.miles > 0 && (
                          <span className="text-xs text-slate-400">（約 NT${total.toLocaleString()}）</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs text-slate-500 mb-4 flex-1">
                    {l.type === "buy" && l.route && (
                      <div className="flex items-center gap-1.5">
                        <Plane className="w-3.5 h-3.5 text-slate-400" /> 航線：{l.route}
                        {l.cabin && <span className="text-slate-400">（{cabinLabel(l.cabin)}）</span>}
                      </div>
                    )}
                    {l.type === "buy" && l.travel_date && (
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-slate-400" /> 期望出發：{l.travel_date}
                      </div>
                    )}
                    {l.type === "sell" && l.expiry_date && (
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                        哩程效期：{new Date(l.expiry_date).toLocaleDateString("zh-TW")}
                      </div>
                    )}
                    {l.notes && <p className="text-slate-500 leading-relaxed line-clamp-2">{l.notes}</p>}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                    <span className="text-xs text-slate-400">
                      {maskName(l.contact_name)} · {fmtDate(l.created_at)} 刊登
                    </span>
                    <button
                      onClick={() => { setInquiryFor(l); setInq({ name: "", contact_info: "", message: "" }); setInqDone(false); setInqErr(""); }}
                      className="flex items-center gap-1.5 text-xs bg-sky-600 hover:bg-sky-700 text-white font-semibold px-3.5 py-2 rounded-lg transition-colors">
                      <MessageCircle className="w-3.5 h-3.5" /> 我有興趣
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[11px] text-slate-400 leading-relaxed mt-8 text-center max-w-3xl mx-auto">
          本平台僅提供資訊刊登與媒合服務，刊登內容經審核後上架，聯絡資訊不公開顯示。
          交易條件由買賣雙方自行協商確認，建議全程透過暖心旅行社專員協助以保障雙方權益。
          哩程轉讓請遵循各航空公司會員條款規範。
        </p>
      </section>

      {/* ── 刊登 Modal ───────────────────────────────────────────────────────── */}
      {showPost && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowPost(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {postDone ? (
              <div className="p-10 text-center">
                <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-800 mb-2">刊登已送出！</h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-6">
                  專員審核後即會上架（通常 1 個工作天內），<br />媒合進度將透過您留下的聯絡方式通知。
                </p>
                <button onClick={() => setShowPost(false)}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-medium px-8 py-2.5 rounded-xl text-sm transition-colors">
                  完成
                </button>
              </div>
            ) : (
              <>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    {post.type === "sell" ? <><Coins className="w-5 h-5 text-sky-600" /> 刊登出售哩程</> : <><Plane className="w-5 h-5 text-orange-500" /> 刊登收購需求</>}
                  </h3>
                  <button onClick={() => setShowPost(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                  {/* type toggle */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button onClick={() => setPost(p => ({ ...p, type: "sell" }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${post.type === "sell" ? "bg-white text-sky-700 shadow-sm" : "text-slate-500"}`}>
                      我要賣哩程
                    </button>
                    <button onClick={() => setPost(p => ({ ...p, type: "buy" }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${post.type === "buy" ? "bg-white text-orange-600 shadow-sm" : "text-slate-500"}`}>
                      我要買哩程／換機票
                    </button>
                  </div>

                  <div>
                    <label className={lblCls}>航空哩程計畫 *</label>
                    <select className={inputCls} value={post.airline} onChange={e => setPost(p => ({ ...p, airline: e.target.value }))}>
                      {MILEAGE_AIRLINES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lblCls}>{post.type === "sell" ? "可售哩數 *" : "需求哩數"}</label>
                      <input type="number" min="0" className={inputCls} placeholder="例：80000"
                        value={post.miles || ""} onChange={e => setPost(p => ({ ...p, miles: +e.target.value }))} />
                    </div>
                    <div>
                      <label className={lblCls}>{post.type === "sell" ? "每千哩開價 (NT$) *" : "每千哩預算 (NT$)"}</label>
                      <input type="number" min="0" className={inputCls} placeholder="例：280"
                        value={post.price_per_k || ""} onChange={e => setPost(p => ({ ...p, price_per_k: +e.target.value }))} />
                    </div>
                  </div>

                  {post.miles > 0 && post.price_per_k > 0 && (
                    <p className="text-xs text-emerald-600 -mt-1.5">
                      總金額約 NT${Math.round((post.miles / 1000) * post.price_per_k).toLocaleString()}
                    </p>
                  )}

                  {post.type === "sell" ? (
                    <div>
                      <label className={lblCls}>哩程效期（選填）</label>
                      <input type="date" className={inputCls} value={post.expiry_date}
                        onChange={e => setPost(p => ({ ...p, expiry_date: e.target.value }))} />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className={lblCls}>需求航線（選填）</label>
                        <input className={inputCls} placeholder="例：台北-東京 來回 2人"
                          value={post.route} onChange={e => setPost(p => ({ ...p, route: e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={lblCls}>期望出發期間（選填）</label>
                          <input className={inputCls} placeholder="例：2026 年 10 月"
                            value={post.travel_date} onChange={e => setPost(p => ({ ...p, travel_date: e.target.value }))} />
                        </div>
                        <div>
                          <label className={lblCls}>艙等</label>
                          <select className={inputCls} value={post.cabin} onChange={e => setPost(p => ({ ...p, cabin: e.target.value }))}>
                            {MILEAGE_CABINS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label className={lblCls}>補充說明（選填）</label>
                    <textarea className={inputCls + " h-20 resize-none"} placeholder="其他想說明的資訊…"
                      value={post.notes} onChange={e => setPost(p => ({ ...p, notes: e.target.value }))} />
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-500">聯絡資訊（不會公開顯示，僅供專員媒合聯繫）</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={lblCls}>姓名 *</label>
                        <input className={inputCls} placeholder="您的稱呼"
                          value={post.contact_name} onChange={e => setPost(p => ({ ...p, contact_name: e.target.value }))} />
                      </div>
                      <div>
                        <label className={lblCls}>電話 / LINE ID *</label>
                        <input className={inputCls} placeholder="0912345678"
                          value={post.contact_info} onChange={e => setPost(p => ({ ...p, contact_info: e.target.value }))} />
                      </div>
                    </div>
                  </div>

                  {postErr && <p className="text-xs text-red-500">{postErr}</p>}

                  <button onClick={submitPost} disabled={posting}
                    className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50 transition-colors">
                    {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    送出刊登（免費）
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 媒合意願 Modal ───────────────────────────────────────────────────── */}
      {inquiryFor && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setInquiryFor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            {inqDone ? (
              <div className="p-10 text-center">
                <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-800 mb-2">已收到您的媒合意願！</h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-6">
                  暖心旅行社專員將盡快與您聯繫，<br />協助雙方確認交易條件。
                </p>
                <button onClick={() => setInquiryFor(null)}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-medium px-8 py-2.5 rounded-xl text-sm transition-colors">
                  完成
                </button>
              </div>
            ) : (
              <>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Handshake className="w-5 h-5 text-sky-600" /> 我有興趣
                  </h3>
                  <button onClick={() => setInquiryFor(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                  {/* 對象摘要 */}
                  <div className="rounded-xl bg-sky-50 border border-sky-100 px-4 py-3 text-sm text-sky-800">
                    {airlineOf(inquiryFor.airline).label}
                    {inquiryFor.miles > 0 && ` · ${inquiryFor.miles.toLocaleString()} 哩`}
                    {inquiryFor.price_per_k > 0 && ` · NT$${inquiryFor.price_per_k}/千哩`}
                    <span className="ml-1 text-xs">（{inquiryFor.type === "sell" ? "出售" : "收購"}）</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lblCls}>姓名 *</label>
                      <input className={inputCls} placeholder="您的稱呼"
                        value={inq.name} onChange={e => setInq(p => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div>
                      <label className={lblCls}>電話 / LINE ID *</label>
                      <input className={inputCls} placeholder="0912345678"
                        value={inq.contact_info} onChange={e => setInq(p => ({ ...p, contact_info: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className={lblCls}>想說的話（選填）</label>
                    <textarea className={inputCls + " h-20 resize-none"} placeholder="例：我想要 6 萬哩，10 月前要用…"
                      value={inq.message} onChange={e => setInq(p => ({ ...p, message: e.target.value }))} />
                  </div>
                  {inqErr && <p className="text-xs text-red-500">{inqErr}</p>}
                  <button onClick={submitInquiry} disabled={inquiring}
                    className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50 transition-colors">
                    {inquiring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    送出媒合意願
                  </button>
                  <p className="text-[11px] text-slate-400 text-center">您的聯絡資訊僅供旅行社專員媒合使用，不會公開。</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-8 text-center text-sm">
        <p>© 暖心旅行社 2026 旅遊大聯盟 Travel Alliance. All rights reserved.</p>
      </footer>
    </div>
  );
}
