import { NextRequest } from "next/server";

export const maxDuration = 30;

// 同源圖片代理：讓前端 canvas 能讀取外部圖片而不被跨域污染（用於生成行銷圖/短影片）
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || "";
  if (!/^https?:\/\//i.test(url)) {
    return new Response("bad url", { status: 400 });
  }
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Referer": new URL(url).origin,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return new Response("fetch failed", { status: 502 });
    const ct = r.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return new Response("not an image", { status: 415 });
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response("error", { status: 502 });
  }
}
