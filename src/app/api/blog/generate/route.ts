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
- content: 文章正文（至少600字，支援 ## 段落標題、> 引言、- 列表）
- category: 分類（japan / asia / europe / southeast_asia / china / tips / food / travel 擇一）
- tags: 標籤陣列（3-6個字串）
- reading_time: 預估閱讀分鐘數（整數）

內容要求：
1. 文章分4-6個段落，每段有 ## 標題
2. 包含實用資訊（交通/住宿/美食/行程建議）
3. 加入2-3個 > 引言句，引言要有畫面感
4. 語氣親切，像在和朋友分享旅行故事
5. 最後一段是「暖心旅行小叮嚀」`;

export async function POST(req: NextRequest) {
  try {
    const { topic, category } = await req.json() as { topic?: string; category?: string };
    if (!topic?.trim()) {
      return NextResponse.json({ error: "請提供文章主題" }, { status: 400 });
    }

    const apiKey  = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
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

    return NextResponse.json(article);
  } catch (e) {
    console.error("[blog/generate] unexpected error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
