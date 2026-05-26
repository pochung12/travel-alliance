import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// 去除易混淆字元（0 O l 1 I i）
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

function randomCode(len = 6): string {
  return Array.from(
    { length: len },
    () => CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join("");
}

// POST /api/shorten — 為行程建立短碼（已存在則直接回傳）
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { tourId } = body as { tourId?: string };
  if (!tourId) return NextResponse.json({ error: "缺少 tourId" }, { status: 400 });

  const sb = getAdmin();

  // 若該行程已有短碼 → 直接回傳
  const { data: existing } = await sb
    .from("tour_join_codes")
    .select("code")
    .eq("tour_id", tourId)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ code: existing[0].code });
  }

  // 產生新短碼（重試避免極低機率碰撞）
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode(6);
    const { error } = await sb
      .from("tour_join_codes")
      .insert({ code, tour_id: tourId });
    if (!error) return NextResponse.json({ code });
    // 若非 unique constraint 錯誤則直接中斷
    if (!error.message?.includes("duplicate") && !error.message?.includes("unique")) break;
  }

  return NextResponse.json({ error: "產生短網址失敗，請再試一次" }, { status: 500 });
}
