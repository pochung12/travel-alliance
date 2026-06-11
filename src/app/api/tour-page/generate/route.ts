import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 180; // AI 生成 + 大量圖片搜尋需要較長時間

// ── Pexels 圖片搜尋（一次取多張）──────────────────────────────────────────────
async function searchPexelsMulti(
  keywords: string, pexelsKey: string, count = 3
): Promise<string[]> {
  if (!pexelsKey || !keywords) return [];
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(keywords)}&per_page=${Math.max(count * 3, 10)}&orientation=landscape`,
      { headers: { Authorization: pexelsKey } }
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      photos?: Array<{ src?: { large2x?: string; large?: string; original?: string } }>;
    };
    const photos = data.photos || [];
    return photos
      .slice(0, count)
      .map(p => p.src?.large2x || p.src?.large || p.src?.original || "")
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `你是暖心旅行社的資深行程企劃與旅遊文案設計師，擅長打造雜誌級的行程網頁。
根據提供的出團基本資料與行程素材，產出一份精美行程網頁的完整內容。
只回傳一個合法的 JSON 物件，不要加 markdown code block、不要有任何說明文字。

JSON 欄位定義：
- subtitle: 行程副標語（15-25字，有畫面感與感染力，像雜誌標語）
- intro: 行程總介紹（180-280字，文字優美有溫度，依素材撰寫，不可捏造素材中沒有的承諾）
- category: 分類，依目的地與行程性質從以下擇一：group（一般團體）/ island（海島度假）/ family（親子）/ japan（日本）/ china（中國大陸）/ sea（東南亞）/ europe（歐美長線）/ custom（客製包團）
- posters: 海報陣列，固定 4 個物件 [{title: 海報大標（8-14字，磅礡有力如電影海報）, subtitle: 海報副標（12-22字）, image_keywords: 英文圖片搜尋關鍵字（3-5個英文單字，具體描述該海報主題的景色）}]
  四張海報主題建議：1. 行程總覽主視覺 2. 最具代表性景點 3. 美食或文化體驗 4. 住宿或自然風光
- highlights: 行程特色陣列，4-6 個 [{icon: 單一emoji, title: 特色標題（6-10字）, desc: 說明（20-40字）}]
- days: 每日行程陣列，天數必須與出團天數一致 [{day: 天數（整數，從1開始）, title: 當日標題（例「台北 ✈ 東京 → 淺草雷門・晴空塔」）, description: 當日詳細描述（100-180字，有畫面感）, spots: 當日景點名稱陣列（2-6個）, meals: {breakfast, lunch, dinner}（素材沒提到就寫「敬請自理」或「飯店內用」等合理安排）, hotel: 當晚住宿（最後一天填「溫暖的家」）, image_keywords: 當日最具代表性景色的英文搜尋關鍵字（3-5個英文單字，要具體）}]
- gallery_spots: 全程最具代表性的景點精選，6-9 個 [{name: 景點名稱（中文，例「天門山國家森林公園」）, subtitle: 一句氛圍副標（8-18字，例「雲霧峰林・世界自然遺產」）, image_keywords: 該景點的英文搜尋關鍵字（3-5個英文單字，要非常具體，例「tianmen mountain cliff walkway fog」）}]
- flights: 航班陣列（素材中有航班資訊才填，否則空陣列）[{flight_no, date, from, to, depart, arrive}]
- includes: 費用包含項目陣列（4-8項，依素材與常理）
- excludes: 費用不含項目陣列（3-6項）
- notes: 注意事項陣列（4-8項，實用的旅遊提醒）

要求：
1. 所有中文使用繁體中文，語氣專業溫暖、有雜誌質感
2. 行程內容必須基於提供的素材，素材詳細就寫詳細，素材簡略可合理補充常見安排但不可虛構具體承諾
3. 所有 image_keywords 必須是英文且非常具體（例「kanas lake autumn golden birch forest」優於「xinjiang travel」），每個景點的關鍵字要彼此不同避免重複圖片
4. days 陣列長度 = 出團天數
5. gallery_spots 要挑全程「最有畫面」的景點，副標要有詩意`;

// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      tour?: {
        name?: string; destination?: string;
        start_date?: string; end_date?: string;
        days?: number; selling_price?: number;
      };
      rawInput?: string;
    };
    const { tour, rawInput } = body;

    if (!tour?.name || !tour?.destination) {
      return NextResponse.json({ error: "缺少出團基本資料" }, { status: 400 });
    }

    const apiKey    = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    const baseUrl   = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
    const pexelsKey = process.env.PEXELS_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json({ error: "未設定 AI API Key" }, { status: 500 });
    }

    const userPrompt = `## 出團基本資料
- 行程名稱：${tour.name}
- 目的地：${tour.destination}
- 出發日期：${tour.start_date || "未定"}
- 回程日期：${tour.end_date || "未定"}
- 出團天數：${tour.days || "?"} 天
- 成人售價：NT$${(tour.selling_price || 0).toLocaleString()}

## 行程素材（管理員提供）
${(rawInput || "").trim() || "（無額外素材，請依行程名稱與目的地合理企劃）"}`;

    // ── 呼叫 AI ────────────────────────────────────────────────────────────────
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer":  "https://travel-alliance.railway.app",
        "X-Title":       "Travel Alliance Tour Page",
      },
      body: JSON.stringify({
        model:       "anthropic/claude-sonnet-4-5",
        temperature: 0.7,
        max_tokens:  10000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[tour-page/generate] API error:", res.status, errText);
      return NextResponse.json({ error: `AI API 錯誤: ${res.status}` }, { status: 502 });
    }

    const aiJson = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    let raw = aiJson.choices?.[0]?.message?.content?.trim() ?? "";
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let gen: any;
    try {
      gen = JSON.parse(raw);
    } catch {
      console.error("[tour-page/generate] parse error, raw:", raw.slice(0, 300));
      return NextResponse.json({ error: "AI 回傳格式錯誤，請重試" }, { status: 502 });
    }

    // ── 圖片搜尋（海報 1 張、每日 3 張、每景點 3 張，全部並行）─────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posters: any[] = Array.isArray(gen.posters) ? gen.posters.slice(0, 5) : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const days: any[]    = Array.isArray(gen.days) ? gen.days : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spots: any[]   = Array.isArray(gen.gallery_spots) ? gen.gallery_spots.slice(0, 10) : [];

    const fallbackKw = `${tour.destination} travel landscape`;

    const [posterImages, dayImages, spotImages] = await Promise.all([
      Promise.all(posters.map(p =>
        searchPexelsMulti(String(p.image_keywords || fallbackKw), pexelsKey, 1))),
      Promise.all(days.map(d =>
        searchPexelsMulti(String(d.image_keywords || fallbackKw), pexelsKey, 3))),
      Promise.all(spots.map(s =>
        searchPexelsMulti(String(s.image_keywords || fallbackKw), pexelsKey, 3))),
    ]);

    const hero_posters = posters.map((p, i) => ({
      image:    posterImages[i]?.[0] || "",
      title:    String(p.title || tour.name),
      subtitle: String(p.subtitle || ""),
    }));

    const content = {
      subtitle:   String(gen.subtitle || ""),
      intro:      String(gen.intro || ""),
      highlights: Array.isArray(gen.highlights) ? gen.highlights : [],
      days: days.map((d, i) => ({
        day:         Number(d.day) || i + 1,
        title:       String(d.title || `第 ${i + 1} 天`),
        description: String(d.description || ""),
        spots:       Array.isArray(d.spots) ? d.spots.map(String) : [],
        meals: {
          breakfast: String(d.meals?.breakfast || "敬請自理"),
          lunch:     String(d.meals?.lunch || "敬請自理"),
          dinner:    String(d.meals?.dinner || "敬請自理"),
        },
        hotel:  String(d.hotel || ""),
        image:  dayImages[i]?.[0] || "",
        images: dayImages[i] || [],
      })),
      gallery: spots.map((s, i) => ({
        name:     String(s.name || ""),
        subtitle: String(s.subtitle || ""),
        images:   spotImages[i] || [],
      })).filter(g => g.name && g.images.length > 0),
      flights:  Array.isArray(gen.flights) ? gen.flights : [],
      includes: Array.isArray(gen.includes) ? gen.includes.map(String) : [],
      excludes: Array.isArray(gen.excludes) ? gen.excludes.map(String) : [],
      notes:    Array.isArray(gen.notes) ? gen.notes.map(String) : [],
    };

    return NextResponse.json({
      category: String(gen.category || "group"),
      hero_posters,
      content,
    });
  } catch (e) {
    console.error("[tour-page/generate] unexpected error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
