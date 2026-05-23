import { NextResponse } from "next/server";

/**
 * POST /api/blog/trigger
 * 管理後台用：server side 持有 secret，代理呼叫 /api/blog/cron
 * 不需要前端知道 BLOG_CRON_SECRET
 */
export async function POST(req: Request) {
  // 可選：簡單管理員驗證（你可以之後加 session 檢查）
  const secret = process.env.BLOG_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "BLOG_CRON_SECRET 未設定" }, { status: 500 });
  }

  // 取得本機服務的 base URL
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  try {
    const cronRes = await fetch(`${baseUrl}/api/blog/cron`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    const json = await cronRes.json();
    return NextResponse.json(json, { status: cronRes.status });
  } catch (e) {
    console.error("[blog/trigger] error:", e);
    return NextResponse.json({ error: "觸發失敗" }, { status: 500 });
  }
}
