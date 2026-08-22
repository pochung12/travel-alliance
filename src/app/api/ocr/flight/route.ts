import { NextRequest, NextResponse } from "next/server";

// ─── Month mapping ────────────────────────────────────────────────────────────
const MONTH_NUM: Record<string, string> = {
  JAN:"01",FEB:"02",MAR:"03",APR:"04",MAY:"05",JUN:"06",
  JUL:"07",AUG:"08",SEP:"09",OCT:"10",NOV:"11",DEC:"12",
};

function gdsDate(day: string, month: string): string {
  const mon = MONTH_NUM[month.toUpperCase()] ?? "01";
  const d   = day.padStart(2, "0");
  const now = new Date();
  const flightMon = parseInt(mon);
  const curMon    = now.getMonth() + 1;
  let year = now.getFullYear();
  // If flight month is far in the past → likely next year booking
  if (flightMon - curMon < -6) year++;
  // If flight month is far in the future (>10) → edge case, assume current year
  return `${year}-${mon}-${d}`;
}

function terminalNorm(t: string): string {
  if (!t) return "";
  if (/^\d$/.test(t)) return "T" + t;
  return t;
}

interface SegInfo {
  flightNum: string;   // e.g. "MU5008"
  flightShort: string; // e.g. "5008"
  date: string;
  depAirport: string; arrAirport: string;
  depTime: string;    arrTime: string;
  depTerminal: string; arrTerminal: string;
}

type ParsedFlight = {
  passenger_name: string; pnr: string;
  ticket_number: string;  ticket_number_return: string;
  flight_number: string;  flight_date: string;
  departure_time: string; arrival_time: string;
  departure_airport: string;  departure_terminal: string;
  arrival_airport: string;    arrival_terminal: string;
  special_meal: string;       notes: string;
};

// ─── Deterministic GDS PNR parser ────────────────────────────────────────────
function isGdsPnr(text: string): boolean {
  return /NM\d+\s+[A-Z0-9]{6}/.test(text) || /SSR\s+TKNE/.test(text);
}

function parseGdsPnr(text: string): ParsedFlight[] | null {
  if (!isGdsPnr(text)) return null;

  const rawLines = text.split(/\r?\n/);

  // 1. PNR code  ── look for 6-char alphanum after NM\d+
  let pnr = "";
  const pnrM = text.match(/NM\d+\s+([A-Z0-9]{6})/);
  if (pnrM) pnr = pnrM[1];

  // 2. Passengers  ── "1.CHEN/CHUNHSIUNG" scattered anywhere in text
  const passengers = new Map<number, string>();
  // Match all occurrences of  NUM.LASTNAME/FIRSTNAME  (NAME only letters+slash)
  const paxRe = /(?<!\d)(\d{1,3})\.(([A-Z]+)\/([A-Z]+(?:\s[A-Z]+)*))/g;
  let pm: RegExpExecArray | null;
  while ((pm = paxRe.exec(text)) !== null) {
    const num  = parseInt(pm[1]);
    const name = pm[2].trim();
    // Skip if name looks like a flight  e.g. "MU5008" or SSR lines
    if (num < 1 || num > 99) continue;
    if (/\d/.test(name.split("/")[0])) continue;   // lastname has digit → flight
    passengers.set(num, name);
  }

  // 3. Flight segments  ── lines like:
  //   "20.MU5008 V FR15MAY TPEPVG RR19 1530 1730 E 2 T1"
  //   "21.FM9341 B FR15MAY PVGDYG RR19 2025 2240 E T1 T2"
  const segments: SegInfo[] = [];
  const segRe = /^(\d+)\.(([A-Z]{1,3})(\d{3,4}))\s+[A-Z]\s+(?:[A-Z]{2})?(\d{1,2})([A-Z]{3})\s+([A-Z]{3})([A-Z]{3})\s+\S+\s+(\d{4})\s+(\d{4})(.*)/;
  for (const rawLine of rawLines) {
    const m = rawLine.match(segRe);
    if (!m) continue;
    const [, , flightFull, , , day, month, dep, arr, depRaw, arrRaw, tail] = m;
    // Parse terminals from tail:  "E 2 T1"  or  "E T1 T2"  etc.
    const tailParts = tail.trim().replace(/^E\s+/, "").split(/\s+/).filter(Boolean);
    const depTerm = terminalNorm(tailParts[0] ?? "");
    const arrTerm = terminalNorm(tailParts[1] ?? "");
    const flightShort = flightFull.match(/\d+/)?.[0] ?? "";
    segments.push({
      flightNum: flightFull,
      flightShort,
      date: gdsDate(day, month),
      depAirport: dep, arrAirport: arr,
      depTime: depRaw.slice(0,2) + ":" + depRaw.slice(2),
      arrTime: arrRaw.slice(0,2) + ":" + arrRaw.slice(2),
      depTerminal: depTerm, arrTerminal: arrTerm,
    });
  }

  // 4. SSR TKNE  ── map (flightShort, pNum) → ticketNum  for coupon #1
  //   "40.SSR TKNE MU HK1 TPEPVG 5008 V15MAY 7812418344806/1/P1"
  //   "59.SSR TKNE FM HK1 PVGDYG 9341 B15MAY 7812418344806/2/P1"
  const tkne = new Map<string, Map<string, string>>(); // flightShort → (pNum → ticket)
  const tkneRe = /SSR\s+TKNE\s+\S+\s+HK1\s+[A-Z]{6}\s+(\d{3,4})\s+\S+\s+(\d{10,13})\/(\d+)\/P(\d+)/g;
  let tm: RegExpExecArray | null;
  while ((tm = tkneRe.exec(text)) !== null) {
    const [, flightShort, ticket, coupon, pNum] = tm;
    if (!tkne.has(flightShort)) tkne.set(flightShort, new Map());
    // Only record coupon=1 (or first seen) as canonical ticket for this flight
    const existing = tkne.get(flightShort)!.get(pNum);
    if (!existing || coupon === "1") tkne.get(flightShort)!.set(pNum, ticket);
  }

  if (passengers.size === 0 || segments.length === 0) return null;

  // 5. Build one row per passenger
  const outSeg  = segments[0];
  const retSeg  = segments[segments.length - 1];
  const allFlight = Array.from(new Set(segments.map(s => s.flightNum))).join(" / ");

  const results: ParsedFlight[] = [];
  for (const [pNum, name] of Array.from(passengers.entries()).sort((a,b)=>a[0]-b[0])) {
    const ps = String(pNum);
    const outTicket = tkne.get(outSeg.flightShort)?.get(ps) ?? "";
    const retTicket = (retSeg !== outSeg)
      ? (tkne.get(retSeg.flightShort)?.get(ps) ?? "")
      : "";
    results.push({
      passenger_name:    name,
      pnr,
      ticket_number:        outTicket,
      ticket_number_return: retTicket,
      flight_number:     outSeg.flightNum,
      flight_date:       outSeg.date,
      departure_time:    outSeg.depTime,
      arrival_time:      outSeg.arrTime,
      departure_airport: outSeg.depAirport,
      departure_terminal:outSeg.depTerminal,
      arrival_airport:   outSeg.arrAirport,
      arrival_terminal:  outSeg.arrTerminal,
      special_meal: "",
      notes: segments.length > 1 ? allFlight : "",
    });
  }
  return results.length > 0 ? results : null;
}


// ─── 旅行社 PNR 摘要格式解析（>>PNR ／ 無行號航段 ／ 票號清單）────────────────
// 範例：
//   >>FZJDX4
//   JX804 G 04SEP FRI TPE NRT 1500 1925 HK1
//   YANG/MINGYU MR
//   189 2106363219 YANG/MINGYU MR
//   VLML JX 804 TPENRT/FANG/YICHUN MS(ADT)
const MEAL_ZH: Record<string, string> = {
  VLML:"蛋奶素", VGML:"全素", AVML:"亞洲素食", RVML:"生菜素食", ORML:"東方素食",
  HNML:"印度餐", MOML:"回教餐", KSML:"猶太餐", CHML:"兒童餐", BBML:"嬰兒餐",
  SFML:"海鮮餐", LSML:"低鹽餐", DBML:"糖尿病餐", GFML:"無麩質餐", FPML:"水果餐",
  NLML:"無乳糖餐", LFML:"低脂餐", LCML:"低卡餐", NSML:"無鹽餐", PRML:"低普林餐",
  BLML:"無刺激餐", SPML:"特殊餐", NFML:"無魚餐",
};
const WEEKDAY_NUM: Record<string, number> = { SUN:0, MON:1, TUE:2, WED:3, THU:4, FRI:5, SAT:6 };
const TITLE_RE = /\s+(MSTR|MISS|MRS|MR|MS|DR)\.?\b/;

/** 用 GDS 附的星期反推年份（04SEP FRI → 只有某一年的 9/4 是星期五）*/
function gdsDateSmart(day: string, month: string, weekday?: string): string {
  const mon = MONTH_NUM[month.toUpperCase()] ?? "01";
  const d = day.padStart(2, "0");
  const wd = weekday ? WEEKDAY_NUM[weekday.toUpperCase()] : undefined;
  if (wd !== undefined) {
    const y0 = new Date().getFullYear();
    for (const y of [y0, y0 + 1, y0 - 1, y0 + 2]) {
      const dt = new Date(`${y}-${mon}-${d}T12:00:00`);
      if (!isNaN(dt.getTime()) && dt.getDay() === wd) return `${y}-${mon}-${d}`;
    }
  }
  return gdsDate(day, month);
}

/** 去掉稱謂與括號註記，做為姓名比對鍵 */
function paxKey(raw: string): string {
  return raw.toUpperCase()
    .replace(/\((?:CHILD|CHD|INF|INFANT|ADT|ADULT)\)/g, "")
    .replace(/\(\d{1,2}[A-Z]{3}\d{2,4}\)/g, "")
    .replace(TITLE_RE, " ")
    .replace(/[^A-Z/]+/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

interface AgentSeg {
  flight: string; date: string;
  dep: string; arr: string;
  depTime: string; arrTime: string;
  seats: number;
}

function isAgentPnr(text: string): boolean {
  if (/^\s*>>\s*[A-Z0-9]{5,6}\s*$/m.test(text)) return true;
  return /^[A-Z0-9]{2}\s?\d{1,4}\s+[A-Z]\s+\d{1,2}[A-Z]{3}\s+(MON|TUE|WED|THU|FRI|SAT|SUN)\b/m.test(text);
}

/** 解析單行航段；認得「TPE NRT」與「TPENRT」兩種寫法，星期可有可無 */
function parseAgentSeg(line: string): AgentSeg | null {
  const t = line.trim().split(/\s+/);
  if (t.length < 6) return null;
  if (!/^[A-Z0-9]{2}\d{1,4}$/.test(t[0])) return null;          // 航班號 JX804
  let i = 1;
  if (/^[A-Z]$/.test(t[i])) i++;                                 // 艙等 G（可省略）
  const dm = (t[i] || "").match(/^(\d{1,2})([A-Z]{3})$/);         // 04SEP
  if (!dm) return null;
  i++;
  let weekday: string | undefined;
  if (t[i] && WEEKDAY_NUM[t[i].toUpperCase()] !== undefined) { weekday = t[i]; i++; }
  let dep = "", arr = "";
  if (/^[A-Z]{3}$/.test(t[i] || "") && /^[A-Z]{3}$/.test(t[i + 1] || "")) {
    dep = t[i]; arr = t[i + 1]; i += 2;                           // TPE NRT
  } else if (/^[A-Z]{6}$/.test(t[i] || "")) {
    dep = t[i].slice(0, 3); arr = t[i].slice(3); i++;             // TPENRT
  } else return null;
  const times = t.slice(i).filter(x => /^\d{4}$/.test(x));
  if (times.length < 2) return null;
  const statusTok = t.slice(i).find(x => /^[A-Z]{2}\d+$/.test(x)) || "";
  const seats = parseInt(statusTok.replace(/^[A-Z]{2}/, "")) || 0;
  return {
    flight: t[0],
    date: gdsDateSmart(dm[1], dm[2], weekday),
    dep, arr,
    depTime: times[0].slice(0, 2) + ":" + times[0].slice(2),
    arrTime: times[1].slice(0, 2) + ":" + times[1].slice(2),
    seats,
  };
}

function parseAgentPnr(text: string): ParsedFlight[] | null {
  if (!isAgentPnr(text)) return null;

  // 以 >>PNR 切成多個訂位紀錄（沒有 >> 時視為單一組）
  const lines = text.split(/\r?\n/);
  const blocks: { pnr: string; lines: string[] }[] = [];
  let cur: { pnr: string; lines: string[] } = { pnr: "", lines: [] };
  for (const raw of lines) {
    const m = raw.trim().match(/^>>\s*([A-Z0-9]{5,6})$/);
    if (m) { if (cur.lines.length) blocks.push(cur); cur = { pnr: m[1], lines: [] }; }
    else cur.lines.push(raw);
  }
  if (cur.lines.length) blocks.push(cur);

  const out: ParsedFlight[] = [];

  for (const blk of blocks) {
    const segs: AgentSeg[] = [];
    const paxOrder: string[] = [];                       // 顯示用姓名（去稱謂）
    const paxNote = new Map<string, string>();           // key → 兒童/嬰兒註記
    const tickets = new Map<string, string>();           // key → 189-2106363219
    const meals: { key: string; flight: string; meal: string }[] = [];

    for (const raw of blk.lines) {
      const line = raw.trim();
      if (!line) continue;

      // ① 航段
      const seg = parseAgentSeg(line);
      if (seg) { segs.push(seg); continue; }

      // ② 票號：189 2106363219 YANG/MINGYU MR
      const tk = line.match(/^(\d{3})[\s-]*(\d{10})\s+(.+)$/);
      if (tk) { tickets.set(paxKey(tk[3]), `${tk[1]}-${tk[2]}`); continue; }

      // ③ 特別餐：VLML JX 804 TPENRT/FANG/YICHUN MS(ADT)
      const ml = line.match(/^([A-Z]{4})\s+([A-Z0-9]{2})\s*(\d{1,4})\s+[A-Z]{6}\/(.+)$/);
      if (ml && MEAL_ZH[ml[1]]) {
        meals.push({ key: paxKey(ml[4]), flight: `${ml[2]}${ml[3]}`, meal: `${ml[1]} ${MEAL_ZH[ml[1]]}` });
        continue;
      }

      // ④ 旅客姓名：LIAN/WEIKE MSTR (Child) (03APR22)
      const px = line.match(/^([A-Z][A-Z '\-]*\/[A-Z][A-Z '\-]*?)\s+(MSTR|MISS|MRS|MR|MS|DR)\b(.*)$/);
      if (px) {
        const key = paxKey(px[1]);
        if (!paxOrder.includes(key)) paxOrder.push(key);
        const tail = (px[3] || "").trim();
        const notes: string[] = [];
        if (/child|chd/i.test(tail) || px[2] === "MSTR" || px[2] === "MISS") notes.push("兒童");
        if (/inf/i.test(tail)) notes.push("嬰兒");
        const bd = tail.match(/\((\d{1,2})([A-Z]{3})(\d{2,4})\)/);
        if (bd) {
          const yr = bd[3].length === 2 ? `20${bd[3]}` : bd[3];
          notes.push(`生日 ${yr}-${MONTH_NUM[bd[2]] || "01"}-${bd[1].padStart(2, "0")}`);
        }
        if (notes.length) paxNote.set(key, notes.join("・"));
        continue;
      }
    }

    if (segs.length === 0) continue;
    segs.sort((a, b) => a.date.localeCompare(b.date) || a.depTime.localeCompare(b.depTime));

    // 沒有列出姓名時（只有航班），至少回傳航段本身
    const keys = paxOrder.length > 0 ? paxOrder : [""];
    for (const key of keys) {
      const display = key;                                // 例：YANG/MINGYU
      const ticket = tickets.get(key) || "";
      for (const sg of segs) {
        const meal = meals.find(m => m.key === key && m.flight.replace(/\s/g, "") === sg.flight)?.meal
                  || meals.find(m => m.key === key)?.meal || "";
        out.push({
          passenger_name: display,
          pnr: blk.pnr,
          ticket_number: ticket,
          ticket_number_return: "",
          flight_number: sg.flight,
          flight_date: sg.date,
          departure_time: sg.depTime,
          arrival_time: sg.arrTime,
          departure_airport: sg.dep,
          departure_terminal: "",
          arrival_airport: sg.arr,
          arrival_terminal: "",
          special_meal: meal,
          notes: paxNote.get(key) || "",
        });
      }
    }
  }

  return out.length > 0 ? out : null;
}

// ─── AI fallback prompt ───────────────────────────────────────────────────────
const SYSTEM_PROMPT = `你是航空機票/訂位確認單解析系統。從機票文字或圖片中提取所有航班資訊。

重要規則：
- 每位旅客獨立一筆，不要將多人合併在同一筆
- **同一位旅客有去程與回程時，去程一筆、回程一筆**（不要把兩段塞進同一筆）
- 訂位代號（PNR）可能以 >>ABCDEF 或 NM1 ABCDEF 標示；一次可能貼上多組訂位，各自的旅客與票號要分開對應
- GDS 航段格式如「JX804 G 04SEP FRI TPE NRT 1500 1925 HK1」＝航班 艙等 日期 星期 出發地 目的地 出發時間 抵達時間 訂位狀態
- 票號格式如「189 2106363219 YANG/MINGYU MR」＝航空公司代碼 票號序號 旅客姓名，請組成 189-2106363219 填入該旅客
- 特別餐格式如「VLML JX 804 TPENRT/FANG/YICHUN MS(ADT)」＝餐型代碼 航班 航段/旅客姓名
- ticket_number 填「去程票號」（此旅客本次行程的主要票號）
- ticket_number_return 填「回程票號」（若有，且與去程票號不同才填）
- 若有多人且每人票號不同，請分別列出
- 日期格式 YYYY-MM-DD，時間格式 HH:MM（24小時制）
- 無法辨識的欄位填空字串 ""

回傳 JSON 陣列，每筆欄位如下：
passenger_name, pnr, ticket_number, ticket_number_return,
flight_number, flight_date, departure_time, arrival_time,
departure_airport, departure_terminal, arrival_airport, arrival_terminal,
special_meal, notes

只回傳 JSON 陣列，不要 markdown，不要說明文字。

範例（兩人同一班機不同票號）：
[
  {"passenger_name":"CHANG/POCHUNG","pnr":"ABCDEF","ticket_number":"7971234567890","ticket_number_return":"7979876543210","flight_number":"CI100","flight_date":"2025-06-15","departure_time":"10:30","arrival_time":"12:45","departure_airport":"TPE","departure_terminal":"T2","arrival_airport":"HKG","arrival_terminal":"T1","special_meal":"","notes":""},
  {"passenger_name":"WANG/XIAOMING","pnr":"ABCDEF","ticket_number":"7971234567891","ticket_number_return":"7979876543211","flight_number":"CI100","flight_date":"2025-06-15","departure_time":"10:30","arrival_time":"12:45","departure_airport":"TPE","departure_terminal":"T2","arrival_airport":"HKG","arrival_terminal":"T1","special_meal":"","notes":""}
]`;

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { text, imageBase64 } = await req.json();
    if (!text && !imageBase64) {
      return NextResponse.json({ error: "Missing text or imageBase64" }, { status: 400 });
    }

    // ── Try deterministic GDS PNR parser first (text only) ──
    if (text) {
      const agentParsed = parseAgentPnr(text);
      if (agentParsed && agentParsed.length > 0) {
        return NextResponse.json({ flights: agentParsed, source: "agent_pnr_parser" });
      }
      const gdsParsed = parseGdsPnr(text);
      if (gdsParsed && gdsParsed.length > 0) {
        return NextResponse.json({ flights: gdsParsed, source: "gds_parser" });
      }
    }

    // ── Fall back to AI ──
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });

    let messages: object[];
    if (imageBase64) {
      const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
      messages = [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: SYSTEM_PROMPT },
        ],
      }];
    } else {
      messages = [{
        role: "user",
        content: `${SYSTEM_PROMPT}\n\n以下是機票/訂位確認資訊：\n\n${text}`,
      }];
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://travel-alliance-production-1063.up.railway.app",
        "X-Title": "Travel Alliance Flight OCR",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        max_tokens: 32000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenRouter API error:", err);
      return NextResponse.json({ error: "API error: " + response.status }, { status: 500 });
    }

    const data = await response.json();
    const raw: string = data.choices?.[0]?.message?.content || "";

    // 先找完整陣列；若模型輸出被截斷（無收尾 ]），砍到最後一個完整物件再補上 ]
    let jsonText = raw.match(/\[[\s\S]*\]/)?.[0] || "";
    if (!jsonText) {
      const start = raw.indexOf("[");
      if (start >= 0) {
        const lastObjEnd = raw.lastIndexOf("}");
        if (lastObjEnd > start) jsonText = raw.slice(start, lastObjEnd + 1) + "]";
      }
    }
    if (!jsonText) {
      console.error("No JSON array found in flight OCR response:", raw);
      return NextResponse.json({ error: "Could not parse flight data", raw }, { status: 500 });
    }
    let flights;
    try {
      flights = JSON.parse(jsonText);
    } catch {
      const lastObjEnd = jsonText.lastIndexOf("}");
      const repaired = lastObjEnd > 0 ? jsonText.slice(0, lastObjEnd + 1) + "]" : "";
      try { flights = JSON.parse(repaired); }
      catch {
        console.error("Flight OCR JSON parse failed:", raw.slice(0, 500));
        return NextResponse.json({ error: "AI 回傳格式不完整，請改用純文字貼上或分批匯入", raw: raw.slice(0, 500) }, { status: 500 });
      }
    }
    return NextResponse.json({ flights: Array.isArray(flights) ? flights : [flights], source: "ai" });
  } catch (e) {
    console.error("Flight OCR route error:", e);
    return NextResponse.json({ error: "Processing failed: " + (e as Error).message }, { status: 500 });
  }
}
