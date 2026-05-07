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
  const allFlight = [...new Set(segments.map(s => s.flightNum))].join(" / ");

  const results: ParsedFlight[] = [];
  for (const [pNum, name] of [...passengers.entries()].sort((a,b)=>a[0]-b[0])) {
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

// ─── AI fallback prompt ───────────────────────────────────────────────────────
const SYSTEM_PROMPT = `你是航空機票/訂位確認單解析系統。從機票文字或圖片中提取所有航班資訊。

重要規則：
- 每位旅客獨立一筆，不要將多人合併在同一筆
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
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenRouter API error:", err);
      return NextResponse.json({ error: "API error: " + response.status }, { status: 500 });
    }

    const data = await response.json();
    const raw: string = data.choices?.[0]?.message?.content || "";

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("No JSON array found in flight OCR response:", raw);
      return NextResponse.json({ error: "Could not parse flight data", raw }, { status: 500 });
    }
    const flights = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ flights: Array.isArray(flights) ? flights : [flights], source: "ai" });
  } catch (e) {
    console.error("Flight OCR route error:", e);
    return NextResponse.json({ error: "Processing failed: " + (e as Error).message }, { status: 500 });
  }
}
