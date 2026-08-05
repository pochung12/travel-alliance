// 航班分組共用邏輯：航班總覽卡片與旅客分頁的「航班組」下拉共用，
// 確保兩邊的組編號一致（同樣的 flights 順序 → 同樣的卡片順序）。
import { supabase, TourFlight } from "@/lib/supabase";

export interface FlightCard {
  names: string[];       // 空陣列 = 預設（未指定旅客）
  flights: TourFlight[];
}

// 行程簽名：日期+航班號+起迄+時間，完全相同的行程併成同一張卡
const sig = (fs: TourFlight[]) => fs
  .slice()
  .sort((a, b) => (a.flight_date || "").localeCompare(b.flight_date || "") || (a.departure_time || "").localeCompare(b.departure_time || ""))
  .map(f => `${f.flight_date}|${f.flight_number}|${f.departure_airport}|${f.departure_time}|${f.arrival_airport}|${f.arrival_time}`)
  .join("//");

/** 依 passenger_name 分組 → 相同行程合併成卡片 */
export function computeFlightCards(flights: TourFlight[]): FlightCard[] {
  const groups = new Map<string, TourFlight[]>();
  flights.forEach(f => {
    const key = (f.passenger_name || "").trim() || "__ALL__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  });
  const merged = new Map<string, FlightCard>();
  groups.forEach((fs, name) => {
    const s = sig(fs);
    if (!merged.has(s)) merged.set(s, { names: [], flights: fs });
    if (name !== "__ALL__") merged.get(s)!.names.push(name);
  });
  return Array.from(merged.values());
}

/** 這位旅客目前屬於哪張卡（null = 預設／未指派）*/
export function groupIndexOf(cards: FlightCard[], name: string): number | null {
  const n = (name || "").trim();
  if (!n) return null;
  const i = cards.findIndex(c => c.names.includes(n));
  return i >= 0 ? i : null;
}

/** 卡片短標籤：組N（CZ3024/CZ8220）*/
export function cardShortLabel(cards: FlightCard[], i: number): string {
  const card = cards[i];
  if (!card) return "";
  const base = card.names.length === 0 ? "預設" : `組 ${i + 1}`;
  const nos = Array.from(new Set(card.flights.map(f => f.flight_number).filter(Boolean)));
  const noStr = nos.slice(0, 2).join("/") + (nos.length > 2 ? "…" : "");
  return noStr ? `${base}（${noStr}）` : base;
}

/**
 * 指派旅客到某張卡：先刪掉他名下所有個人航班，再複製該卡航段給他。
 * card 為 null 或預設卡（names 為空）時只刪不加 = 回到預設航班。
 */
export async function assignPassengerToCard(
  tourId: string,
  name: string,
  card: FlightCard | null,
): Promise<string | null> {
  const n = (name || "").trim();
  if (!n) return "旅客姓名為空";
  const { error: delErr } = await supabase
    .from("tour_flights").delete().eq("tour_id", tourId).eq("passenger_name", n);
  if (delErr) return delErr.message;
  if (!card || card.names.length === 0) return null;
  const rows = card.flights.map(f => ({
    tour_id: tourId, passenger_name: n,
    flight_number: f.flight_number, flight_date: f.flight_date,
    departure_time: f.departure_time, arrival_time: f.arrival_time,
    departure_airport: f.departure_airport, departure_terminal: f.departure_terminal,
    arrival_airport: f.arrival_airport, arrival_terminal: f.arrival_terminal,
    pnr: "", ticket_number: "", ticket_number_return: "", special_meal: "", notes: "",
  }));
  const { error: insErr } = await supabase.from("tour_flights").insert(rows);
  return insErr ? insErr.message : null;
}
