import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const SYSTEM = `你是航空班表助手。根據使用者提供的「航班號」（與日期），提供該航班的固定班表資訊。
只回傳合法 JSON，不要 markdown。格式：
{"airline":"航空公司中文名","from":"出發城市/機場","from_terminal":"出發航廈(如 T1/T2，不確定留空)","to":"抵達城市/機場","to_terminal":"抵達航廈","depart":"HH:MM 出發時間","arrive":"HH:MM 抵達時間"}
規則：
- 依航班號判斷航空公司與航線（例 BR=長榮、CI=華航、JX=星宇、MU=東方、CX=國泰、JL=日航、NH=全日空）。
- 時間用 24 小時制當地時間；跨夜或不確定的欄位留空字串。
- 這是 AI 依常見班表推估，使用者會自行核對，不要編造不存在的航班；不確定就把不確定欄位留空。`;

export async function POST(req: NextRequest) {
  try {
    const { flight_no, date } = await req.json() as { flight_no?: string; date?: string };
    const fn = (flight_no || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!fn) return NextResponse.json({ error: "請輸入航班號" }, { status: 400 });

    const apiKey  = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
    if (!apiKey) return NextResponse.json({ error: "未設定 AI API Key" }, { status: 500 });

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://1trip.com.tw",
        "X-Title": "Travel Alliance Flight Lookup",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4-5",
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `航班號：${fn}${date ? `，日期：${date}` : ""}` },
        ],
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `查詢失敗（${res.status}）` }, { status: 502 });

    const j = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    let raw = j.choices?.[0]?.message?.content?.trim() || "";
    if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    let p: Record<string, string> = {};
    try { p = JSON.parse(raw); } catch { return NextResponse.json({ error: "AI 回傳格式錯誤，請重試" }, { status: 502 }); }

    return NextResponse.json({
      airline:       String(p.airline || ""),
      from:          String(p.from || ""),
      from_terminal: String(p.from_terminal || ""),
      to:            String(p.to || ""),
      to_terminal:   String(p.to_terminal || ""),
      depart:        String(p.depart || ""),
      arrive:        String(p.arrive || ""),
    });
  } catch (e) {
    console.error("[flight-lookup] error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
