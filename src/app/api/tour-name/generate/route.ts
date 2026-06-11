import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = `你是暖心旅行社的資深行程命名專家，擅長為旅遊團取吸引人的團名。
根據提供的出團資料與命名偏好，產出 6 個不同風格的團名候選。
只回傳一個合法的 JSON 物件，不要加 markdown code block、不要有任何說明文字。

JSON 格式：{"names": ["團名1", "團名2", "團名3", "團名4", "團名5", "團名6"]}

命名原則：
1. 全部使用繁體中文
2. 朗朗上口、有畫面感，避免俗套（如「超值」「特惠」）
3. 6 個候選風格要有差異：有的大氣磅礡、有的詩意溫柔、有的精煉直接
4. 可善用「・」「｜」等分隔符號讓團名更有層次
5. 嚴格遵守使用者勾選的命名偏好`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      currentName?: string;
      destination?: string;
      days?: number;
      options?: string[];   // 偏好選項
      extra?: string;       // 補充素材（飯店/景點等）
    };
    const { currentName, destination, days, options = [], extra } = body;

    const apiKey  = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
    if (!apiKey) {
      return NextResponse.json({ error: "未設定 AI API Key" }, { status: 500 });
    }

    const prefs: string[] = [];
    if (options.includes("longer"))  prefs.push("團名字數要多一點（15-25字），資訊更豐富");
    if (options.includes("premium")) prefs.push("要有高級感、質感路線（如「尊爵」「臻選」「漫旅」等氛圍，但避免老套）");
    if (options.includes("days"))    prefs.push(`團名中要寫出天數（${days || "?"}天${days ? `${days - 1}夜` : ""}）`);
    if (options.includes("hotel"))   prefs.push("團名中要帶到住宿飯店特色");
    if (options.includes("spots"))   prefs.push("團名中要帶到代表性景點特色");
    if (prefs.length === 0) prefs.push("字數適中（10-18字），重點突出");

    const userPrompt = `## 出團資料
- 目前團名：${currentName || "（尚未命名）"}
- 目的地：${destination || "未填"}
- 天數：${days ? `${days} 天 ${days - 1} 夜` : "未定"}
${extra?.trim() ? `- 補充素材（飯店/景點/特色）：${extra.trim()}` : ""}

## 命名偏好（必須遵守）
${prefs.map(p => `- ${p}`).join("\n")}

請生成 6 個團名候選。`;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer":  "https://travel-alliance.railway.app",
        "X-Title":       "Travel Alliance Tour Name",
      },
      body: JSON.stringify({
        model:       "anthropic/claude-sonnet-4-5",
        temperature: 0.9,
        max_tokens:  800,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[tour-name/generate] API error:", res.status, errText);
      return NextResponse.json({ error: `AI API 錯誤: ${res.status}` }, { status: 502 });
    }

    const aiJson = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    let raw = aiJson.choices?.[0]?.message?.content?.trim() ?? "";
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let parsed: { names?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[tour-name/generate] parse error, raw:", raw.slice(0, 200));
      return NextResponse.json({ error: "AI 回傳格式錯誤，請重試" }, { status: 502 });
    }

    const names = Array.isArray(parsed.names)
      ? parsed.names.map(String).filter(Boolean).slice(0, 6)
      : [];
    if (names.length === 0) {
      return NextResponse.json({ error: "未生成任何團名，請重試" }, { status: 502 });
    }

    return NextResponse.json({ names });
  } catch (e) {
    console.error("[tour-name/generate] unexpected error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
