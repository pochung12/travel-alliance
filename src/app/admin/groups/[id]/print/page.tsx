"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Tour, Customer, CustomerTour, ParticipantType } from "@/lib/supabase";

// ─── local supabase ───────────────────────────────────────────────────────────
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const TYPE_LABEL: Record<ParticipantType | string, string> = {
  adult: "成人", tour_only: "只參團", child: "兒童", infant: "嬰兒",
};
const GENDER_LABEL: Record<string, string> = {
  male: "男", female: "女", other: "—",
};

type Row = CustomerTour & { customer: Customer };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d?: string) {
  if (!d) return "";
  return d.replace(/-/g, "/").slice(0, 10);
}

function calcAge(birthday?: string, refDate?: string): string {
  if (!birthday) return "";
  const b = new Date(birthday);
  const r = refDate ? new Date(refDate) : new Date();
  let age = r.getFullYear() - b.getFullYear();
  const m = r.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < b.getDate())) age--;
  return String(age);
}

// ─── Hotel column definitions ─────────────────────────────────────────────────
const HOTEL_COL_DEFS = [
  { key: "seq",             label: "#",       defaultOn: true  },
  { key: "name",            label: "中文姓名",  defaultOn: true  },
  { key: "name_en",         label: "英文姓名",  defaultOn: true  },
  { key: "gender",          label: "性別",     defaultOn: true  },
  { key: "birthday",        label: "生日",     defaultOn: false },
  { key: "age",             label: "年齡",     defaultOn: true  },
  { key: "id_number",       label: "身分證號",  defaultOn: false },
  { key: "passport",        label: "護照號碼",  defaultOn: true  },
  { key: "passport_expiry", label: "護照效期",  defaultOn: true  },
  { key: "taibao",          label: "台胞證號",  defaultOn: true  },
  { key: "taibao_expiry",   label: "台胞效期",  defaultOn: true  },
  { key: "room",            label: "房號",     defaultOn: true  },
  { key: "type",            label: "身份類別",  defaultOn: false },
  { key: "meal",            label: "特殊餐食",  defaultOn: false },
  { key: "phone",           label: "電話",     defaultOn: false },
  { key: "notes",           label: "備註",     defaultOn: false },
  { key: "sign",            label: "簽名欄",   defaultOn: false },
] as const;

type HotelColKey = (typeof HOTEL_COL_DEFS)[number]["key"];
const HOTEL_LS_KEY = "ta_hotel_cols";

function loadHotelCols(): Record<HotelColKey, boolean> {
  const defaults = Object.fromEntries(
    HOTEL_COL_DEFS.map(c => [c.key, c.defaultOn])
  ) as Record<HotelColKey, boolean>;
  if (typeof window === "undefined") return defaults;
  try {
    const saved = JSON.parse(localStorage.getItem(HOTEL_LS_KEY) || "{}");
    return { ...defaults, ...saved };
  } catch { return defaults; }
}

// ─── Print page ───────────────────────────────────────────────────────────────
export default function PrintPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const layout     = searchParams.get("layout") ?? "full";
  const orderParam = searchParams.get("order");

  const [tour,    setTour]    = useState<Tour | null>(null);
  const [rows,    setRows]    = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: p }] = await Promise.all([
        sb.from("tours").select("*").eq("id", id).single(),
        sb.from("customer_tours")
          .select("*, customer:customers(id,name,name_en,phone,email,birthday,gender,id_number,passport,passport_expiry,taibao_number,taibao_expiry,address,emergency_contact,emergency_phone,notes,meal_preference)")
          .eq("tour_id", id),
      ]);
      setTour(t as Tour);

      let sorted = (p || []) as Row[];

      if (orderParam) {
        const order: string[] = JSON.parse(decodeURIComponent(orderParam));
        const map = new Map(sorted.map(r => [r.id, r]));
        sorted = [
          ...order.map(oid => map.get(oid)).filter(Boolean) as Row[],
          ...sorted.filter(r => !order.includes(r.id)),
        ];
      } else {
        sorted.sort((a, b) => {
          const ra = a.room_number || "zzz";
          const rb = b.room_number || "zzz";
          if (ra !== rb) return ra.localeCompare(rb, undefined, { numeric: true });
          return a.customer.name.localeCompare(b.customer.name, "zh-TW");
        });
      }
      setRows(sorted);
      setLoading(false);
    })();
  }, [id, orderParam]);

  // Auto-print (not for hotel layout — user needs to pick columns first)
  useEffect(() => {
    if (!loading && tour && layout !== "hotel") {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [loading, tour, layout]);

  const printDate = new Date().toLocaleDateString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });

  if (loading || !tour) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"sans-serif" }}>
        載入中…
      </div>
    );
  }

  if (layout === "full")    return <FullList    tour={tour} rows={rows} printDate={printDate} />;
  if (layout === "payment") return <PaymentList tour={tour} rows={rows} printDate={printDate} />;
  if (layout === "hotel")   return <HotelList   tour={tour} rows={rows} printDate={printDate} />;
  return <BoardingList tour={tour} rows={rows} printDate={printDate} />;
}

// ─── Shared print CSS ─────────────────────────────────────────────────────────
function PrintStyles({ landscape }: { landscape?: boolean }) {
  return (
    <style>{`
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: "Microsoft JhengHei", "蘋方-繁", Arial, sans-serif; font-size: 9pt; color: #000; background: #fff; }
      @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm 10mm; }
      @media print {
        .no-print { display: none !important; }
        table { page-break-inside: auto; }
        tr    { page-break-inside: avoid; }
        thead { display: table-header-group; }
      }
      .page { padding: 0; }
      .header { margin-bottom: 8px; }
      .title  { font-size: 15pt; font-weight: bold; margin-bottom: 3px; }
      .meta   { font-size: 8.5pt; color: #444; display: flex; gap: 18px; flex-wrap: wrap; }
      .meta span::before { content: attr(data-label) "　"; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin-top: 6px; }
      th {
        background: #1e3a5f; color: #fff; font-size: 8pt; font-weight: bold;
        padding: 4px 4px; text-align: center; border: 1px solid #1e3a5f;
        white-space: nowrap;
      }
      td { padding: 3px 4px; border: 1px solid #ccc; vertical-align: middle; font-size: 8.5pt; }
      tr:nth-child(even) td { background: #f5f8ff; }
      tr:hover td { background: #e8f0ff; }
      .section-head td {
        background: #e2e8f0 !important; font-weight: bold; font-size: 8.5pt;
        color: #1e3a5f; padding: 3px 6px;
      }
      .num   { text-align: center; color: #555; }
      .r     { text-align: right; }
      .c     { text-align: center; }
      .bold  { font-weight: bold; }
      .dim   { color: #888; font-size: 7.5pt; }
      .meal  { font-size: 7.5pt; color: #b45309; }
      .expired { color: #dc2626; font-weight: bold; }
      .footer { margin-top: 8px; font-size: 7.5pt; color: #666; display: flex; justify-content: space-between; }
      .action-bar {
        position: fixed; top: 0; left: 0; right: 0; z-index: 100;
        background: #1e3a5f; color: #fff; padding: 8px 16px;
        display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.3);
        flex-wrap: wrap;
      }
      .action-bar button {
        padding: 5px 14px; border-radius: 6px; border: none; cursor: pointer;
        font-size: 13px; font-weight: bold;
      }
      .btn-print { background: #3b82f6; color: #fff; }
      .btn-close { background: rgba(255,255,255,.2); color: #fff; }
      .action-bar select {
        padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,.3);
        background: rgba(255,255,255,.1); color: #fff; font-size: 13px;
      }
      .action-bar option { background: #1e3a5f; }
      .print-body { padding-top: 46px; }
      @media print { .action-bar { display:none; } .print-body { padding-top: 0; } }
    `}</style>
  );
}

// ─── Layout 1: 完整旅客名單 ───────────────────────────────────────────────────
function FullList({ tour, rows, printDate }: { tour: Tour; rows: Row[]; printDate: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const types: (ParticipantType | string)[] = ["adult", "tour_only", "child", "infant"];
  const groups = types.map(t => ({ type: t, items: rows.filter(r => (r.participant_type || "adult") === t) }))
                      .filter(g => g.items.length > 0);
  let globalSeq = 0;

  return (
    <>
      <PrintStyles landscape />
      <div className="action-bar no-print">
        <span style={{ fontWeight: "bold", fontSize: 14 }}>🖨 列印預覽</span>
        <button className="btn-print" onClick={() => window.print()}>列印</button>
        <button className="btn-close" onClick={() => window.close()}>關閉</button>
        <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
          {tour.name} · {rows.length} 人
        </span>
      </div>
      <div className="print-body">
        <div className="page">
          <div className="header">
            <div className="title">📋 出團旅客名單 — {tour.name}</div>
            <div className="meta">
              {tour.destination && <span data-label="目的地">{tour.destination}</span>}
              {tour.start_date  && <span data-label="出發日">{fmtDate(tour.start_date)}</span>}
              {tour.end_date    && <span data-label="回程日">{fmtDate(tour.end_date)}</span>}
              <span data-label="人數">{rows.length} 人</span>
              <span data-label="列印">{printDate}</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ width: 24 }}>#</th>
                <th style={{ width: 60 }}>姓名</th>
                <th style={{ width: 100 }}>英文姓名</th>
                <th style={{ width: 22 }}>性別</th>
                <th style={{ width: 70 }}>生日</th>
                <th style={{ width: 36 }}>年齡</th>
                <th style={{ width: 80 }}>身分證號</th>
                <th style={{ width: 88 }}>護照號碼</th>
                <th style={{ width: 62 }}>護照效期</th>
                <th style={{ width: 88 }}>台胞證號</th>
                <th style={{ width: 62 }}>台胞效期</th>
                <th style={{ width: 36 }}>房號</th>
                <th style={{ width: 100 }}>特殊餐食</th>
                <th style={{ width: 80 }}>電話</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(({ type, items }) => (
                <>
                  <tr key={`head-${type}`}>
                    <td colSpan={14} className="section-head">{TYPE_LABEL[type]}（{items.length} 人）</td>
                  </tr>
                  {items.map(r => {
                    globalSeq++;
                    const c = r.customer;
                    const passExpired   = c.passport_expiry && c.passport_expiry < today;
                    const taibaoExpired = c.taibao_expiry   && c.taibao_expiry   < today;
                    return (
                      <tr key={r.id}>
                        <td className="num">{globalSeq}</td>
                        <td className="bold">{c.name}</td>
                        <td style={{ fontSize: "8pt", letterSpacing: "0.3px" }}>{c.name_en || ""}</td>
                        <td className="c">{GENDER_LABEL[c.gender] ?? "—"}</td>
                        <td className="c">{fmtDate(c.birthday)}</td>
                        <td className="c">{calcAge(c.birthday, tour.start_date)}</td>
                        <td style={{ fontFamily: "monospace, monospace", fontSize: "8pt" }}>{c.id_number || ""}</td>
                        <td style={{ fontFamily: "monospace, monospace", fontSize: "8pt" }}>{c.passport || ""}</td>
                        <td className={`c ${passExpired ? "expired" : ""}`}>
                          {fmtDate(c.passport_expiry)}{passExpired ? " ⚠" : ""}
                        </td>
                        <td style={{ fontFamily: "monospace, monospace", fontSize: "8pt" }}>{c.taibao_number || ""}</td>
                        <td className={`c ${taibaoExpired ? "expired" : ""}`}>
                          {fmtDate(c.taibao_expiry)}{taibaoExpired ? " ⚠" : ""}
                        </td>
                        <td className="c bold">{r.room_number || ""}</td>
                        <td className="meal">{r.meal_preference || c.meal_preference || ""}</td>
                        <td>{c.phone || ""}</td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
          <div className="footer">
            <span>⚠ 效期標示紅色者已過期，請注意換發。</span>
            <span>共 {rows.length} 位旅客 · 列印日期 {printDate}</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Layout 2: 收款狀況 ────────────────────────────────────────────────────────
function PaymentList({ tour, rows, printDate }: { tour: Tour; rows: Row[]; printDate: string }) {
  const totalDeposit = rows.reduce((s, r) => s + (r.deposit_amount || 0), 0);
  const totalBalance = rows.reduce((s, r) => s + (r.balance_amount || 0), 0);
  const totalPaid    = rows.reduce((s, r) => s + (r.paid_amount    || 0), 0);

  const priceMap: Record<string, number> = {
    adult:     tour.selling_price    || 0,
    tour_only: tour.price_tour_only  || 0,
    child:     tour.price_child      || 0,
    infant:    tour.price_infant     || 0,
  };

  return (
    <>
      <PrintStyles />
      <div className="action-bar no-print">
        <span style={{ fontWeight: "bold", fontSize: 14 }}>🖨 收款狀況預覽</span>
        <button className="btn-print" onClick={() => window.print()}>列印</button>
        <button className="btn-close" onClick={() => window.close()}>關閉</button>
      </div>
      <div className="print-body">
        <div className="page">
          <div className="header">
            <div className="title">💰 收款狀況 — {tour.name}</div>
            <div className="meta">
              {tour.destination && <span data-label="目的地">{tour.destination}</span>}
              {tour.start_date  && <span data-label="出發日">{fmtDate(tour.start_date)}</span>}
              <span data-label="人數">{rows.length} 人</span>
              <span data-label="列印">{printDate}</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ width: 24 }}>#</th>
                <th style={{ width: 72 }}>姓名</th>
                <th style={{ width: 44 }}>身份</th>
                <th style={{ width: 56 }}>應付金額</th>
                <th style={{ width: 64 }}>訂金</th>
                <th style={{ width: 64 }}>尾款</th>
                <th style={{ width: 64 }}>已付合計</th>
                <th style={{ width: 64 }}>未付餘額</th>
                <th style={{ width: 36 }}>房號</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const unitPrice = priceMap[r.participant_type || "adult"] ?? 0;
                const deposit   = r.deposit_amount || 0;
                const balance   = r.balance_amount || 0;
                const paid      = r.paid_amount    || 0;
                const remain    = unitPrice - deposit - balance;
                return (
                  <tr key={r.id}>
                    <td className="num">{i + 1}</td>
                    <td className="bold">{r.customer.name}</td>
                    <td className="c">{TYPE_LABEL[r.participant_type || "adult"]}</td>
                    <td className="r">{unitPrice ? `NT$${unitPrice.toLocaleString()}` : "—"}</td>
                    <td className="r" style={{ color: deposit ? "#065f46" : "#999" }}>
                      {deposit ? `NT$${deposit.toLocaleString()}` : "—"}
                    </td>
                    <td className="r" style={{ color: balance ? "#1e40af" : "#999" }}>
                      {balance ? `NT$${balance.toLocaleString()}` : "—"}
                    </td>
                    <td className="r bold">{paid ? `NT$${paid.toLocaleString()}` : "—"}</td>
                    <td className="r" style={{ color: remain > 0 ? "#dc2626" : remain < 0 ? "#d97706" : "#059669", fontWeight: "bold" }}>
                      {remain > 0 ? `NT$${remain.toLocaleString()}` : remain < 0 ? `超出 NT$${Math.abs(remain).toLocaleString()}` : "✓"}
                    </td>
                    <td className="c">{r.room_number || ""}</td>
                    <td style={{ fontSize: "8pt", color: "#666" }}>{r.notes || ""}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "#e2e8f0", fontWeight: "bold" }}>
                <td colSpan={4} className="r bold" style={{ borderColor: "#94a3b8" }}>合計</td>
                <td className="r" style={{ borderColor: "#94a3b8" }}>NT${totalDeposit.toLocaleString()}</td>
                <td className="r" style={{ borderColor: "#94a3b8" }}>NT${totalBalance.toLocaleString()}</td>
                <td className="r" style={{ borderColor: "#94a3b8" }}>NT${totalPaid.toLocaleString()}</td>
                <td colSpan={3} style={{ borderColor: "#94a3b8" }} />
              </tr>
            </tfoot>
          </table>
          <div className="footer">
            <span />
            <span>共 {rows.length} 位旅客 · 列印日期 {printDate}</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Layout 3: 登機名單 ────────────────────────────────────────────────────────
function BoardingList({ tour, rows, printDate }: { tour: Tour; rows: Row[]; printDate: string }) {
  return (
    <>
      <PrintStyles landscape />
      <div className="action-bar no-print">
        <span style={{ fontWeight: "bold", fontSize: 14 }}>🖨 登機名單預覽</span>
        <button className="btn-print" onClick={() => window.print()}>列印</button>
        <button className="btn-close" onClick={() => window.close()}>關閉</button>
      </div>
      <div className="print-body">
        <div className="page">
          <div className="header">
            <div className="title">✈️ 登機名單 — {tour.name}</div>
            <div className="meta">
              {tour.destination && <span data-label="目的地">{tour.destination}</span>}
              {tour.start_date  && <span data-label="出發日">{fmtDate(tour.start_date)}</span>}
              {tour.end_date    && <span data-label="回程日">{fmtDate(tour.end_date)}</span>}
              <span data-label="人數">{rows.length} 人</span>
              <span data-label="列印">{printDate}</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ width: 24 }}>#</th>
                <th style={{ width: 64 }}>中文姓名</th>
                <th style={{ width: 110 }}>英文姓名</th>
                <th style={{ width: 22 }}>性別</th>
                <th style={{ width: 70 }}>生日</th>
                <th style={{ width: 36 }}>年齡</th>
                <th style={{ width: 92 }}>護照號碼</th>
                <th style={{ width: 62 }}>護照效期</th>
                <th style={{ width: 92 }}>台胞證號</th>
                <th style={{ width: 62 }}>台胞效期</th>
                <th style={{ width: 36 }}>身份</th>
                <th style={{ width: 36 }}>房號</th>
                <th style={{ width: 100 }}>特殊餐食</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const c = r.customer;
                const today = new Date().toISOString().slice(0, 10);
                const passExpired   = c.passport_expiry && c.passport_expiry < today;
                const taibaoExpired = c.taibao_expiry   && c.taibao_expiry   < today;
                return (
                  <tr key={r.id}>
                    <td className="num">{i + 1}</td>
                    <td className="bold">{c.name}</td>
                    <td style={{ fontSize: "7.5pt", letterSpacing: "0.3px" }}>{c.name_en || ""}</td>
                    <td className="c">{GENDER_LABEL[c.gender] ?? "—"}</td>
                    <td className="c">{fmtDate(c.birthday)}</td>
                    <td className="c">{calcAge(c.birthday, tour.start_date)}</td>
                    <td style={{ fontFamily: "monospace, monospace", fontSize: "7.5pt" }}>{c.passport || ""}</td>
                    <td className={`c ${passExpired ? "expired" : ""}`}>{fmtDate(c.passport_expiry)}{passExpired ? " ⚠" : ""}</td>
                    <td style={{ fontFamily: "monospace, monospace", fontSize: "7.5pt" }}>{c.taibao_number || ""}</td>
                    <td className={`c ${taibaoExpired ? "expired" : ""}`}>{fmtDate(c.taibao_expiry)}{taibaoExpired ? " ⚠" : ""}</td>
                    <td className="c">{TYPE_LABEL[r.participant_type || "adult"]}</td>
                    <td className="c bold">{r.room_number || ""}</td>
                    <td className="meal">{r.meal_preference || c.meal_preference || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="footer">
            <span>⚠ 效期標示紅色者已過期，請注意換發。</span>
            <span>共 {rows.length} 位旅客 · 列印日期 {printDate}</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Layout 4: 飯店登記名單（欄位可勾選，按房號分組）────────────────────────
function HotelList({ tour, rows, printDate }: { tour: Tour; rows: Row[]; printDate: string }) {
  const [cols, setCols] = useState<Record<HotelColKey, boolean>>(loadHotelCols);
  const [groupByRoom, setGroupByRoom] = useState(true);

  // Persist col selection
  useEffect(() => {
    try { localStorage.setItem(HOTEL_LS_KEY, JSON.stringify(cols)); } catch { /* noop */ }
  }, [cols]);

  const today = new Date().toISOString().slice(0, 10);
  const activeCols = HOTEL_COL_DEFS.filter(c => cols[c.key]);
  const colSpanAll = activeCols.length;

  // Group by room number (or show flat list)
  const roomNums = Array.from(new Set(rows.map(r => r.room_number || "").filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  const noRoom = rows.filter(r => !r.room_number);

  type Group = { roomLabel: string; items: Row[] };
  const groups: Group[] = groupByRoom
    ? [
        ...roomNums.map(rn => ({ roomLabel: rn, items: rows.filter(r => r.room_number === rn) })),
        ...(noRoom.length > 0 ? [{ roomLabel: "（未分房）", items: noRoom }] : []),
      ]
    : [{ roomLabel: "", items: rows }];

  let globalSeq = 0;

  function renderCell(colKey: HotelColKey, r: Row, seq: number) {
    const c = r.customer;
    const passExpired   = c.passport_expiry && c.passport_expiry < today;
    const taibaoExpired = c.taibao_expiry   && c.taibao_expiry   < today;

    switch (colKey) {
      case "seq":             return <td key="seq" className="num">{seq}</td>;
      case "name":            return <td key="name" className="bold">{c.name}</td>;
      case "name_en":         return <td key="name_en" style={{ fontSize: "8pt", letterSpacing: "0.3px" }}>{c.name_en || ""}</td>;
      case "gender":          return <td key="gender" className="c">{GENDER_LABEL[c.gender] ?? "—"}</td>;
      case "birthday":        return <td key="birthday" className="c">{fmtDate(c.birthday)}</td>;
      case "age":             return <td key="age" className="c">{calcAge(c.birthday, tour.start_date)}</td>;
      case "id_number":       return <td key="id_number" style={{ fontFamily: "monospace, monospace", fontSize: "8pt" }}>{c.id_number || ""}</td>;
      case "passport":        return <td key="passport" style={{ fontFamily: "monospace, monospace", fontSize: "8pt" }}>{c.passport || ""}</td>;
      case "passport_expiry": return (
        <td key="passport_expiry" className={`c ${passExpired ? "expired" : ""}`}>
          {fmtDate(c.passport_expiry)}{passExpired ? " ⚠" : ""}
        </td>
      );
      case "taibao":          return <td key="taibao" style={{ fontFamily: "monospace, monospace", fontSize: "8pt" }}>{c.taibao_number || ""}</td>;
      case "taibao_expiry":   return (
        <td key="taibao_expiry" className={`c ${taibaoExpired ? "expired" : ""}`}>
          {fmtDate(c.taibao_expiry)}{taibaoExpired ? " ⚠" : ""}
        </td>
      );
      case "room":            return <td key="room" className="c bold">{r.room_number || ""}</td>;
      case "type":            return <td key="type" className="c">{TYPE_LABEL[r.participant_type || "adult"]}</td>;
      case "meal":            return <td key="meal" className="meal">{r.meal_preference || c.meal_preference || ""}</td>;
      case "phone":           return <td key="phone">{c.phone || ""}</td>;
      case "notes":           return <td key="notes" style={{ fontSize: "8pt", color: "#666" }}>{r.notes || ""}</td>;
      case "sign":            return <td key="sign" style={{ minWidth: 60 }}></td>;
    }
  }

  return (
    <>
      <PrintStyles landscape />
      {/* ── 操作列（含欄位勾選） ── */}
      <div className="action-bar no-print" style={{ alignItems: "flex-start", paddingTop: 10, paddingBottom: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontWeight: "bold", fontSize: 14 }}>🏨 飯店登記名單</span>
            <button className="btn-print" onClick={() => window.print()}>列印</button>
            <button className="btn-close" onClick={() => window.close()}>關閉</button>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, opacity: 0.8 }}>{tour.name} · {rows.length} 人</span>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={groupByRoom}
                onChange={e => setGroupByRoom(e.target.checked)}
                style={{ width: 13, height: 13 }}
              />
              按房號分組
            </label>
          </div>
        </div>

        {/* 欄位勾選 */}
        <div style={{
          marginLeft: 16, borderLeft: "1px solid rgba(255,255,255,.25)", paddingLeft: 16,
          display: "flex", flexWrap: "wrap", gap: "2px 14px", alignContent: "flex-start",
        }}>
          <span style={{ width: "100%", fontSize: 11, fontWeight: "bold", opacity: 0.7, marginBottom: 2 }}>
            顯示欄位
          </span>
          {HOTEL_COL_DEFS.map(col => (
            <label key={col.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={cols[col.key]}
                onChange={e => setCols(prev => ({ ...prev, [col.key]: e.target.checked }))}
                style={{ width: 13, height: 13, accentColor: "#3b82f6" }}
              />
              {col.label}
            </label>
          ))}
        </div>
      </div>

      {/* ── 列印內容 ── */}
      <div className="print-body">
        <div className="page">
          <div className="header">
            <div className="title">🏨 飯店登記名單 — {tour.name}</div>
            <div className="meta">
              {tour.destination && <span data-label="目的地">{tour.destination}</span>}
              {tour.start_date  && <span data-label="入住日">{fmtDate(tour.start_date)}</span>}
              {tour.end_date    && <span data-label="退房日">{fmtDate(tour.end_date)}</span>}
              <span data-label="人數">{rows.length} 人</span>
              <span data-label="列印">{printDate}</span>
            </div>
          </div>

          {activeCols.length === 0 ? (
            <p style={{ padding: "20px 0", color: "#888", textAlign: "center" }}>請在上方勾選至少一個欄位</p>
          ) : (
            <table>
              <thead>
                <tr>
                  {activeCols.map(col => {
                    const widthMap: Partial<Record<HotelColKey, number>> = {
                      seq: 24, name: 60, name_en: 100, gender: 22, birthday: 70,
                      age: 30, id_number: 82, passport: 88, passport_expiry: 62,
                      taibao: 88, taibao_expiry: 62, room: 36, type: 36,
                      meal: 80, phone: 78, notes: 80, sign: 60,
                    };
                    return <th key={col.key} style={{ width: widthMap[col.key] }}>{col.label}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {groups.map(({ roomLabel, items }) => (
                  <>
                    {groupByRoom && (
                      <tr key={`room-head-${roomLabel}`}>
                        <td colSpan={colSpanAll} className="section-head">
                          {roomLabel ? `🛏 ${roomLabel} 房（${items.length} 人）` : `（${items.length} 人）`}
                        </td>
                      </tr>
                    )}
                    {items.map(r => {
                      globalSeq++;
                      return (
                        <tr key={r.id}>
                          {activeCols.map(col => renderCell(col.key, r, globalSeq))}
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          )}

          <div className="footer">
            <span>⚠ 效期標示紅色者已過期，請注意換發。</span>
            <span>共 {rows.length} 位旅客 · 列印日期 {printDate}</span>
          </div>
        </div>
      </div>
    </>
  );
}
