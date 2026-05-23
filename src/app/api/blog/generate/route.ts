import { NextRequest, NextResponse } from "next/server";

/** Slugify helper — handles Chinese + English */
function slugify(text: string): string {
  // Replace Chinese/Japanese/spaces with dashes; keep alphanumeric + dash
  return text
    .toLowerCase()
    .replace(/[一-鿿぀-ゟ゠-ヿ\s]+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || `post-${Date.now()}`;
}

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

// ── Pexels：取得封面圖片 URL ─────────────────────────────────────────────────
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

export async function POST(req: NextRequest) {
  try {
    const { topic, category } = await req.json() as { topic?: string; category?: string };
    if (!topic?.trim()) {
      return NextResponse.json({ error: "請提供文章主題" }, { status: 400 });
    }

    const apiKey    = process.env.OPENAI_API_KEY;
    const baseUrl   = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
    const pexelsKey = process.env.PEXELS_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json({ error: "未設定 OPENAI_API_KEY" }, { status: 500 });
    }

    const userPrompt = `請以「${topic}」為主題撰寫一篇旅遊文章。${category && category !== "travel" ? `分類：${category}` : ""}`;

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
        max_tokens:  4000,
        messages: [
          { role: "system",  content: SYSTEM_PROMPT },
          { role: "user",    content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[blog/generate] API error:", res.status, errText);
      return NextResponse.json({ error: `AI API 錯誤: ${res.status}` }, { status: 502 });
    }

    const json = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";

    // Parse JSON — strip possible markdown fences
    let cleaned = raw;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let article: Record<string, unknown>;
    try {
      article = JSON.parse(cleaned);
    } catch {
      console.error("[blog/generate] parse error, raw:", raw.slice(0, 200));
      return NextResponse.json({ error: "AI 回傳格式錯誤，請重試" }, { status: 502 });
    }

    // Ensure slug is valid + unique-ish
    if (!article.slug || typeof article.slug !== "string") {
      article.slug = slugify(String(article.title || topic));
    }
    // Append timestamp to avoid slug collision
    article.slug = `${article.slug}-${Date.now().toString(36)}`;

    // Fetch cover image from Pexels if available
    let coverImage = "";
    if (pexelsKey) {
      const coverKeywords = (article.cover_keywords as string) || `${topic} travel`;
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
