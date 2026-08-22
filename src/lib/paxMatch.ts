// GDS 英文姓名 ↔ CRM 團員姓名 比對
// GDS：CHENG/POCHUNG、LIAN/WEIKE MSTR
// CRM name_en 觀察到三種寫法：
//   「CHENG, PO-CHUNG」（逗號＋連字號，最常見）
//   「HUNG CHIEN-WEN」（無逗號）
//   「TSAI<<WEN<CHUNG」（護照 MRZ 格式）

export interface PaxCandidate { name: string; name_en?: string | null }

/** 只留英文字母並轉大寫，做為比對鍵 */
function letters(s?: string | null): string {
  return (s || "").toUpperCase().replace(/[^A-Z]/g, "");
}

/** 拆成「姓 / 名」兩段（逗號 → 斜線 → MRZ的<< → 第一個空白）*/
function splitParts(s?: string | null): [string, string] | null {
  const raw = (s || "").trim();
  if (!raw) return null;
  for (const sep of [",", "/", "<<"]) {
    const i = raw.indexOf(sep);
    if (i > 0) return [letters(raw.slice(0, i)), letters(raw.slice(i + sep.length))];
  }
  const m = raw.match(/^(\S+)\s+(.+)$/);
  return m ? [letters(m[1]), letters(m[2])] : null;
}

/** 一個姓名可能的比對鍵（正序 + 姓名顛倒，涵蓋建檔順序不同的情況）*/
export function nameKeys(s?: string | null): string[] {
  const flat = letters(s);
  if (!flat) return [];
  const keys = new Set<string>([flat]);
  const p = splitParts(s);
  if (p && p[0] && p[1]) { keys.add(p[0] + p[1]); keys.add(p[1] + p[0]); }
  return Array.from(keys);
}

export interface MatchResult {
  matched: Map<string, string>;   // GDS 原名 → CRM 中文姓名
  ambiguous: string[];            // 對到多位團員，不自動換
  unmatched: string[];            // 找不到對應
}

/**
 * 把一批 GDS 姓名對應到團員。
 * 只有「唯一命中」才回傳對應；命中多位或零位都不自動改，交由人工判斷。
 */
export function matchPassengers(gdsNames: string[], members: PaxCandidate[]): MatchResult {
  // 建索引：比對鍵 → 中文姓名集合
  const index = new Map<string, Set<string>>();
  for (const m of members) {
    const zh = (m.name || "").trim();
    if (!zh) continue;
    for (const k of [...nameKeys(m.name_en), ...nameKeys(m.name)]) {
      if (!k) continue;
      if (!index.has(k)) index.set(k, new Set());
      index.get(k)!.add(zh);
    }
  }
  const matched = new Map<string, string>();
  const ambiguous: string[] = [];
  const unmatched: string[] = [];
  for (const g of Array.from(new Set(gdsNames.filter(Boolean)))) {
    let hit: Set<string> | undefined;
    for (const k of nameKeys(g)) {
      const s = index.get(k);
      if (s && s.size > 0) { hit = s; break; }
    }
    if (!hit) unmatched.push(g);
    else if (hit.size > 1) ambiguous.push(g);
    else matched.set(g, Array.from(hit)[0]);
  }
  return { matched, ambiguous, unmatched };
}
