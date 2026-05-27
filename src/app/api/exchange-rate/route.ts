import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// 取得 CNY→TWD 匯率，每天只從外部 API 抓一次，其餘從 DB 快取讀取
export async function GET() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const sb = getAdmin();

  // ── 1. 先查 DB 快取 ────────────────────────────────────────────────────────
  const { data: cached } = await sb
    .from("exchange_rates")
    .select("cny_to_twd")
    .eq("date", today)
    .single();

  if (cached?.cny_to_twd) {
    return NextResponse.json({ rate: cached.cny_to_twd, date: today, cached: true });
  }

  // ── 2. 從 CDN 免費 API 抓最新匯率（不需 API key，jsdelivr CDN 快取每日更新）
  let rate: number | null = null;

  // 主要來源：fawazahmed0 currency API（CDN 托管，完全免費）
  try {
    const res = await fetch(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json",
      { signal: AbortSignal.timeout(6000) }
    );
    if (res.ok) {
      const json = await res.json();
      rate = json?.cny?.twd ?? null;
    }
  } catch { /* ignore, try fallback */ }

  // 備用：exchangerate-api v4（免費、無需 key）
  if (!rate) {
    try {
      const res = await fetch(
        "https://api.exchangerate-api.com/v4/latest/CNY",
        { signal: AbortSignal.timeout(6000) }
      );
      if (res.ok) {
        const json = await res.json();
        rate = json?.rates?.TWD ?? null;
      }
    } catch { /* ignore */ }
  }

  if (!rate) {
    return NextResponse.json(
      { error: "無法取得匯率，請稍後再試" },
      { status: 503 }
    );
  }

  // ── 3. 寫入 DB 快取（upsert 防止重複）──────────────────────────────────────
  await sb.from("exchange_rates").upsert(
    { date: today, cny_to_twd: rate, updated_at: new Date().toISOString() },
    { onConflict: "date" }
  );

  return NextResponse.json({ rate, date: today, cached: false });
}
