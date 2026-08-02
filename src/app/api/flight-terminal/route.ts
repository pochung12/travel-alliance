import { NextRequest, NextResponse } from "next/server";

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

    // 上網搜尋（每筆航班一次；無 Tavily key 時退回純 AI 判斷）
    const contexts = await Promise.all(list.map(async f => {
      const fn = (f.flight_number || "").toUpperCase().trim();
      const dep = (f.departure_airport || "").toUpperCase().trim();
      const arr = (f.arrival_airport || "").toUpperCase().trim();
      if (!tvKey) return "";
      const q = `${fn} 航班 ${dep} 機場 出發航廈 ${arr} 機場 抵達航廈 terminal`;
      return await tavily(tvKey, q);
    }));

    const userMsg = list.map((f, i) => {
      const fn = (f.flight_number || "").toUpperCase().trim() || "（未填航班號）";
      return [
        `【航班 ${i + 1}】id=${f.id}`,
        `航班號：${fn}　日期：${f.flight_date || "未填"}`,
        `出發機場：${(f.departure_airport || "").toUpperCase() || "未填"}　抵達機場：${(f.arrival_airport || "").toUpperCase() || "未填"}`,
        contexts[i] ? `搜尋結果：\n${contexts[i]}` : "搜尋結果：（無，請依你的知識判斷）",
      ].join("\n");
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
    const results = (parsed.results || [])
      .filter(r => list.some(f => f.id === r.id))
      .map(r => ({
        id: clean(r.id),
        departure_terminal: clean(r.departure_terminal),
        arrival_terminal: clean(r.arrival_terminal),
        source: clean(r.source),
      }));

    return NextResponse.json({ results, searched: !!tvKey });
  } catch (e) {
    console.error("[flight-terminal] error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
