import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

// 搜尋 Pexels 圖庫，回傳候選照片清單（供後台個別換圖使用）
export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json() as { query?: string };
    const q = (query || "").trim();
    if (!q) {
      return NextResponse.json({ error: "請輸入搜尋關鍵字" }, { status: 400 });
    }

    const pexelsKey = process.env.PEXELS_API_KEY || "";
    if (!pexelsKey) {
      return NextResponse.json({ error: "未設定 PEXELS_API_KEY" }, { status: 500 });
    }

    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=12&orientation=landscape`,
      { headers: { Authorization: pexelsKey } }
    );
    if (!res.ok) {
      return NextResponse.json({ error: `圖庫搜尋失敗: ${res.status}` }, { status: 502 });
    }

    const data = await res.json() as {
      photos?: Array<{
        src?: { large2x?: string; large?: string; medium?: string; original?: string };
        alt?: string;
      }>;
    };

    const images = (data.photos || [])
      .map(p => ({
        url:   p.src?.large2x || p.src?.large || p.src?.original || "",
        thumb: p.src?.medium || p.src?.large || "",
        alt:   p.alt || "",
      }))
      .filter(p => p.url);

    return NextResponse.json({ images });
  } catch (e) {
    console.error("[tour-page/image-search] error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
