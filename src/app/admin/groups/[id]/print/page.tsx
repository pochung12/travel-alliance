"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Tour, Customer, CustomerTour, ParticipantType } from "@/lib/supabase";

// ─── local supabase (no auth needed for same project) ─────────────────────────
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

// ─── Print page ───────────────────────────────────────────────────────────────
export default function PrintPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams  = useSearchParams();
  const layout  = searchParams.get("layout") ?? "full"; // full | payment | boarding
  const orderParam = searchParams.get("order");

  const [tour,   setTour]   = useState<Tour | null>(null);
  const [rows,   setRows]   = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: p }] = await Promise.all([
        sb.from("tours").select("*").eq("id", id).single(),
        sb.from("customer_tours")
          .select("*, customer:customers(*)")
          .eq("tour_id", id),
      ]);
      setTour(t as Tour);

      let sorted = (p || []) as Row[];

      // Restore saved order from URL param, or sort by room → name
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

  // Auto-print once loaded
  useEffect(() => {
    if (!loading && tour) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [loading, tour]);

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

  // ── Layout: full (旅客名單) ──────────────────────────────────────────────────
  if (layout === "full") {
    return <FullList tour={tour} rows={rows} printDate={printDate} />;
  }
  // ── Layout: payment (收款狀況) ───────────────────────────────────────────────
  if (layout === "payment") {
    return <PaymentList tour={tour} rows={rows} printDate={printDate} />;
  }
  // ── Layout: boarding (登機名單) ──────────────────────────────────────────────
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
  // Group by participant type
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
                    const passExpired = c.passport_expiry && c.passport_expiry < today;
                    const taibaoExpired = c.taibao_expiry && c.taibao_expiry < today;
                    return (
                      <tr key={r.id}>
                        <td className="num">{globalSeq}</td>
                        <td className="bold">{c.name}</td>
                        <td style={{ fontSize: "8pt", letterSpacing: "0.3px" }}>{c.name_en || ""}</td>
                        <td className="c">{GENDER_LABEL[c.gender] ?? "—"}</td>
                        <td className="c">{fmtDate(c.birthday)}</td>
                        <td className="c">{calcAge(c.birthday, tour.start_date)}</td>
                        <td style={{ fontFamily: "monospace, monospace", fontSize: "8pt" }}>{c.id_number || ""}</td>
                        <td style={{ fontFamily: "monospace, monospace", fontSize: "8pt" }}>
                          {c.passport || ""}
                        </td>
                        <td className={`c ${passExpired ? "expired" : ""}`}>
                          {fmtDate(c.passport_expiry)}{passExpired ? " ⚠" : ""}
                        </td>
                        <td style={{ fontFamily: "monospace, monospace", fontSize: "8pt" }}>
                          {c.taibao_number || ""}
                        </td>
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

// ─── Layout 3: 登機名單（精簡版）─────────────────────────────────────────────
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
                const passExpired   = c.passport_expiry  && c.passport_expiry  < today;
                const taibaoExpired = c.taibao_expiry    && c.taibao_expiry    < today;
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
