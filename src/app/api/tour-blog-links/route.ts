import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ── GET: 取得某行程已綁定的文章 + 所有可選文章 ─────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tourId = searchParams.get("tourId");
  if (!tourId) return NextResponse.json({ error: "缺少 tourId" }, { status: 400 });

  const sb = getAdmin();

  const [{ data: links }, { data: posts }] = await Promise.all([
    sb.from("tour_blog_links")
      .select("blog_post_id, display_order")
      .eq("tour_id", tourId)
      .order("display_order"),
    sb.from("blog_posts")
      .select("id, slug, title, excerpt, cover_image, category, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(80),
  ]);

  const linkedIds = (links || []).map((l: { blog_post_id: string }) => l.blog_post_id);

  return NextResponse.json({
    linkedIds,
    posts: posts || [],
  });
}

// ── POST: 儲存行程的文章勾選清單 ─────────────────────────────────────────────
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { tourId, postIds } = body as { tourId?: string; postIds?: string[] };

  if (!tourId) return NextResponse.json({ error: "缺少 tourId" }, { status: 400 });

  const sb = getAdmin();

  // 清除舊關聯
  await sb.from("tour_blog_links").delete().eq("tour_id", tourId);

  // 寫入新關聯（保留勾選順序）
  if (postIds && postIds.length > 0) {
    const rows = postIds.map((pid, i) => ({
      tour_id:       tourId,
      blog_post_id:  pid,
      display_order: i,
    }));
    const { error } = await sb.from("tour_blog_links").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
