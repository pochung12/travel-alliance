import { NextRequest, NextResponse } from "next/server";

/** Slugify helper — handles Chinese + English */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[一-鿿぀-ゟ゠-ヿ\s]+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || `post-${Date.now()}`;
}

// ── 文字模式 Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `你是暖心旅行社的旅遊文章寫手，文章風格活潑有溫度、適合旅遊雜誌。
請依照指定主題撰寫一篇完整的繁體中文旅遊文章，並以 JSON 格式回傳（不要加 markdown code block）。

JSON 欄位：
- title: 吸引人的文章標題（20-40字）
- slug: 英文網址（全小寫、連字符、無空格，長度10-40字元）
- excerpt: 精彩摘要（50-100字）
- content: 文章正文（至少700字，支援 ## 段落標題、> 引言、- 列表）
- cover_keywords: 3-5個英文關鍵字，用於搜尋封面圖片（例：tokyo autumn leaves temple japan）
- category: 分類（japan / asia / europe / southeast_asia / china / tips / food / travel 擇一）
- tags: 標籤陣列（4-7個繁體中文字串）
- reading_time: 預估閱讀分鐘數（整數，通常5-10）

內容要求：
1. 文章分5-7個段落，每段有 ## 標題
2. 包含實用資訊（交通、住宿、美食、行程建議、預算參考）
3. 加入3-4個 > 引言句，引言要有強烈畫面感
4. 至少一個 - 列表（例如必吃清單、行程安排）
5. 語氣親切，像在和朋友分享旅行故事
6. 最後一段是「暖心旅行小叮嚀」，給旅客實用建議`;

// ── 照片模式 Prompt ────────────────────────────────────────────────────────────
const PHOTO_SYSTEM_PROMPT = `你是暖心旅行社的旅遊文章寫手，文章風格活潑有溫度、適合旅遊雜誌。
使用者上傳了親自拍攝的旅遊照片，請根據照片中的真實景色、氛圍、細節撰寫一篇充滿臨場感的繁體中文旅遊文章。
並以 JSON 格式回傳（不要加 markdown code block）。

請仔細觀察照片中的：
- 地點特色、建築風格、自然景觀
- 光線氛圍（晴天/陰天/黃昏/夜晚）
- 人文細節（市集、廟宇、街道、飲食）
- 顏色、質感、季節感

JSON 欄位：
- title: 吸引人的文章標題（20-40字，反映照片真實內容）
- slug: 英文網址（全小寫、連字符、無空格，長度10-40字元）
- excerpt: 精彩摘要（50-100字，喚起讀者對照片場景的想像）
- content: 文章正文（至少800字，根據照片描述真實見聞，使用 ## 段落標題、> 引言、- 列表）
- cover_keywords: 3-5個英文關鍵字（例：kyoto temple autumn japan）
- category: 分類（japan / asia / europe / southeast_asia / china / tips / food / travel 擇一）
- tags: 標籤陣列（4-7個繁體中文字串）
- reading_time: 預估閱讀分鐘數（整數，通常5-10）

內容要求：
1. 文章必須根據照片的真實內容，加入具體的視覺描述
2. 分5-7個段落，每段有 ## 標題
3. 加入3-4個 > 引言句，直接呼應照片中的景象
4. 至少一個 - 列表（照片中景點、必吃美食、行程建議等）
5. 語氣像是在和朋友分享「你看這張照片，我當時在現場...」的親身體驗
6. 最後一段是「暖心旅行小叮嚀」，給想去相同目的地的旅客建議`;

// ── Pexels 封面圖 ─────────────────────────────────────────────────────────────
async function getPexelsImage(keywords: string, pexelsKey: string): Promise<string> {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(keywords)}&per_page=15&orientation=landscape&page=1`,
    { headers: { Authorization: pexelsKey } }
  );
  if (!res.ok) return "";
  const data = await res.json() as {
    photos?: Array<{ src?: { large2x?: string; large?: string; original?: string } }>;
  };
  const photos = data.photos || [];
  if (photos.length === 0) return "";
  const pick = photos[Math.floor(Math.random() * Math.min(photos.length, 10))];
  return pick.src?.large2x || pick.src?.large || pick.src?.original || "";
}

// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      topic?:       string;
      category?:    string;
      destination?: string;
      images?:      string[]; // base64 data URLs（使用者親拍）
    };
    const { topic, category, destination, images } = body;

    const hasPhotos  = Array.isArray(images) && images.length > 0;
    const mainSubject = (destination || topic || "").trim();

    if (!mainSubject && !hasPhotos) {
      return NextResponse.json({ error: "請提供文章主題或上傳照片" }, { status: 400 });
    }

    const apiKey    = process.env.OPENAI_API_KEY;
    const baseUrl   = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
    const pexelsKey = process.env.PEXELS_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json({ error: "未設定 OPENAI_API_KEY" }, { status: 500 });
    }

    // ── 組裝 messages ─────────────────────────────────────────────────────────
    let messages: unknown[];

    if (hasPhotos) {
      const textPart = mainSubject
        ? `目的地 / 城市：${mainSubject}。請根據以下我親自拍攝的旅遊照片，撰寫一篇真實感十足的旅遊文章。`
        : "請根據以下我親自拍攝的旅遊照片，判斷目的地並撰寫一篇充滿臨場感的旅遊文章。";

      const userContent: unknown[] = [
        { type: "text", text: textPart },
        ...images!.slice(0, 5).map(img => ({
          type:      "image_url",
          image_url: { url: img },
        })),
      ];

      messages = [
        { role: "system", content: PHOTO_SYSTEM_PROMPT },
        { role: "user",   content: userContent },
      ];
    } else {
      const userPrompt = `請以「${mainSubject}」為主題撰寫一篇旅遊文章。${category && category !== "travel" ? `分類：${category}` : ""}`;
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userPrompt },
      ];
    }

    // ── 呼叫 AI ────────────────────────────────────────────────────────────────
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer":  "https://travel-alliance.railway.app",
        "X-Title":       "Travel Alliance Blog",
      },
      body: JSON.stringify({
        model:       "anthropic/claude-sonnet-4-5",
        temperature: 0.8,
        max_tokens:  6000,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[blog/generate] API error:", res.status, errText);
      return NextResponse.json({ error: `AI API 錯誤: ${res.status}` }, { status: 502 });
    }

    const aiJson = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = aiJson.choices?.[0]?.message?.content?.trim() ?? "";

    let cleaned = raw;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let article: Record<string, unknown>;
    try {
      article = JSON.parse(cleaned);
    } catch {
      console.error("[blog/generate] parse error, raw:", raw.slice(0, 300));
      return NextResponse.json({ error: "AI 回傳格式錯誤，請重試" }, { status: 502 });
    }

    if (!article.slug || typeof article.slug !== "string") {
      article.slug = slugify(String(article.title || mainSubject));
    }
    article.slug = `${article.slug}-${Date.now().toString(36)}`;

    // ── 封面圖 ─────────────────────────────────────────────────────────────────
    let coverImage = "";
    if (hasPhotos) {
      // 使用第一張使用者照片作為封面
      coverImage = images![0];
    } else if (pexelsKey) {
      const coverKeywords = (article.cover_keywords as string) || `${mainSubject} travel`;
      try {
        coverImage = await getPexelsImage(coverKeywords, pexelsKey);
      } catch (e) {
        console.warn("[blog/generate] Pexels image failed:", e);
      }
    }
    article.cover_image = coverImage;

    return NextResponse.json(article);
  } catch (e) {
    console.error("[blog/generate] unexpected error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
