// 應收客款計算：旅客分頁與收付款分頁共用同一套口徑，避免兩處數字打架
import { Tour } from "@/lib/supabase";

export interface PayLite {
  type: string;
  category: string;
  amount: number;
  customer_ids: string[] | null;
}

export interface PartLite {
  customer_id: string;
  participant_type?: string | null;
  deposit_amount?: number | null;
  balance_amount?: number | null;
  customer: { name: string };
}

/** 依身份類別取應收總額（成人／只參團／兒童／嬰兒／自訂類別）*/
export function priceOfType(tour: Pick<Tour,
  "selling_price" | "price_tour_only" | "price_child" | "price_infant" | "custom_price_tiers">,
  participantType?: string | null,
): number {
  const t = participantType || "adult";
  if (t === "adult")     return tour.selling_price   || 0;
  if (t === "tour_only") return tour.price_tour_only || 0;
  if (t === "child")     return tour.price_child     || 0;
  if (t === "infant")    return tour.price_infant    || 0;
  return (tour.custom_price_tiers || []).find(ct => ct.id === t)?.price || 0;
}

/** 收付款紀錄中有勾選此旅客的款項，依勾選人數平分 */
export function linkedAmount(payments: PayLite[], customerId: string, category: "deposit" | "balance"): number {
  return payments
    .filter(p => p.type === "income" && p.category === category && (p.customer_ids || []).includes(customerId))
    .reduce((s, p) => s + Math.round(p.amount / Math.max(1, (p.customer_ids || []).length)), 0);
}

export interface ReceivableRow {
  customer_id: string;
  name: string;
  participant_type: string;
  expected: number;       // 應收總額
  depositPaid: number;    // 已收訂金
  balancePaid: number;    // 已收尾款
  received: number;       // 已收合計
  outstanding: number;    // 尚未收
  depositLinked: boolean; // 訂金來自收付款紀錄（非手動填寫）
  balanceLinked: boolean;
}

/**
 * 每位旅客的應收明細。
 * 已收金額優先採用「收付款紀錄勾選並平分」的結果；沒有勾選時退回旅客分頁手動填寫的金額。
 * （與旅客分頁 deposit_amount / balance_amount 欄位的顯示邏輯相同）
 */
export function buildReceivables(
  tour: Parameters<typeof priceOfType>[0],
  participants: PartLite[],
  payments: PayLite[],
): ReceivableRow[] {
  return participants.map(p => {
    const expected = priceOfType(tour, p.participant_type);
    const dLinked = linkedAmount(payments, p.customer_id, "deposit");
    const bLinked = linkedAmount(payments, p.customer_id, "balance");
    const depositPaid = dLinked > 0 ? dLinked : (p.deposit_amount || 0);
    const balancePaid = bLinked > 0 ? bLinked : (p.balance_amount || 0);
    const received = depositPaid + balancePaid;
    return {
      customer_id: p.customer_id,
      name: p.customer?.name || "（未命名）",
      participant_type: p.participant_type || "adult",
      expected,
      depositPaid, balancePaid, received,
      outstanding: Math.max(0, expected - received),
      depositLinked: dLinked > 0,
      balanceLinked: bLinked > 0,
    };
  });
}

export function receivableTotals(rows: ReceivableRow[]) {
  return rows.reduce((a, r) => ({
    expected:    a.expected + r.expected,
    received:    a.received + r.received,
    outstanding: a.outstanding + r.outstanding,
    unpaidCount: a.unpaidCount + (r.outstanding > 0 ? 1 : 0),
    paidCount:   a.paidCount + (r.outstanding === 0 && r.expected > 0 ? 1 : 0),
  }), { expected: 0, received: 0, outstanding: 0, unpaidCount: 0, paidCount: 0 });
}
