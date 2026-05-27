import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ── GET：讀取最新一筆匯率（只查 DB，不打外部 API）────────────────────────────
export async function GET() {
  const sb = getAdmin();

  const { data } = await sb
    .from("exchange_rates")
    .select("cny_to_twd, date")
    .order("date", { ascending: false })
    .limit(1)
    .single();

  if (!data) {
    return NextResponse.json({ rate: null, date: null });
  }

  return NextResponse.json({ rate: data.cny_to_twd, date: data.date });
}

// ── POST：手動觸發更新，從外部 API 抓最新匯率後存入 DB ──────────────────────
export async function POST() {
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

  // 備用：exchangerate-api v4
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
    return NextResponse.json({ error: "無法取得匯率，請稍後再試" }, { status: 503 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const sb = getAdmin();

  await sb.from("exchange_rates").upsert(
    { date: today, cny_to_twd: rate, updated_at: new Date().toISOString() },
    { onConflict: "date" }
  );

  return NextResponse.json({ rate, date: today });
}
