import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

// Trip.com / 攜程 關鍵字搜尋深層連結（依飯店名稱，務必可一鍵找到該飯店）
function tripUrl(name: string, dest: string) {
  return `https://www.trip.com/hotels/list?keyword=${encodeURIComponent(`${name} ${dest}`.trim())}`;
}
function ctripUrl(name: string) {
  return `https://hotels.ctrip.com/hotels/list?keyword=${encodeURIComponent(name)}`;
}

export async function POST(req: NextRequest) {
  try {
    const { name, destination } = await req.json() as { name?: string; destination?: string };
    const hotelName = (name || "").trim();
    const dest = (destination || "").trim();
    if (!hotelName) {
      return NextResponse.json({ error: "請輸入飯店名稱" }, { status: 400 });
    }

    // 連結一律由伺服器組（可靠），星級交給 AI 估
    const trip_url = tripUrl(hotelName, dest);
    const ctrip_url = ctripUrl(hotelName);

    const apiKey  = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";

    let stars = "";
    let note  = "";
    if (apiKey) {
      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://1trip.com.tw",
            "X-Title": "Travel Alliance Hotel Lookup",
          },
          body: JSON.stringify({
            model: "anthropic/claude-sonnet-4-5",
            temperature: 0.3,
            max_tokens: 200,
            messages: [
              { role: "system", content: "你是飯店資料庫專家。根據飯店名稱判斷其星級等級。只回傳合法 JSON，不要 markdown。格式：{\"stars\":\"5星級\"或\"4星級\"等(若不確定填\"\")，\"note\":\"一句話描述此飯店特色或定位，10-20字\"}。星級請保守估計，不確定就留空字串。" },
              { role: "user", content: `飯店名稱：${hotelName}${dest ? `（位於${dest}）` : ""}` },
            ],
          }),
        });
        if (res.ok) {
          const j = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
          let raw = j.choices?.[0]?.message?.content?.trim() || "";
          if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          const parsed = JSON.parse(raw) as { stars?: string; note?: string };
          stars = String(parsed.stars || "");
          note  = String(parsed.note || "");
        }
      } catch { /* AI 失敗不影響連結 */ }
    }

    return NextResponse.json({ stars, note, trip_url, ctrip_url });
  } catch (e) {
    console.error("[hotel-lookup] error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
