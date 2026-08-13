import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 取得（或建立）本團的短代碼，回傳行程頁短網址
// POST { tourId } → { code, tourUrl, joinUrl }
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const randomCode = (len = 6) =>
  Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");

const BASE = "https://1trip.com.tw";

export async function POST(req: Request) {
  try {
    const { tourId } = await req.json().catch(() => ({})) as { tourId?: string };
    if (!tourId) return NextResponse.json({ error: "缺少 tourId" }, { status: 400 });

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 已有代碼 → 直接用
    const { data: existing } = await sb
      .from("tour_join_codes").select("code").eq("tour_id", tourId).limit(1);
    let code = existing?.[0]?.code as string | undefined;

    // 沒有 → 建一組（撞碼重試幾次）
    if (!code) {
      for (let i = 0; i < 5 && !code; i++) {
        const candidate = randomCode(6);
        const { error } = await sb.from("tour_join_codes").insert({ code: candidate, tour_id: tourId });
        if (!error) code = candidate;
        else if (!/duplicate|unique/i.test(error.message || "")) {
          return NextResponse.json({ error: "建立短代碼失敗：" + error.message }, { status: 500 });
        }
      }
      if (!code) return NextResponse.json({ error: "建立短代碼失敗，請重試" }, { status: 500 });
    }

    return NextResponse.json({
      code,
      tourUrl: `${BASE}/t/${code}`,
      joinUrl: `${BASE}/j/${code}`,
    });
  } catch (e) {
    console.error("[tour-link] error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
