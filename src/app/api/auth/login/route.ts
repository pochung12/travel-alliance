import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "伺服器缺少 Supabase 登入設定" }, { status: 500 });
  }

  const { email, password } = await req.json().catch(() => ({ email: "", password: "" }));
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return NextResponse.json({ error: "請輸入 Email 與密碼" }, { status: 400 });
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email.trim(), password }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(raw); } catch { /* Supabase/Cloudflare 5xx may return HTML. */ }

    if (!response.ok) {
      const upstreamMessage = String(payload.error_description || payload.msg || payload.message || "");
      if (response.status >= 500) {
        return NextResponse.json({
          error: `Supabase Auth 暫時無法連線（${response.status}），請稍後按重試`,
          upstreamStatus: response.status,
        }, { status: 503 });
      }
      return NextResponse.json({ error: upstreamMessage || "Email 或密碼不正確" }, { status: response.status });
    }

    return NextResponse.json({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "連線逾時";
    return NextResponse.json({ error: `Supabase Auth 連線失敗：${message}` }, { status: 503 });
  }
}
