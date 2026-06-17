import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

// 把來源網頁的圖片下載後重新存到自家 Storage（避免熱連結失效/CORS，永久保存）
export async function POST(req: NextRequest) {
  try {
    const { url, tourId } = await req.json() as { url?: string; tourId?: string };
    const src = (url || "").trim();
    if (!/^https?:\/\//i.test(src)) {
      return NextResponse.json({ error: "無效的圖片網址" }, { status: 400 });
    }

    let res: Response;
    try {
      res = await fetch(src, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          "Referer": new URL(src).origin,
        },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      return NextResponse.json({ error: "下載圖片失敗（來源可能擋外連）" }, { status: 502 });
    }
    if (!res.ok) return NextResponse.json({ error: `下載圖片失敗（HTTP ${res.status}）` }, { status: 502 });

    const ct = res.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return NextResponse.json({ error: "該網址不是圖片" }, { status: 415 });
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength < 2000) return NextResponse.json({ error: "圖片太小（可能是 icon）" }, { status: 422 });

    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : ct.includes("avif") ? "avif" : "jpg";
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const path = `scraped/${tourId || "x"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("tour-photos").upload(path, buf, { contentType: ct, upsert: false });
    if (error) {
      return NextResponse.json({ error: "存檔失敗：" + error.message }, { status: 500 });
    }
    const publicUrl = supabase.storage.from("tour-photos").getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ url: publicUrl });
  } catch (e) {
    console.error("[tour-page/rehost] error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
