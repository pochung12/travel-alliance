// 機票匯入的整合邏輯：批內去重、與既有紀錄比對、全團航班展開到每位團員
import { TourFlight } from "@/lib/supabase";

export type FlightRow = Omit<TourFlight, "id" | "tour_id" | "created_at">;

/** 同一筆的判定：旅客 + 航班號 + 日期 + 出發時間 */
export function flightKey(f: Partial<FlightRow>): string {
  return [
    (f.passenger_name || "").trim().toUpperCase(),
    (f.flight_number || "").trim().toUpperCase(),
    (f.flight_date || "").trim(),
    (f.departure_time || "").trim(),
  ].join("|");
}

const FIELDS: (keyof FlightRow)[] = [
  "passenger_name", "pnr", "ticket_number", "ticket_number_return",
  "flight_number", "flight_date", "departure_time", "arrival_time",
  "departure_airport", "departure_terminal", "arrival_airport", "arrival_terminal",
  "special_meal", "notes",
];

const isEmpty = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/** 兩筆合併：以 base 為底，用 extra 補上 base 空白的欄位（不覆蓋既有值）*/
export function fillBlanks(base: FlightRow, extra: Partial<FlightRow>): FlightRow {
  const out = { ...base };
  for (const k of FIELDS) {
    if (isEmpty(out[k]) && !isEmpty(extra[k])) {
      (out as Record<string, unknown>)[k] = extra[k];
    }
  }
  return out;
}

export interface MergeResult { rows: FlightRow[]; mergedCount: number }

/** 同一批解析結果內的重複列合併成一筆 */
export function mergeRows(rows: FlightRow[]): MergeResult {
  const map = new Map<string, FlightRow>();
  let merged = 0;
  for (const r of rows) {
    const k = flightKey(r);
    const cur = map.get(k);
    if (cur) { map.set(k, fillBlanks(cur, r)); merged++; }
    else map.set(k, { ...r });
  }
  return { rows: Array.from(map.values()), mergedCount: merged };
}

export interface SplitResult {
  toInsert: FlightRow[];
  toUpdate: { id: string; patch: Partial<FlightRow> }[];  // 只補既有紀錄的空白欄位
  unchanged: number;
}

/** 跟資料庫既有紀錄比對：已存在的只補空白欄位，不重複新增 */
export function splitAgainstExisting(rows: FlightRow[], existing: TourFlight[]): SplitResult {
  const byKey = new Map<string, TourFlight>();
  for (const e of existing) byKey.set(flightKey(e), e);

  const toInsert: FlightRow[] = [];
  const toUpdate: { id: string; patch: Partial<FlightRow> }[] = [];
  let unchanged = 0;

  for (const r of rows) {
    const hit = byKey.get(flightKey(r));
    if (!hit) { toInsert.push(r); continue; }
    const patch: Partial<FlightRow> = {};
    for (const k of FIELDS) {
      if (isEmpty(hit[k]) && !isEmpty(r[k])) (patch as Record<string, unknown>)[k] = r[k];
    }
    if (Object.keys(patch).length > 0) toUpdate.push({ id: hit.id, patch });
    else unchanged++;
  }
  return { toInsert, toUpdate, unchanged };
}

/**
 * 沒填旅客姓名的航班＝全團適用，展開成每位團員各一筆。
 * 已經有個人資料的旅客不重複產生（以 flightKey 判定）。
 */
export function expandToMembers(rows: FlightRow[], memberNames: string[]): MergeResult {
  const members = Array.from(new Set(memberNames.map(n => n.trim()).filter(Boolean)));
  if (members.length === 0) return { rows, mergedCount: 0 };

  const named = rows.filter(r => (r.passenger_name || "").trim());
  const shared = rows.filter(r => !(r.passenger_name || "").trim());
  if (shared.length === 0) return { rows, mergedCount: 0 };

  const existing = new Set(named.map(flightKey));
  const out: FlightRow[] = [...named];
  let added = 0;
  for (const s of shared) {
    for (const m of members) {
      const row = { ...s, passenger_name: m };
      const k = flightKey(row);
      if (existing.has(k)) continue;      // 該旅客這班已有個人資料 → 不覆蓋
      existing.add(k);
      out.push(row);
      added++;
    }
  }
  return { rows: out, mergedCount: added };
}
