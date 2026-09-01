"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase as sb, Tour, Customer, CustomerTour, ParticipantType } from "@/lib/supabase";
import { buildReceivables, linkedAmount, priceOfType, type PayLite } from "@/lib/receivables";
import { loadDocSettings, saveDocSettings, resetDocSettings, DOC_DEFAULTS, DOC_FIELDS, type DocSettings } from "@/lib/docSettings";

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
  const [payments, setPayments] = useState<PayLite[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: p }, { data: pay }] = await Promise.all([
        sb.from("tours").select("*").eq("id", id).single(),
        sb.from("customer_tours")
          .select("*, customer:customers(id,name,name_en,phone,email,birthday,gender,id_number,passport,passport_expiry,taibao_number,taibao_expiry,address,emergency_contact,emergency_phone,notes,meal_preference)")
          .eq("tour_id", id),
        sb.from("tour_payments").select("type,category,amount,customer_ids").eq("tour_id", id),
      ]);
      setTour(t as Tour);
      setPayments((pay || []) as PayLite[]);

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

  const feeMode = (searchParams.get("mode") === "summary" ? "summary" : "detail") as "summary" | "detail";
  if (layout === "deposit")  return <FeeNotice tour={tour} rows={rows} payments={payments} printDate={printDate} kind="deposit" mode={feeMode} />;
  if (layout === "balance")  return <FeeNotice tour={tour} rows={rows} payments={payments} printDate={printDate} kind="balance" mode={feeMode} />;
  if (layout === "passport-consent") return <PassportConsent tour={tour} rows={rows} printDate={printDate} />;
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

// ─── Layout 5/6: 訂金單 ／ 尾款單（應收費用明細）───────────────────────────────
// ─── Layout 7: 護照自帶同意書 ─────────────────────────────────────────────────
function PassportConsent({ tour, rows, printDate }: { tour: Tour; rows: Row[]; printDate: string }) {
  return (
    <>
      <PrintStyles />
      <div className="action-bar no-print">
        <span style={{ fontWeight: "bold" }}>護照自帶同意書</span>
        <button className="btn-print" onClick={() => window.print()}>🖨 列印 / 存成 PDF</button>
        <button className="btn-close" onClick={() => window.close()}>關閉</button>
      </div>
      <div className="print-body page">
        <div className="header" style={{ textAlign: "center", marginBottom: 14 }}>
          <div className="title" style={{ fontSize: "17pt" }}>護照自行攜帶同意書</div>
          <div style={{ fontSize: "9pt", color: "#444", marginTop: 4 }}>
            {tour.name}　｜　出發日 {fmtDate(tour.start_date)}
          </div>
        </div>

        <div style={{ fontSize: "9.5pt", lineHeight: 2.0, border: "1px solid #999", padding: "12px 14px", marginBottom: 12 }}>
          本人參加貴公司承辦之上列旅遊行程，茲同意<span style={{ fontWeight: "bold" }}>自行保管並攜帶本人之護照（及台胞證等相關旅行證件）</span>前往機場集合，不交由旅行社代為保管。
          <br />
          本人已充分了解並承諾下列事項：
          <div style={{ paddingLeft: 16, marginTop: 6 }}>
            一、於集合前自行確認護照效期距回程日仍有六個月以上，且證件完整未破損。<br />
            二、於出發當日務必攜帶護照及所需簽證／台胞證正本至機場集合。<br />
            三、如因本人<span style={{ fontWeight: "bold" }}>未攜帶、遺失、效期不足或證件不符</span>致無法出境、無法登機或行程受阻，
            所生之一切損失（含機票、住宿、地接等已產生且不可退還之費用）由本人自行負擔，
            與旅行社及其人員無涉，本人不得要求退費或請求賠償。<br />
            四、如需旅行社協助辦理補件或改期，相關規費與手續費由本人負擔。
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: "6%" }}>#</th>
              <th style={{ width: "18%" }}>旅客姓名</th>
              <th style={{ width: "17%" }}>護照號碼</th>
              <th style={{ width: "14%" }}>護照效期</th>
              <th style={{ width: "15%" }}>聯絡電話</th>
              <th style={{ width: "18%" }}>親筆簽名</th>
              <th style={{ width: "12%" }}>簽署日期</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const exp = r.customer.passport_expiry;
              const soon = exp ? (new Date(exp).getTime() - new Date(tour.end_date).getTime()) / 86400000 < 180 : false;
              return (
                <tr key={r.id} style={{ height: "34px" }}>
                  <td className="num">{i + 1}</td>
                  <td className="bold">{r.customer.name}</td>
                  <td className="c">{r.customer.passport || "—"}</td>
                  <td className={`c ${soon ? "expired" : ""}`}>{fmtDate(r.customer.passport_expiry) || "—"}</td>
                  <td className="c dim">{r.customer.phone || ""}</td>
                  <td />
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>

        <p style={{ marginTop: 10, fontSize: "8pt", color: "#555", lineHeight: 1.7 }}>
          ※ 護照效期以紅字標示者，表示效期距回程日不足六個月，請務必於出發前完成換發。<br />
          ※ 本同意書一式一份，由旅行社留存備查。
        </p>

        <div className="footer">
          <span>旅行社：暖心旅行社</span>
          <span>製表日期：{printDate}</span>
        </div>
      </div>
    </>
  );
}

// ═══ 對客單據：訂金／尾款請款單 ═══════════════════════════════════════════════
const DOC = {
  ink:   "#2b2b2b",
  brand: "#a8453a",
  muted: "#8a8268",
  line:  "#e3dbc9",
  soft:  "#faf7f0",
  head:  "#f3ecda",
};

function FeeDocStyles() {
  return (
    <style>{`
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: "Noto Serif TC","Microsoft JhengHei","蘋方-繁",serif; font-size: 10pt; color: ${DOC.ink}; background: #fff; }
      @page { size: A4 portrait; margin: 14mm 14mm; }
      @media print { .no-print { display: none !important; } .doc-body { padding-top: 0 !important; } }

      .doc-body { padding-top: 54px; }
      .sheet { max-width: 182mm; margin: 0 auto; }

      /* 頁首 */
      .dh { display: flex; align-items: flex-start; gap: 16px; padding-bottom: 12px; }
      .dh-logo { width: 54px; height: 54px; object-fit: contain; flex-shrink: 0; }
      .dh-main { flex: 1; min-width: 0; }
      .dh-name { font-size: 17pt; font-weight: 700; letter-spacing: .04em; color: ${DOC.brand}; line-height: 1.2; }
      .dh-en   { font-size: 7.5pt; letter-spacing: .16em; color: ${DOC.muted}; text-transform: uppercase; margin-top: 3px; }
      .dh-tag  { font-size: 8.5pt; color: ${DOC.muted}; margin-top: 5px; }
      .dh-meta { text-align: right; font-size: 7.8pt; color: ${DOC.muted}; line-height: 1.75; flex-shrink: 0; }
      .rule { height: 2px; background: ${DOC.brand}; }
      .rule-thin { height: 1px; background: ${DOC.line}; margin: 14px 0; }

      /* 標題列 */
      .dt { display: flex; align-items: flex-end; justify-content: space-between; margin: 16px 0 12px; gap: 12px; }
      .dt-title { font-size: 20pt; font-weight: 700; letter-spacing: .1em; color: ${DOC.ink}; }
      .dt-sub   { font-size: 8pt; letter-spacing: .18em; color: ${DOC.muted}; text-transform: uppercase; margin-top: 3px; }
      .dt-date  { font-size: 8.5pt; color: ${DOC.muted}; text-align: right; line-height: 1.8; }

      /* 團資訊 */
      .info { background: ${DOC.soft}; border: 1px solid ${DOC.line}; border-radius: 4px; padding: 11px 14px; margin-bottom: 16px; }
      .info-name { font-size: 11pt; font-weight: 700; line-height: 1.45; margin-bottom: 7px; }
      .info-row { display: flex; flex-wrap: wrap; gap: 22px; font-size: 8.5pt; color: ${DOC.muted}; }
      .info-row b { color: ${DOC.ink}; font-weight: 600; margin-left: 5px; }

      /* 金額表 */
      table.amt { width: 100%; border-collapse: collapse; }
      table.amt th { background: ${DOC.head}; color: ${DOC.ink}; font-size: 8.5pt; font-weight: 700;
                     padding: 8px 12px; text-align: left; border-bottom: 1px solid ${DOC.line}; letter-spacing: .05em; }
      table.amt td { padding: 9px 12px; border-bottom: 1px solid ${DOC.line}; font-size: 9.5pt; vertical-align: middle; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .muted { color: ${DOC.muted}; font-size: 8.5pt; }
      .neg { color: ${DOC.muted}; }

      /* 應收總額 */
      .total { display: flex; align-items: center; justify-content: space-between;
               background: ${DOC.brand}; color: #fff; padding: 14px 18px; border-radius: 4px; margin-top: 2px; }
      .total-l { font-size: 10.5pt; font-weight: 700; letter-spacing: .08em; }
      .total-n { font-size: 21pt; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: .01em; }
      .total-s { font-size: 7.5pt; opacity: .85; margin-top: 2px; text-align: right; }

      /* 明細表 */
      table.det { width: 100%; border-collapse: collapse; margin-top: 2px; }
      table.det th { background: ${DOC.head}; font-size: 8pt; font-weight: 700; padding: 7px 8px;
                     border-bottom: 1px solid ${DOC.line}; letter-spacing: .04em; }
      table.det td { padding: 6px 8px; border-bottom: 1px solid #f0ebdd; font-size: 8.8pt; }
      table.det tr:nth-child(even) td { background: #fcfaf5; }
      .owed { color: ${DOC.brand}; font-weight: 700; }
      .paid-ok { color: #6b8f5e; }

      /* 匯款資訊 */
      .pay { border: 1px solid ${DOC.line}; border-radius: 4px; overflow: hidden; margin-top: 18px; }
      .pay-h { background: ${DOC.head}; padding: 7px 14px; font-size: 8.5pt; font-weight: 700; letter-spacing: .06em; }
      .pay-b { padding: 11px 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 22px; font-size: 9pt; }
      .pay-b div { display: flex; gap: 8px; }
      .pay-b span.k { color: ${DOC.muted}; min-width: 62px; font-size: 8.5pt; }
      .pay-b span.v { border-bottom: 1px dotted ${DOC.line}; flex: 1; min-height: 15px; }

      /* 注意事項 */
      .note { margin-top: 16px; font-size: 8.3pt; color: #57534e; line-height: 1.95; }
      .note-h { font-size: 8.5pt; font-weight: 700; color: ${DOC.ink}; margin-bottom: 4px; letter-spacing: .06em; }
      .note li { margin-left: 15px; }

      /* 頁尾 */
      .foot { margin-top: 22px; padding-top: 12px; border-top: 1px solid ${DOC.line}; }
      .foot-msg { font-size: 8.5pt; color: ${DOC.brand}; text-align: center; letter-spacing: .05em; margin-bottom: 16px; }
      .sign { display: flex; gap: 40px; }
      .sign div { flex: 1; }
      .sign-l { font-size: 8pt; color: ${DOC.muted}; margin-bottom: 26px; }
      .sign-u { border-bottom: 1px solid ${DOC.line}; }
      .foot-co { margin-top: 14px; text-align: center; font-size: 7.3pt; color: #a8a29e; line-height: 1.7; }

      /* 操作列 */
      .bar { position: fixed; top: 0; left: 0; right: 0; z-index: 100; background: ${DOC.ink}; color: #fff;
             padding: 9px 16px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
             box-shadow: 0 2px 10px rgba(0,0,0,.25); font-family: system-ui, sans-serif; }
      .bar button { padding: 6px 15px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; }
      .bar .p { background: ${DOC.brand}; color: #fff; }
      .bar .g { background: rgba(255,255,255,.16); color: #fff; }
      @media print { .bar { display: none; } }

      /* 設定面板 */
      .cfg { position: fixed; top: 46px; left: 0; right: 0; bottom: 0; z-index: 99; overflow-y: auto;
             background: #f8f7f4; padding: 18px; font-family: system-ui, sans-serif; }
      .cfg-in { max-width: 780px; margin: 0 auto; }
      .cfg-g { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
      .cfg-gt { font-size: 13px; font-weight: 700; color: ${DOC.brand}; margin-bottom: 10px; }
      .cfg-f { margin-bottom: 10px; }
      .cfg-f label { display: block; font-size: 11px; color: #666; margin-bottom: 3px; font-weight: 600; }
      .cfg-f input, .cfg-f textarea { width: 100%; padding: 7px 9px; border: 1px solid #ddd; border-radius: 6px;
                                      font-size: 13px; font-family: inherit; }
      .cfg-f textarea { min-height: 76px; resize: vertical; line-height: 1.7; }
      .cfg-hint { font-size: 11px; color: #999; margin-top: 3px; }
    `}</style>
  );
}

function FeeNotice({
  tour, rows, payments, printDate, kind, mode,
}: {
  tour: Tour; rows: Row[]; payments: PayLite[]; printDate: string;
  kind: "deposit" | "balance"; mode: "summary" | "detail";
}) {
  const [cfg, setCfg] = useState<DocSettings>(DOC_DEFAULTS);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setCfg(loadDocSettings()); }, []);

  const isDeposit = kind === "deposit";
  const isSummary = mode === "summary";
  const title = isSummary
    ? (isDeposit ? "訂金請款單" : "尾款請款單")
    : (isDeposit ? "訂金繳納明細" : "尾款繳納明細");
  const titleEn = isDeposit ? "Deposit Statement" : "Balance Statement";
  const depositPerPerson = tour.deposit_per_person || 0;

  const items = rows.map((r, i) => {
    const cid = r.customer.id;
    const total = priceOfType(tour, r.participant_type);
    const dLinked = linkedAmount(payments, cid, "deposit");
    const bLinked = linkedAmount(payments, cid, "balance");
    const depositPaid = dLinked > 0 ? dLinked : (r.deposit_amount || 0);
    const balancePaid = bLinked > 0 ? bLinked : (r.balance_amount || 0);
    const depositDue = total > 0 ? depositPerPerson : 0;
    const balanceDue = Math.max(0, total - depositPaid);
    const due  = isDeposit ? depositDue : balanceDue;
    const paid = isDeposit ? depositPaid : balancePaid;
    return {
      seq: i + 1, name: r.customer.name,
      type: TYPE_LABEL[r.participant_type || "adult"] || "成人",
      room: r.room_number || "", total, depositPaid, due, paid,
      owed: Math.max(0, due - paid),
    };
  });
  const sum = items.reduce((a, x) => ({
    total: a.total + x.total, due: a.due + x.due, paid: a.paid + x.paid,
    owed: a.owed + x.owed, depositPaid: a.depositPaid + x.depositPaid,
  }), { total: 0, due: 0, paid: 0, owed: 0, depositPaid: 0 });

  const nt = (n: number) => "NT$ " + n.toLocaleString();
  const cell = (n: number) => n > 0 ? n.toLocaleString() : "—";
  const paidCount = items.filter(x => x.due > 0 && x.owed === 0).length;
  const openCount = items.filter(x => x.owed > 0).length;
  const noteLines = (isDeposit ? cfg.depositNote : cfg.balanceNote)
    .split("\n").map(l => l.trim()).filter(Boolean);
  const contact = [cfg.phone && `電話 ${cfg.phone}`, cfg.email, cfg.address].filter(Boolean);
  const legal = [cfg.taxId && `統一編號 ${cfg.taxId}`, cfg.licenseNo].filter(Boolean);

  const set = (k: keyof DocSettings, v: string) => setCfg(c => ({ ...c, [k]: v }));
  const onSave = () => { saveDocSettings(cfg); setEditing(false); };

  return (
    <>
      <FeeDocStyles />
      <div className="bar no-print">
        <strong style={{ fontSize: 14 }}>{title}</strong>
        <span style={{ opacity: .6, fontSize: 12 }}>{isSummary ? "全團總額" : "逐人明細"}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="g" onClick={() => setEditing(e => !e)}>
            {editing ? "← 回到預覽" : "✎ 編輯抬頭 / 頁尾"}
          </button>
          {!editing && <button className="p" onClick={() => window.print()}>🖨 列印 / 存成 PDF</button>}
          {editing && <button className="p" onClick={onSave}>儲存設定</button>}
          {editing && (
            <button className="g" onClick={() => { if (confirm("回復所有文案為預設值？")) { resetDocSettings(); setCfg(DOC_DEFAULTS); } }}>
              回復預設
            </button>
          )}
          <button className="g" onClick={() => window.close()}>關閉</button>
        </div>
      </div>

      {editing && (
        <div className="cfg no-print">
          <div className="cfg-in">
            <p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
              以下文案會套用到<b>所有團</b>的訂金單與尾款單，設定存在這台電腦的瀏覽器裡。
            </p>
            {DOC_FIELDS.map(g => (
              <div className="cfg-g" key={g.group}>
                <div className="cfg-gt">{g.group}</div>
                {g.items.map(f => (
                  <div className="cfg-f" key={f.key}>
                    <label>{f.label}</label>
                    {f.image ? (
                      <>
                        <input type="file" accept="image/*" onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const rd = new FileReader();
                          rd.onload = () => set(f.key, String(rd.result));
                          rd.readAsDataURL(file);
                        }} />
                        {cfg.logo && (
                          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10 }}>
                            <img src={cfg.logo} alt="" style={{ height: 40 }} />
                            <button onClick={() => set("logo", "")}
                              style={{ fontSize: 11, padding: "3px 9px", borderRadius: 5, border: "1px solid #ddd", cursor: "pointer", background: "#fff" }}>
                              移除
                            </button>
                          </div>
                        )}
                      </>
                    ) : f.multiline ? (
                      <>
                        <textarea value={String(cfg[f.key] ?? "")} placeholder={f.ph}
                          onChange={e => set(f.key, e.target.value)} />
                        <div className="cfg-hint">一行一條，會自動編號列出</div>
                      </>
                    ) : (
                      <input value={String(cfg[f.key] ?? "")} placeholder={f.ph}
                        onChange={e => set(f.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            ))}
            <div style={{ height: 30 }} />
          </div>
        </div>
      )}

      <div className="doc-body">
        <div className="sheet">
          {/* 頁首 */}
          <div className="dh">
            {cfg.logo && <img className="dh-logo" src={cfg.logo} alt="" />}
            <div className="dh-main">
              <div className="dh-name">{cfg.companyName}</div>
              {cfg.companyNameEn && <div className="dh-en">{cfg.companyNameEn}</div>}
              {cfg.tagline && <div className="dh-tag">{cfg.tagline}</div>}
            </div>
            {(contact.length > 0 || legal.length > 0) && (
              <div className="dh-meta">
                {contact.map((l, i) => <div key={i}>{l}</div>)}
                {legal.map((l, i) => <div key={`l${i}`}>{l}</div>)}
              </div>
            )}
          </div>
          <div className="rule" />

          {/* 標題 */}
          <div className="dt">
            <div>
              <div className="dt-title">{title}</div>
              <div className="dt-sub">{titleEn}</div>
            </div>
            <div className="dt-date">
              <div>製表日期　{printDate}</div>
              {cfg.deadlineLabel && <div style={{ color: DOC.brand, fontWeight: 700 }}>{cfg.deadlineLabel}</div>}
            </div>
          </div>

          {/* 團資訊 */}
          <div className="info">
            <div className="info-name">{tour.name}</div>
            <div className="info-row">
              <span>出發<b>{fmtDate(tour.start_date)}</b></span>
              <span>回程<b>{fmtDate(tour.end_date)}</b></span>
              <span>人數<b>{rows.length} 人</b></span>
              {tour.destination && <span>目的地<b>{tour.destination}</b></span>}
            </div>
          </div>

          {/* 金額 */}
          {isSummary ? (
            <>
              <table className="amt">
                <thead>
                  <tr><th style={{ width: "42%" }}>項目</th><th className="num" style={{ width: "26%" }}>金額</th><th>說明</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{isDeposit ? "應收訂金總額" : "團費總額"}</td>
                    <td className="num">{nt(isDeposit ? sum.due : sum.total)}</td>
                    <td className="muted">
                      {isDeposit
                        ? `每人 ${nt(depositPerPerson)} × ${items.filter(x => x.due > 0).length} 人`
                        : `全團 ${items.length} 人合計`}
                    </td>
                  </tr>
                  {!isDeposit && (
                    <tr>
                      <td>減：已收訂金</td>
                      <td className="num neg">− {sum.depositPaid.toLocaleString()}</td>
                      <td className="muted">已入帳之訂金</td>
                    </tr>
                  )}
                  <tr>
                    <td>減：{isDeposit ? "已收訂金" : "已收尾款"}</td>
                    <td className="num neg">− {sum.paid.toLocaleString()}</td>
                    <td className="muted">已繳清 {paidCount} 人／未繳清 {openCount} 人</td>
                  </tr>
                </tbody>
              </table>
              <div className="total">
                <div className="total-l">本次應收金額</div>
                <div>
                  <div className="total-n">{nt(sum.owed)}</div>
                  <div className="total-s">{sum.owed > 0 ? "請於期限前完成匯款" : "已全數收訖，感謝您的配合"}</div>
                </div>
              </div>
            </>
          ) : (
            <>
              <table className="det">
                <thead>
                  <tr>
                    <th style={{ width: "6%" }}>#</th>
                    <th style={{ width: "20%", textAlign: "left" }}>旅客姓名</th>
                    <th style={{ width: "10%" }}>身份</th>
                    <th style={{ width: "8%" }}>房號</th>
                    {!isDeposit && <th className="num" style={{ width: "13%" }}>團費總額</th>}
                    {!isDeposit && <th className="num" style={{ width: "13%" }}>已繳訂金</th>}
                    <th className="num" style={{ width: "13%" }}>{isDeposit ? "應繳訂金" : "應繳尾款"}</th>
                    <th className="num" style={{ width: "13%" }}>已繳金額</th>
                    <th className="num" style={{ width: "13%" }}>尚欠金額</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(x => (
                    <tr key={x.seq}>
                      <td style={{ textAlign: "center", color: DOC.muted }}>{x.seq}</td>
                      <td style={{ fontWeight: 600 }}>{x.name}</td>
                      <td style={{ textAlign: "center" }} className="muted">{x.type}</td>
                      <td style={{ textAlign: "center" }} className="muted">{x.room || "—"}</td>
                      {!isDeposit && <td className="num">{cell(x.total)}</td>}
                      {!isDeposit && <td className="num muted">{cell(x.depositPaid)}</td>}
                      <td className="num" style={{ fontWeight: 600 }}>{cell(x.due)}</td>
                      <td className="num">{cell(x.paid)}</td>
                      <td className={`num ${x.owed > 0 ? "owed" : "paid-ok"}`}>
                        {x.owed > 0 ? x.owed.toLocaleString() : "已繳清"}
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={isDeposit ? 7 : 9} style={{ textAlign: "center", padding: "26px", color: DOC.muted }}>
                      本團尚未加入旅客
                    </td></tr>
                  )}
                </tbody>
              </table>
              <div className="total">
                <div className="total-l">合計應收（{items.length} 人）</div>
                <div>
                  <div className="total-n">{nt(sum.owed)}</div>
                  <div className="total-s">已繳清 {paidCount} 人／未繳清 {openCount} 人</div>
                </div>
              </div>
            </>
          )}

          {isDeposit && depositPerPerson === 0 && (
            <p style={{ marginTop: 10, fontSize: "8.3pt", color: DOC.brand }}>
              ※ 尚未於「基本資料」設定每人訂金金額，應繳訂金欄為 0。
            </p>
          )}

          {/* 匯款資訊 */}
          <div className="pay">
            <div className="pay-h">匯款資訊　REMITTANCE</div>
            <div className="pay-b">
              <div><span className="k">銀行／分行</span><span className="v">{cfg.bankName}</span></div>
              <div><span className="k">戶名</span><span className="v">{cfg.bankAccountName}</span></div>
              <div><span className="k">帳號</span><span className="v">{cfg.bankAccountNo}</span></div>
              <div><span className="k">繳款期限</span><span className="v">{cfg.deadlineLabel}</span></div>
            </div>
          </div>

          {/* 注意事項 */}
          {noteLines.length > 0 && (
            <div className="note">
              <div className="note-h">注意事項</div>
              <ol>{noteLines.map((l, i) => <li key={i}>{l}</li>)}</ol>
            </div>
          )}

          {/* 頁尾 */}
          <div className="foot">
            {cfg.footerNote && <div className="foot-msg">{cfg.footerNote}</div>}
            <div className="sign">
              <div><div className="sign-l">{cfg.signLeft}</div><div className="sign-u" /></div>
              <div><div className="sign-l">{cfg.signRight}</div><div className="sign-u" /></div>
            </div>
            <div className="foot-co">
              {cfg.companyName}
              {contact.length > 0 && <>　·　{contact.join("　·　")}</>}
              {legal.length > 0 && <div>{legal.join("　·　")}</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
