import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/blog/cron
 *
 * Railway Cron 設定（Service → Settings → Cron Jobs）：
 *   Schedule:  0 1 * * *       UTC 01:00 = 台灣早上 09:00
 *   Method:    POST
 *   URL:       https://<你的domain>/api/blog/cron
 *   Headers:   x-cron-secret: <BLOG_CRON_SECRET>
 *
 * 環境變數：
 *   BLOG_CRON_SECRET   — 驗證金鑰（必須）
 *   OPENAI_API_KEY     — OpenRouter API key（必須）
 *   OPENAI_BASE_URL    — https://openrouter.ai/api/v1
 *   TAVILY_API_KEY     — 選填：自動抓取網路熱門旅遊話題
 *   PEXELS_API_KEY     — 選填：自動取得精美封面圖片
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

// ── 備用主題（Tavily 不可用時使用）────────────────────────────────────────────
const DAILY_TOPICS = [
  { topic: "東京四季最美景點完整攻略",         category: "japan"         },
  { topic: "京都古都文化深度旅遊指南",          category: "japan"         },
  { topic: "峇里島私房景點悠閒度假",            category: "southeast_asia"},
  { topic: "泰國清邁文化美食五日遊",            category: "southeast_asia"},
  { topic: "巴黎浪漫蜜月旅行規劃",             category: "europe"        },
  { topic: "北海道冬季雪祭賞雪完整行程",        category: "japan"         },
  { topic: "九份金瓜石台灣在地旅遊",            category: "asia"          },
  { topic: "越南河內古城美食街道探索",          category: "southeast_asia"},
  { topic: "義大利托斯卡尼鄉村深度旅遊",        category: "europe"        },
  { topic: "沖繩海島度假最完整攻略",            category: "japan"         },
  { topic: "香港澳門雙城美食探索之旅",          category: "china"         },
  { topic: "首爾弘大江南購物旅遊攻略",          category: "asia"          },
  { topic: "馬來西亞吉隆坡多元文化體驗",        category: "southeast_asia"},
  { topic: "荷蘭阿姆斯特丹風車鬱金香之旅",      category: "europe"        },
  { topic: "旅行前必做的十件準備事項",          category: "tips"          },
  { topic: "出國省錢旅遊的秘訣與技巧",          category: "tips"          },
  { topic: "亞洲最值得嚐試的街頭美食排行",      category: "food"          },
  { topic: "日本拉麵地圖全攻略",               category: "food"          },
  { topic: "自由行 vs 跟團旅遊優缺點完整比較",  category: "tips"          },
  { topic: "台灣花東縱谷騎車旅遊",             category: "asia"          },
  { topic: "廈門鼓浪嶼閩南文化巡禮",           category: "china"         },
  { topic: "布達佩斯東歐之珠輕旅行",           category: "europe"        },
  { topic: "曼谷廟宇美食雙重享受",             category: "southeast_asia"},
  { topic: "北歐冰島追極光完整攻略",           category: "europe"        },
  { topic: "西班牙巴塞隆納高第建築朝聖",        category: "europe"        },
  { topic: "新加坡花園城市吃喝玩樂全攻略",      category: "southeast_asia"},
  { topic: "四川成都熊貓美食文化之旅",          category: "china"         },
  { topic: "旅遊保險怎麼買最划算",             category: "tips"          },
  { topic: "跨國旅行行李打包完整指南",          category: "tips"          },
  { topic: "雲南麗江大理少數民族文化旅遊",      category: "china"         },
  { topic: "大阪道頓堀美食購物深度遊",         category: "japan"         },
  { topic: "普羅旺斯薰衣草花田旅遊攻略",        category: "europe"        },
  { topic: "胡志明市現代與古典的碰撞",          category: "southeast_asia"},
  { topic: "杭州西湖江南水鄉深度體驗",          category: "china"         },
  { topic: "台北美食地圖一日散策",             category: "asia"          },
  { topic: "希臘聖托里尼藍白小屋夢幻旅程",      category: "europe"        },
  { topic: "東南亞最美海灘排行榜",             category: "southeast_asia"},
  { topic: "日本神社御守文化完整介紹",          category: "japan"         },
  { topic: "西藏拉薩朝聖與高原風光之旅",        category: "china"         },
  { topic: "韓國濟州島四季玩法全攻略",          category: "asia"          },
  { topic: "捷克布拉格童話小鎮旅遊指南",        category: "europe"        },
  { topic: "菲律賓長灘島極限運動與海景",        category: "southeast_asia"},
  { topic: "尼泊爾加德滿都徒步健行全攻略",      category: "asia"          },
  { topic: "土耳其伊斯坦堡東西文明交匯",        category: "europe"        },
  { topic: "摩洛哥馬拉喀什異域風情探索",        category: "travel"        },
];

// ── 工具函式 ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[一-鿿぀-ゟ゠-ヿ\s]+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || `post-${Date.now()}`;
}

function dayOfYear(): number {
  const now = new Date();
  return Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
  );
}

// ── 系統提示詞 ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是暖心旅行社的旅遊文章寫手，文章風格活潑有溫度、適合旅遊雜誌。
請依照指定主題撰寫一篇完整的繁體中文旅遊文章，並以 JSON 格式回傳（不要加 markdown code block）。

JSON 欄位：
- title: 吸引人的文章標題（20-40字）
- slug: 英文網址（全小寫、連字符、無空格，長度10-40字元）
- excerpt: 精彩摘要（50-100字，讓讀者想繼續閱讀）
- content: 文章正文（至少800字，使用 ## 段落標題、> 引言、- 列表）
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

// ── Tavily：搜尋熱門旅遊話題 ─────────────────────────────────────────────────

async function fetchTrendingContext(tavilyKey: string): Promise<string> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key:        tavilyKey,
      query:          "2025年熱門旅遊景點 台灣旅客最愛 必去目的地 旅遊趨勢",
      search_depth:   "basic",
      max_results:    6,
      include_answer: true,
    }),
  });
  if (!res.ok) throw new Error(`Tavily error: ${res.status}`);
  const data = await res.json() as {
    answer?: string;
    results?: Array<{ title?: string; content?: string }>;
  };
  const parts: string[] = [];
  if (data.answer) parts.push(data.answer);
  (data.results || []).forEach(r => {
    if (r.title || r.content) parts.push(`${r.title || ""}: ${(r.content || "").slice(0, 300)}`);
  });
  return parts.join("\n\n");
}

// ── AI：從熱門話題中提取3個文章主題 ──────────────────────────────────────────

async function extractTopicsFromContext(
  context: string, apiKey: string, baseUrl: string
): Promise<Array<{ topic: string; category: string }>> {
  const prompt = `根據以下最新旅遊資訊，為台灣旅客設計3個精彩的旅遊文章主題，要具體且吸引人。
分類選項：japan / asia / europe / southeast_asia / china / tips / food / travel

最新旅遊資訊：
${context.slice(0, 3000)}

請以JSON陣列格式回傳（不要加markdown）：
[{"topic":"具體文章主題（例：2025年京都秋季楓葉攻略）","category":"japan"},...]`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer":  "https://travel-alliance.railway.app",
    },
    body: JSON.stringify({
      model:       "anthropic/claude-sonnet-4-5",
      temperature: 0.9,
      max_tokens:  500,
      messages:    [{ role: "user", content: prompt }],
    }),
  });
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
  let cleaned = raw;
  if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(cleaned) as Array<{ topic: string; category: string }>;
}

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
  // 從前10張隨機選一張，增加多樣性
  const pick = photos[Math.floor(Math.random() * Math.min(photos.length, 10))];
  return pick.src?.large2x || pick.src?.large || pick.src?.original || "";
}

// ── 生成單篇文章 ──────────────────────────────────────────────────────────────

async function generateArticle(
  topic: string,
  category: string,
  apiKey: string,
  baseUrl: string,
  pexelsKey: string,
): Promise<{
  title: string; slug: string; excerpt: string; content: string;
  cover_image: string; category: string; tags: string[];
  reading_time: number; ai_prompt: string;
}> {
  // 1. AI 生成文章
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

  if (!aiRes.ok) throw new Error(`AI API error: ${aiRes.status}`);

  const aiJson = await aiRes.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = aiJson.choices?.[0]?.message?.content?.trim() ?? "";
  let cleaned = raw;
  if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  const article = JSON.parse(cleaned) as Record<string, unknown>;

  // 確保 slug 不衝突
  if (!article.slug || typeof article.slug !== "string") {
    article.slug = slugify(String(article.title || topic));
  }
  article.slug = `${article.slug}-${Date.now().toString(36)}`;

  // 2. 取得封面圖片
  let coverImage = "";
  const coverKeywords = (article.cover_keywords as string) || `${topic} travel destination`;
  if (pexelsKey) {
    try {
      coverImage = await getPexelsImage(coverKeywords, pexelsKey);
    } catch (e) {
      console.warn(`[blog/cron] Pexels image failed for "${coverKeywords}":`, e);
    }
  }

  return {
    title:        String(article.title || topic),
    slug:         String(article.slug),
    excerpt:      String(article.excerpt || ""),
    content:      String(article.content || ""),
    cover_image:  coverImage,
    category:     String(article.category || category),
    tags:         Array.isArray(article.tags) ? article.tags as string[] : [],
    reading_time: Number(article.reading_time) || 5,
    ai_prompt:    topic,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  // ── 驗證 secret ──
  const secret   = req.headers.get("x-cron-secret");
  const expected = process.env.BLOG_CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey    = process.env.OPENAI_API_KEY;
  const baseUrl   = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
  const supaUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY || "";
  const pexelsKey = process.env.PEXELS_API_KEY || "";

  if (!apiKey || !supaUrl || !supaKey) {
    return NextResponse.json({ error: "Missing required env vars (OPENAI_API_KEY / SUPABASE)" }, { status: 500 });
  }

  // ── 決定今天的 3 個主題 ──
  let todayTopics: Array<{ topic: string; category: string }>;

  if (tavilyKey) {
    try {
      console.log("[blog/cron] Fetching trending topics via Tavily...");
      const context = await fetchTrendingContext(tavilyKey);
      todayTopics   = await extractTopicsFromContext(context, apiKey, baseUrl);
      // 確保剛好3個
      if (!Array.isArray(todayTopics) || todayTopics.length === 0) throw new Error("empty topics");
      todayTopics = todayTopics.slice(0, 3);
      console.log("[blog/cron] Trending topics:", todayTopics.map(t => t.topic));
    } catch (e) {
      console.warn("[blog/cron] Tavily/topic extraction failed, using fallback:", e);
      todayTopics = null!; // fallthrough
    }
  }

  // Fallback：從固定清單按日期輪轉，每天取3個不重複
  if (!todayTopics!) {
    const day = dayOfYear();
    todayTopics = [
      DAILY_TOPICS[(day * 3 + 0) % DAILY_TOPICS.length],
      DAILY_TOPICS[(day * 3 + 1) % DAILY_TOPICS.length],
      DAILY_TOPICS[(day * 3 + 2) % DAILY_TOPICS.length],
    ];
    console.log("[blog/cron] Using fallback topics:", todayTopics.map(t => t.topic));
  }

  // ── 逐篇生成並儲存 ──
  const sb = createClient(supaUrl, supaKey);
  const results: Array<{ success: boolean; title: string; slug?: string; error?: string }> = [];

  for (const { topic, category } of todayTopics) {
    try {
      console.log(`[blog/cron] Generating: "${topic}" (${category})`);
      const article = await generateArticle(topic, category, apiKey, baseUrl, pexelsKey);

      const { error: dbErr } = await sb.from("blog_posts").insert({
        title:        article.title,
        slug:         article.slug,
        excerpt:      article.excerpt,
        content:      article.content,
        cover_image:  article.cover_image,
        category:     article.category,
        tags:         article.tags,
        reading_time: article.reading_time,
        status:       "published",
        published_at: new Date().toISOString(),
        ai_generated: true,
        ai_prompt:    article.ai_prompt,
      });

      if (dbErr) throw new Error(`DB: ${dbErr.message}`);

      console.log(`[blog/cron] ✅ Published: "${article.title}" | image: ${article.cover_image ? "✓" : "✗（fallback）"}`);
      results.push({ success: true, title: article.title, slug: article.slug });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[blog/cron] ❌ Failed: "${topic}":`, msg);
      results.push({ success: false, title: topic, error: msg });
    }

    // 每篇之間等 1 秒，避免 rate limit
    if (todayTopics.indexOf({ topic, category }) < todayTopics.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const successCount = results.filter(r => r.success).length;
  return NextResponse.json({
    success:      successCount > 0,
    generated:    successCount,
    total:        todayTopics.length,
    used_tavily:  !!tavilyKey,
    used_pexels:  !!pexelsKey,
    results,
  });
}

/** GET — health check */
export async function GET() {
  return NextResponse.json({
    status:     "ok",
    info:       "POST with x-cron-secret header to trigger daily auto-post",
    topics:     DAILY_TOPICS.length,
    per_day:    3,
    tavily:     !!process.env.TAVILY_API_KEY,
    pexels:     !!process.env.PEXELS_API_KEY,
    cron_hint:  "Railway Cron: 0 1 * * * (UTC 01:00 = 台灣 09:00)",
  });
}
