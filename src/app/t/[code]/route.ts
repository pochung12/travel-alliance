import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 行程頁短網址：/t/<code> → /tours/<tour_id>
// 與 /j/<code>（報名頁）共用 tour_join_codes 的同一組代碼
export async function GET(
  req: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data } = await sb
    .from("tour_join_codes")
    .select("tour_id")
    .eq("code", code.toLowerCase())
    .single();

  if (!data) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>🔗 連結不存在</h2><p>此短網址已失效或輸入有誤，請聯絡旅行社取得最新連結。</p>
      </body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  return NextResponse.redirect(new URL(`/tours/${data.tour_id}`, req.url), 302);
}
