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

// ── Wikimedia Commons 圖片搜尋（依「真實地名」找名勝實景照）─────────────────────
// Pexels 等圖庫對中港台日的具名景點覆蓋極差；Wikimedia Commons 有全球幾乎每個
// 具名景點的 CC 授權實景照，且可用中文／當地語言名稱搜尋 —— 這是讓照片「對」的關鍵。
const JUNK_RE = /(map|locator|logo|diagram|icon|svg|coat of arms|flag|seal|chart|\bplan\b|panorama cropped|stamp|emblem|signature|qr)/i;
async function searchWikimedia(query: string, count = 3): Promise<string[]> {
  if (!query) return [];
  try {
    const url = "https://commons.wikimedia.org/w/api.php"
      + "?action=query&format=json&generator=search&gsrnamespace=6"
      + `&gsrsearch=${encodeURIComponent(query + " filetype:bitmap")}`
      + `&gsrlimit=${Math.max(count * 5, 20)}`
      + "&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1600";
    const res = await fetch(url, {
      headers: { "User-Agent": "TravelAlliance/1.0 (https://1trip.com.tw; tour pages image lookup)" },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      query?: { pages?: Record<string, {
        title?: string; index?: number;
        imageinfo?: Array<{ url?: string; thumburl?: string; width?: number; height?: number; thumbwidth?: number; thumbheight?: number; mime?: string }>;
      }> };
    };
    const pages = Object.values(data.query?.pages || {});
    pages.sort((a, b) => (a.index ?? 999) - (b.index ?? 999)); // 保持搜尋相關度排序
    const urls: string[] = [];
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      if (JUNK_RE.test(p.title || "")) continue;                       // 排除地圖/logo/圖表
      if (ii.mime && !/image\/(jpeg|png|jpg)/i.test(ii.mime)) continue; // 只要照片
      const w = ii.thumbwidth || ii.width || 0;
      const h = ii.thumbheight || ii.height || 0;
      if (w && h && w < h * 1.05) continue;                            // 偏好橫幅大圖
      const u = ii.thumburl || ii.url;
      if (u && !urls.includes(u)) urls.push(u);
      if (urls.length >= count) break;
    }
    return urls;
  } catch {
    return [];
  }
}

// ── 統一圖片搜尋：具名景點先查 Wikimedia 實景，再用 Pexels 補足／處理通用概念 ─────
async function searchImages(
  place: string, keywords: string, count: number, pexelsKey: string
): Promise<string[]> {
  const out: string[] = [];
  if (place) {
    out.push(...await searchWikimedia(place, count));
  }
  if (out.length < count) {
    const px = await searchPexelsMulti(keywords || place, pexelsKey, count - out.length + 1);
    for (const u of px) { if (!out.includes(u)) out.push(u); }
  }
  return out.slice(0, count);
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `你是暖心旅行社的資深行程企劃與旅遊文案設計師，擅長打造雜誌級的行程網頁。
根據提供的出團基本資料與行程素材，產出一份精美行程網頁的完整內容。
只回傳一個合法的 JSON 物件，不要加 markdown code block、不要有任何說明文字。

JSON 欄位定義：
- subtitle: 行程副標語（15-25字，有畫面感與感染力，像雜誌標語）
- intro: 行程總介紹（180-280字，文字優美有溫度，依素材撰寫，不可捏造素材中沒有的承諾）
- category: 分類，依目的地與行程性質從以下擇一：group（一般團體）/ island（海島度假）/ family（親子）/ japan（日本）/ china（中國大陸）/ sea（東南亞）/ europe（歐美長線）/ custom（客製包團）
- posters: 海報陣列，固定 4 個物件 [{title: 海報大標（8-14字，磅礡有力如電影海報）, subtitle: 海報副標（12-22字）, place: 該海報主視覺對應的「真實具名景點」名稱（用當地語言：中港台用繁體中文、日本用日文漢字、韓國用韓文、歐美用英文，例「梵淨山」「Eiffel Tower」；若是抽象主題無具體景點則填空字串 ""）, image_keywords: 英文圖片搜尋關鍵字（3-5個英文單字，具體描述該海報主題的景色）}]
  四張海報主題建議：1. 行程總覽主視覺 2. 最具代表性景點 3. 美食或文化體驗 4. 住宿或自然風光
- highlights: 行程特色陣列，固定 6 個 [{icon: 單一emoji, title: 特色標題（6-10字）, desc: 說明（25-45字）, place: 該特色若是「具名景點/自然地標」則填其當地語言真實名稱（例「黃果樹瀑布」「西江千戶苗寨」）；若是美食/住宿/服務/購物等抽象主題則填空字串 "", image_keywords: 該特色對應的英文圖片搜尋關鍵字（3-5個英文單字，例美食「chongqing hotpot spicy food」、住宿「luxury hotel river view night」）}]
- days: 每日行程陣列，天數必須與出團天數一致 [{day: 天數（整數，從1開始）, title: 當日標題（例「台北 ✈ 東京 → 淺草雷門・晴空塔」）, description: 當日詳細描述（100-180字，有畫面感）, spots: 當日景點名稱陣列（2-6個）, place: 當日「最具代表性的具名景點」當地語言真實名稱（例「淺草寺」「梵淨山」；用於搜尋實景照，務必精準），meals: {breakfast, lunch, dinner} —— ★務必依「航班時間」智能判斷每一餐是否含於行程：
    • 去程日（第1天）：旅客登機前在家用餐，出發航班「之前」時段的餐別一律填「X」（代表不含、旅客自理）。例：航班 18:00 起飛 → 早餐「X」、午餐「X」、晚餐「機上」；航班 13:00 起飛 → 早餐「X」、午餐「機上」、晚餐視抵達後安排；航班 09:00 起飛 → 早餐「機上」、午餐「機上」或抵達後。
    • 回程日（最後一天）：回到台灣「之後」時段的餐別填「X」。例：上午回台 → 早餐「飯店內用」或「機上」、午餐「X」、晚餐「X」；傍晚/晚上回台 → 早餐「飯店內用」、午餐當地、晚餐「機上」。
    • 行程中完整日：早餐通常「飯店內用」，午/晚餐填餐廳或特色餐名，無安排則「敬請自理」。
    • 搭機時段的正餐填「機上」。
    「X」代表該餐不含於行程；若素材有航班時間請嚴格據此判斷，若無則依國際團常見習慣合理推估（去程日早餐多為 X）。, hotel: 當晚住宿（最後一天填「溫暖的家」）, image_keywords: 當日最具代表性景色的英文搜尋關鍵字（3-5個英文單字，要具體）, meal_keywords: {breakfast, lunch, dinner}（各餐對應的英文圖片搜尋關鍵字，3-5個英文單字，依餐點名稱具體描述，例如午餐是重慶火鍋就寫「chongqing hotpot spicy food」；若該餐是 X／機上／敬請自理／飯店內用 等非特色餐，輸出空字串 ""）, hotel_keywords: 當晚飯店的英文圖片搜尋關鍵字（依飯店等級與特色描述，例「luxury hotel room city night view」；最後一天回家輸出空字串 ""）}]
- gallery_spots: 全程最具代表性的景點精選，6-9 個 [{name: 景點名稱（當地語言真實名稱，例「天門山國家森林公園」，此名稱會直接用於搜尋實景照，務必是正確的官方／通用地名）, subtitle: 一句氛圍副標（8-18字，例「雲霧峰林・世界自然遺產」）, image_keywords: 該景點的英文搜尋關鍵字（3-5個英文單字，要非常具體，例「tianmen mountain cliff walkway fog」）}]
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
      keep?: string[];   // 保留不重新生成的區塊
    };
    const { tour, rawInput } = body;
    const keep = Array.isArray(body.keep) ? body.keep : [];

    if (!tour?.name || !tour?.destination) {
      return NextResponse.json({ error: "缺少出團基本資料" }, { status: 400 });
    }

    const apiKey    = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    const baseUrl   = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
    const pexelsKey = process.env.PEXELS_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json({ error: "未設定 AI API Key" }, { status: 500 });
    }

    const KEEP_FIELD_HINT: Record<string, string> = {
      posters:    "posters（輸出空陣列 []）",
      intro:      "subtitle 與 intro（輸出空字串 \"\"）",
      highlights: "highlights（輸出空陣列 []）",
      days:       "days（輸出空陣列 []，忽略「days 長度 = 出團天數」的要求）",
      gallery:    "gallery_spots（輸出空陣列 []）",
      flights:    "flights（輸出空陣列 []）",
      fees:       "includes 與 excludes（輸出空陣列 []）",
      notes:      "notes（輸出空陣列 []）",
    };
    const keepHints = keep.map(k => KEEP_FIELD_HINT[k]).filter(Boolean);

    const userPrompt = `## 出團基本資料
- 行程名稱：${tour.name}
- 目的地：${tour.destination}
- 出發日期：${tour.start_date || "未定"}
- 回程日期：${tour.end_date || "未定"}
- 出團天數：${tour.days || "?"} 天
- 成人售價：NT$${(tour.selling_price || 0).toLocaleString()}

## 行程素材（管理員提供）
${(rawInput || "").trim() || "（無額外素材，請依行程名稱與目的地合理企劃）"}${keepHints.length > 0 ? `

## 以下欄位本次不需生成（內容將沿用舊版），請直接輸出指定空值以節省篇幅：
${keepHints.map(h => `- ${h}`).join("\n")}` : ""}`;

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
    // 保留區塊一律清空，不浪費圖片搜尋（前端會沿用舊資料）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posters: any[] = keep.includes("posters") ? [] : (Array.isArray(gen.posters) ? gen.posters.slice(0, 5) : []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const days: any[]    = keep.includes("days") ? [] : (Array.isArray(gen.days) ? gen.days : []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spots: any[]   = keep.includes("gallery") ? [] : (Array.isArray(gen.gallery_spots) ? gen.gallery_spots.slice(0, 10) : []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hls: any[]     = keep.includes("highlights") ? [] : (Array.isArray(gen.highlights) ? gen.highlights.slice(0, 8) : []);

    const fallbackKw = `${tour.destination} travel landscape`;

    const [posterImages, dayImages, spotImages, hlImages, dayMealHotelImages] = await Promise.all([
      Promise.all(posters.map(p =>
        searchImages(String(p.place || ""), String(p.image_keywords || fallbackKw), 1, pexelsKey))),
      Promise.all(days.map(d =>
        searchImages(String(d.place || ""), String(d.image_keywords || fallbackKw), 3, pexelsKey))),
      // 景點美照：景點名稱（當地語言）直接查 Wikimedia 實景，最關鍵
      Promise.all(spots.map(s =>
        searchImages(String(s.name || ""), String(s.image_keywords || fallbackKw), 3, pexelsKey))),
      Promise.all(hls.map(h =>
        searchImages(String(h.place || ""), String(h.image_keywords || fallbackKw), 1, pexelsKey))),
      // 餐點 + 飯店照片（依名稱關鍵字，無關鍵字則跳過不浪費搜尋）
      Promise.all(days.map(async d => {
        const mk = d.meal_keywords || {};
        const hk = String(d.hotel_keywords || "");
        const [b, l, dn, h] = await Promise.all([
          String(mk.breakfast || "") ? searchPexelsMulti(String(mk.breakfast), pexelsKey, 1) : Promise.resolve([] as string[]),
          String(mk.lunch || "")     ? searchPexelsMulti(String(mk.lunch),     pexelsKey, 1) : Promise.resolve([] as string[]),
          String(mk.dinner || "")    ? searchPexelsMulti(String(mk.dinner),    pexelsKey, 1) : Promise.resolve([] as string[]),
          hk                          ? searchPexelsMulti(hk,                   pexelsKey, 1) : Promise.resolve([] as string[]),
        ]);
        return {
          breakfast: b[0] || "",
          lunch:     l[0] || "",
          dinner:    dn[0] || "",
          hotel:     h[0] || "",
        };
      })),
    ]);

    const hero_posters = posters.map((p, i) => ({
      image:    posterImages[i]?.[0] || "",
      title:    String(p.title || tour.name),
      subtitle: String(p.subtitle || ""),
    }));

    const content = {
      subtitle:   String(gen.subtitle || ""),
      intro:      String(gen.intro || ""),
      highlights: hls.map((h, i) => ({
        icon:  String(h.icon || "✨"),
        title: String(h.title || ""),
        desc:  String(h.desc || ""),
        image: hlImages[i]?.[0] || "",
      })),
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
        meal_images: {
          breakfast: dayMealHotelImages[i]?.breakfast || "",
          lunch:     dayMealHotelImages[i]?.lunch || "",
          dinner:    dayMealHotelImages[i]?.dinner || "",
        },
        hotel:       String(d.hotel || ""),
        hotel_image: dayMealHotelImages[i]?.hotel || "",
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
