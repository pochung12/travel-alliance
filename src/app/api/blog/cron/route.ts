import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/blog/cron
 *
 * Railway Cron 設定（在 Railway dashboard → Service → Settings → Cron）：
 *   Schedule:  0 8 * * *       每天早上 8 點（UTC+8 需設 0 0 * * *）
 *   Method:    POST
 *   URL:       https://<你的domain>/api/blog/cron
 *   Headers:   x-cron-secret: <BLOG_CRON_SECRET>
 *
 * 環境變數：
 *   BLOG_CRON_SECRET   — 驗證金鑰，任意字串（必須設定）
 *   OPENAI_API_KEY     — OpenRouter API key
 *   OPENAI_BASE_URL    — https://openrouter.ai/api/v1
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const DAILY_TOPICS = [
  { topic: "東京四季最美景點完整攻略",        category: "japan" },
  { topic: "京都古都文化深度旅遊指南",         category: "japan" },
  { topic: "峇里島私房景點悠閒度假",           category: "southeast_asia" },
  { topic: "泰國清邁文化美食五日遊",           category: "southeast_asia" },
  { topic: "巴黎浪漫蜜月旅行規劃",            category: "europe" },
  { topic: "北海道冬季雪祭賞雪完整行程",       category: "japan" },
  { topic: "九份金瓜石台灣在地旅遊",           category: "asia" },
  { topic: "越南河內古城美食街道探索",         category: "southeast_asia" },
  { topic: "義大利托斯卡尼鄉村深度旅遊",       category: "europe" },
  { topic: "沖繩海島度假最完整攻略",           category: "japan" },
  { topic: "香港澳門雙城美食探索之旅",         category: "china" },
  { topic: "首爾弘大江南購物旅遊攻略",         category: "asia" },
  { topic: "馬來西亞吉隆坡多元文化體驗",       category: "southeast_asia" },
  { topic: "荷蘭阿姆斯特丹風車鬱金香之旅",     category: "europe" },
  { topic: "旅行前必做的十件準備事項",         category: "tips" },
  { topic: "出國省錢旅遊的秘訣與技巧",         category: "tips" },
  { topic: "亞洲最值得嚐試的街頭美食排行",     category: "food" },
  { topic: "日本拉麵地圖全攻略",               category: "food" },
  { topic: "自由行 vs 跟團旅遊優缺點完整比較", category: "tips" },
  { topic: "台灣花東縱谷騎車旅遊",             category: "asia" },
  { topic: "廈門鼓浪嶼閩南文化巡禮",           category: "china" },
  { topic: "布達佩斯東歐之珠輕旅行",           category: "europe" },
  { topic: "曼谷廟宇美食雙重享受",             category: "southeast_asia" },
  { topic: "北歐冰島追極光完整攻略",           category: "europe" },
  { topic: "西班牙巴塞隆納高第建築朝聖",       category: "europe" },
  { topic: "新加坡花園城市吃喝玩樂全攻略",     category: "southeast_asia" },
  { topic: "四川成都熊貓美食文化之旅",         category: "china" },
  { topic: "旅遊保險怎麼買最划算",             category: "tips" },
  { topic: "跨國旅行行李打包完整指南",         category: "tips" },
  { topic: "雲南麗江大理少數民族文化旅遊",     category: "china" },
];

function slugify(text: string): string {
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
  // Verify cron secret
  const secret = req.headers.get("x-cron-secret");
  const expected = process.env.BLOG_CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey  = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!apiKey || !supaUrl || !supaKey) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  // Pick today's topic based on day-of-year
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const { topic, category } = DAILY_TOPICS[dayOfYear % DAILY_TOPICS.length];

  try {
    // 1. Call AI
    const aiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer":  "https://travel-alliance.railway.app",
        "X-Title":       "Travel Alliance Blog Cron",
      },
      body: JSON.stringify({
        model:       "anthropic/claude-sonnet-4-5",
        temperature: 0.85,
        max_tokens:  4000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: `請以「${topic}」為主題撰寫一篇旅遊文章。分類：${category}` },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return NextResponse.json({ error: `AI API error: ${aiRes.status}`, detail: errText }, { status: 502 });
    }

    const aiJson = await aiRes.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = aiJson.choices?.[0]?.message?.content?.trim() ?? "";

    let cleaned = raw;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const article = JSON.parse(cleaned) as Record<string, unknown>;
    if (!article.slug || typeof article.slug !== "string") {
      article.slug = slugify(String(article.title || topic));
    }
    article.slug = `${article.slug}-${Date.now().toString(36)}`;

    // 2. Save to Supabase
    const sb = createClient(supaUrl, supaKey);
    const { error: dbErr } = await sb.from("blog_posts").insert({
      title:        article.title,
      slug:         article.slug,
      excerpt:      article.excerpt,
      content:      article.content,
      category:     article.category || category,
      tags:         article.tags || [],
      reading_time: article.reading_time || 5,
      cover_image:  "",
      status:       "published",
      published_at: new Date().toISOString(),
      ai_generated: true,
      ai_prompt:    topic,
    });

    if (dbErr) {
      return NextResponse.json({ error: `DB error: ${dbErr.message}` }, { status: 500 });
    }

    console.log(`[blog/cron] Published: "${article.title}" (${category})`);
    return NextResponse.json({
      success: true,
      title:   article.title,
      slug:    article.slug,
      category,
    });
  } catch (e) {
    console.error("[blog/cron] error:", e);
    return NextResponse.json({ error: "Internal error", detail: String(e) }, { status: 500 });
  }
}

/** GET — health check */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    info:   "POST with x-cron-secret header to trigger daily auto-post",
    topics: DAILY_TOPICS.length,
  });
}
