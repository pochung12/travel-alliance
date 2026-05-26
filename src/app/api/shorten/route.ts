import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ── spoo.me（首選：完全免費、無廣告、直接跳轉） ─────────────────────────────
async function spoomeShorten(longUrl: string): Promise<string | null> {
  try {
    const res = await fetch("https://spoo.me/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({ url: longUrl }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.short_url as string) || null;
  } catch {
    return null;
  }
}

// ── is.gd（第二備用） ────────────────────────────────────────────────────────
async function isgdShorten(longUrl: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ format: "json", url: longUrl });
    const res = await fetch(`https://is.gd/create.php?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.errorcode) return null;
    return (data.shorturl as string) || null;
  } catch {
    return null;
  }
}

// ── cleanuri.com（第三備用） ─────────────────────────────────────────────────
async function cleanuriShorten(longUrl: string): Promise<string | null> {
  try {
    const res = await fetch("https://cleanuri.com/api/v1/shorten", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ url: longUrl }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.result_url as string) || null;
  } catch {
    return null;
  }
}

// ── 本地短碼（最終備用） ─────────────────────────────────────────────────────
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
function randomCode(len = 6): string {
  return Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
}

// ── POST /api/shorten ────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { tourId } = body as { tourId?: string };
  if (!tourId) return NextResponse.json({ error: "缺少 tourId" }, { status: 400 });

  const sb = getAdmin();

  // 若已有記錄 → 直接回傳
  const { data: existing } = await sb
    .from("tour_join_codes")
    .select("code, short_url")
    .eq("tour_id", tourId)
    .limit(1);

  if (existing && existing.length > 0 && existing[0].short_url) {
    return NextResponse.json({ shortUrl: existing[0].short_url });
  }

  // 目標報名表 URL
  const host    = req.headers.get("host") || "";
  const proto   = req.headers.get("x-forwarded-proto") || "https";
  const joinUrl = `${proto}://${host}/join/${tourId}`;

  // 依序嘗試外部短網址服務
  let shortUrl: string | null = null;
  let source = "";

  shortUrl = await spoomeShorten(joinUrl);
  if (shortUrl) { source = "spoo.me"; }

  if (!shortUrl) {
    shortUrl = await isgdShorten(joinUrl);
    if (shortUrl) { source = "is.gd"; }
  }

  if (!shortUrl) {
    shortUrl = await cleanuriShorten(joinUrl);
    if (shortUrl) { source = "cleanuri"; }
  }

  // 所有外部服務都失敗 → 本地短碼
  if (!shortUrl) {
    const code = randomCode(6);
    shortUrl = `${proto}://${host}/j/${code}`;
    source = "local";

    if (existing && existing.length > 0) {
      await sb.from("tour_join_codes").update({ short_url: shortUrl }).eq("tour_id", tourId);
    } else {
      await sb.from("tour_join_codes").insert({ code, tour_id: tourId, short_url: shortUrl });
    }
    return NextResponse.json({ shortUrl, source });
  }

  // 外部短網址成功 → 存入 DB
  const code = randomCode(6);
  if (existing && existing.length > 0) {
    await sb.from("tour_join_codes").update({ short_url: shortUrl }).eq("tour_id", tourId);
  } else {
    await sb.from("tour_join_codes").insert({ code, tour_id: tourId, short_url: shortUrl });
  }

  return NextResponse.json({ shortUrl, source });
}
