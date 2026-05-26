import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ── is.gd 免費短網址 API（不需 API key，每小時 200 次限制） ──────────────────
async function isgdShorten(longUrl: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ format: "json", url: longUrl });
    const res = await fetch(`https://is.gd/create.php?${params}`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.shorturl as string) || null;
  } catch {
    return null;
  }
}

// ── POST /api/shorten — 為行程建立 is.gd 短網址 ─────────────────────────────
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { tourId } = body as { tourId?: string };
  if (!tourId) return NextResponse.json({ error: "缺少 tourId" }, { status: 400 });

  const sb = getAdmin();

  // 若已有短網址記錄 → 直接回傳
  const { data: existing } = await sb
    .from("tour_join_codes")
    .select("code, short_url")
    .eq("tour_id", tourId)
    .limit(1);

  if (existing && existing.length > 0 && existing[0].short_url) {
    return NextResponse.json({ shortUrl: existing[0].short_url });
  }

  // 建構目標報名表 URL（用 request header 取得 host）
  const host  = req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const joinUrl = `${proto}://${host}/join/${tourId}`;

  // 呼叫 is.gd 產生短網址
  const shortUrl = await isgdShorten(joinUrl);
  if (!shortUrl) {
    return NextResponse.json(
      { error: "is.gd 服務暫時無法使用，請稍後再試" },
      { status: 503 }
    );
  }

  // 存入 DB
  if (existing && existing.length > 0) {
    // 已有記錄但無 short_url → 更新
    await sb.from("tour_join_codes")
      .update({ short_url: shortUrl })
      .eq("tour_id", tourId);
  } else {
    // 全新記錄（保留 code 欄位相容舊資料）
    const code = Array.from(
      { length: 6 },
      () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)]
    ).join("");
    await sb.from("tour_join_codes").insert({ code, tour_id: tourId, short_url: shortUrl });
  }

  return NextResponse.json({ shortUrl });
}
