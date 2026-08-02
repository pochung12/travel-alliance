import { NextRequest, NextResponse } from "next/server";
import { airportInfo, knownTerminal, airlineCode } from "@/lib/airports";

export const maxDuration = 60;

/**
 * 航廈自動查詢
 * 流程：Tavily 上網搜尋該航班 / 該航空公司在該機場的航廈 → AI 萃取結論
 * POST { flights: [{ id, flight_number, flight_date, departure_airport, arrival_airport }] }
 * →    { results: [{ id, departure_terminal, arrival_terminal, source }] }
 */

interface InFlight {
  id: string;
  flight_number?: string;
  flight_date?: string;
  departure_airport?: string;
  arrival_airport?: string;
}

async function tavily(key: string, query: string): Promise<string> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
      }),
    });
    if (!res.ok) return "";
    const j = await res.json() as {
      answer?: string;
      results?: Array<{ title?: string; content?: string; url?: string }>;
    };
    const parts: string[] = [];
    if (j.answer) parts.push(`摘要：${j.answer}`);
    (j.results || []).slice(0, 5).forEach(r => {
      parts.push(`- ${r.title || ""}｜${(r.content || "").slice(0, 400)}｜${r.url || ""}`);
    });
    return parts.join("\n");
  } catch {
    return "";
  }
}

const SYSTEM = `你是機場航廈查詢助手。使用者提供多筆航班以及對應的網路搜尋結果，請判斷每一筆的「出發航廈」與「抵達航廈」。

只回傳合法 JSON（不要 markdown、不要說明文字），格式：
{"results":[{"id":"...","departure_terminal":"2","arrival_terminal":"1","source":"依據來源簡述"}]}

判斷規則（依序）：
1. 搜尋結果若明確指出該航班/該航空公司在該機場使用的航廈，直接採用。
2. 搜尋結果不明確時：若該機場只有一個旅客航廈，就填該航廈（例如只有 T1 就填 "1"）。
3. 仍不確定時，採用該航空公司在該機場「國際線」慣用的航廈，並在 source 註明「慣用航廈（待核對）」。
4. 只有在該機場根本不分航廈時，才填 "單一航廈"。絕對不要留空。

航廈值只填數字或極簡標籤，例如 "1"、"2"、"3"、"T2 國際線"、"單一航廈"。不要寫成句子。
source 用繁體中文，20 字以內。`;

export async function POST(req: NextRequest) {
  try {
    const { flights } = await req.json() as { flights?: InFlight[] };
    const list = (flights || []).filter(f => f.id).slice(0, 12);
    if (list.length === 0) return NextResponse.json({ error: "沒有需要查詢的航班" }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
    if (!apiKey) return NextResponse.json({ error: "未設定 AI API Key" }, { status: 500 });

    const tvKey = process.env.TAVILY_API_KEY || "";

    // 官方對照表先判定（目前為桃園機場官網公布的航空公司→航廈）
    const official = list.map(f => ({
      dep: knownTerminal(f.departure_airport, f.flight_number, f.arrival_airport),
      arr: knownTerminal(f.arrival_airport, f.flight_number, f.departure_airport),
    }));

    // 只對官方表查不到的機場上網搜尋（每個機場一次，同機場共用）
    const needSearch = new Set<string>();
    list.forEach((f, i) => {
      const al = airlineCode(f.flight_number);
      const dep = (f.departure_airport || "").toUpperCase().trim();
      const arr = (f.arrival_airport || "").toUpperCase().trim();
      if (dep && !official[i].dep) needSearch.add(`${al}@${dep}`);
      if (arr && !official[i].arr) needSearch.add(`${al}@${arr}`);
    });

    const searchKeys = Array.from(needSearch).slice(0, 16);
    const searched = await Promise.all(searchKeys.map(async key => {
      const [al, ap] = key.split("@");
      if (!tvKey) return [key, ""] as const;
      const info = airportInfo(ap);
      const where = info ? `${info.city}${info.name}` : ap;
      const q = `${where} ${ap} ${al} 航空 航站樓 航廈 terminal 國內 國際 出發 到達`;
      return [key, await tavily(tvKey, q)] as const;
    }));
    const ctx = new Map(searched);

    const userMsg = list.map((f, i) => {
      const fn = (f.flight_number || "").toUpperCase().trim() || "（未填航班號）";
      const al = airlineCode(f.flight_number);
      const dep = (f.departure_airport || "").toUpperCase().trim();
      const arr = (f.arrival_airport || "").toUpperCase().trim();
      const nameOf = (c: string) => { const x = airportInfo(c); return x ? `${c}（${x.city}${x.name}）` : c || "未填"; };
      const lines = [
        `【航班 ${i + 1}】id=${f.id}`,
        `航班號：${fn}　日期：${f.flight_date || "未填"}`,
        `出發機場：${nameOf(dep)}　抵達機場：${nameOf(arr)}`,
      ];
      if (official[i].dep) lines.push(`※ 出發航廈已由機場官網確定為 "${official[i].dep}"，請原樣填回。`);
      if (official[i].arr) lines.push(`※ 抵達航廈已由機場官網確定為 "${official[i].arr}"，請原樣填回。`);
      const dc = ctx.get(`${al}@${dep}`), ac = ctx.get(`${al}@${arr}`);
      if (!official[i].dep && dc) lines.push(`出發機場搜尋結果：\n${dc}`);
      if (!official[i].arr && ac) lines.push(`抵達機場搜尋結果：\n${ac}`);
      return lines.join("\n");
    }).join("\n\n");

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://1trip.com.tw",
        "X-Title": "Travel Alliance Terminal Lookup",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4-5",
        temperature: 0.1,
        max_tokens: 1200,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `AI 查詢失敗（${res.status}）` }, { status: 502 });

    const j = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    let raw = j.choices?.[0]?.message?.content?.trim() || "";
    if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    let parsed: { results?: Array<Record<string, string>> } = {};
    try { parsed = JSON.parse(raw); } catch {
      return NextResponse.json({ error: "AI 回傳格式錯誤，請重試" }, { status: 502 });
    }

    const clean = (v: unknown) => String(v ?? "").trim().slice(0, 20);
    const byId = new Map((parsed.results || []).map(r => [clean(r.id), r]));
    // 官方對照表為準，AI 只補官方查不到的部分
    const results = list.map((f, i) => {
      const r = byId.get(f.id) || {};
      return {
        id: f.id,
        departure_terminal: official[i].dep || clean(r.departure_terminal),
        arrival_terminal: official[i].arr || clean(r.arrival_terminal),
        source: official[i].dep || official[i].arr ? "機場官網對照" : clean(r.source),
      };
    }).filter(r => r.departure_terminal || r.arrival_terminal);

    return NextResponse.json({ results, searched: !!tvKey });
  } catch (e) {
    console.error("[flight-terminal] error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
