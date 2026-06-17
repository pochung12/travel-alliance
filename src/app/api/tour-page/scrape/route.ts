import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 90;

// 從 HTML 萃取候選內容圖片（過濾 logo/icon/廣告，解析相對網址）
function extractImages(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const re = /(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && urls.size < 80) {
    let u = (m[1] || "").trim();
    if (!u || u.startsWith("data:")) continue;
    try { u = new URL(u, baseUrl).href; } catch { continue; }
    if (!/^https?:\/\//i.test(u)) continue;
    if (!/\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)) continue;               // 只要真圖檔
    if (/(logo|icon|sprite|avatar|pixel|blank|loading|placeholder|qrcode|wechat|weixin|advert|button|btn_|arrow|share|footer|header_)/i.test(u)) continue;
    urls.add(u);
  }
  return Array.from(urls).slice(0, 40);
}

// 把 HTML 粗略轉成純文字（移除 script/style/標籤，壓縮空白）
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|tr|h\d|br|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

const EXTRACT_PROMPT = `你是行程資料整理助手。以下是從某旅遊網頁抓取的純文字內容，請萃取出完整的行程資訊，整理成乾淨的繁體中文「行程素材」，供後續生成自家行程網頁使用。

要求：
1. 萃取每日行程（Day1、Day2…）：當日路線、景點名稱、餐食（早/午/晚，含特色餐名）、住宿飯店名稱、航班資訊（航班號/時間，若有）。
2. 【務必移除】任何旅行社／OTA 平台的品牌名稱、公司名、Logo 文字、客服電話、報名方式、價格／報價、購物站推銷、自費活動推銷、會員招攬等商業或行銷字眼。只保留「行程本身」的客觀內容。
3. 用簡潔條列，每天一段，例如：「Day1 台北桃園→上海浦東 18:40-20:40，晚餐機上，宿：上海機場酒店」。
4. 若頁面不是行程頁或內容很少，盡量回傳你能辨識到的片段即可。

只回傳整理後的行程素材純文字，不要加任何說明或標題。`;

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json() as { url?: string };
    const target = (url || "").trim();
    if (!/^https?:\/\//i.test(target)) {
      return NextResponse.json({ error: "請輸入有效的網址（需以 http:// 或 https:// 開頭）" }, { status: 400 });
    }

    // 抓取網頁
    let html = "";
    try {
      const res = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          "Accept-Language": "zh-TW,zh;q=0.9",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        return NextResponse.json({ error: `無法讀取該網址（HTTP ${res.status}）。部分網站會擋外部讀取，可改用瀏覽器複製內容貼到素材框。` }, { status: 502 });
      }
      html = await res.text();
    } catch {
      return NextResponse.json({ error: "讀取網址逾時或失敗。該網站可能擋外部抓取（如攜程動態載入），可改用瀏覽器複製行程內容貼到素材框。" }, { status: 502 });
    }

    const images = extractImages(html, target);
    let text = htmlToText(html);
    if (text.length < 80) {
      return NextResponse.json({ error: "此頁面內容很少（可能是動態載入的網站）。建議改用瀏覽器複製行程文字貼到素材框。" }, { status: 422 });
    }
    if (text.length > 16000) text = text.slice(0, 16000);

    const apiKey  = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
    if (!apiKey) {
      return NextResponse.json({ error: "未設定 AI API Key" }, { status: 500 });
    }

    const aiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://1trip.com.tw",
        "X-Title": "Travel Alliance Itinerary Scrape",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4-5",
        temperature: 0.3,
        max_tokens: 3000,
        messages: [
          { role: "system", content: EXTRACT_PROMPT },
          { role: "user", content: text },
        ],
      }),
    });
    if (!aiRes.ok) {
      return NextResponse.json({ error: `AI 整理失敗（${aiRes.status}）` }, { status: 502 });
    }
    const j = await aiRes.json() as { choices?: Array<{ message?: { content?: string } }> };
    const material = (j.choices?.[0]?.message?.content || "").trim();
    if (!material) {
      return NextResponse.json({ error: "無法從此頁面萃取行程，建議改用複製貼上。" }, { status: 422 });
    }

    return NextResponse.json({ material, images });
  } catch (e) {
    console.error("[tour-page/scrape] error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
