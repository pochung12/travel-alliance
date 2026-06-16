import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

type Img = { url: string; thumb: string; alt: string };

const JUNK_RE = /(map|locator|logo|diagram|icon|svg|coat of arms|flag|seal|chart|\bplan\b|stamp|emblem|signature|qr)/i;

// Wikimedia Commons：依真實地名找實景照（中港台日韓等具名景點覆蓋遠勝一般圖庫）
async function searchWikimedia(q: string): Promise<Img[]> {
  try {
    const url = "https://commons.wikimedia.org/w/api.php"
      + "?action=query&format=json&generator=search&gsrnamespace=6"
      + `&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}`
      + "&gsrlimit=24&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1600";
    const res = await fetch(url, {
      headers: { "User-Agent": "TravelAlliance/1.0 (https://1trip.com.tw; tour pages image lookup)" },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      query?: { pages?: Record<string, {
        title?: string; index?: number;
        imageinfo?: Array<{ url?: string; thumburl?: string; width?: number; height?: number; thumbwidth?: number; thumbheight?: number; mime?: string }>;
      }> };
    };
    const pages = Object.values(data.query?.pages || {});
    pages.sort((a, b) => (a.index ?? 999) - (b.index ?? 999));
    const out: Img[] = [];
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      if (JUNK_RE.test(p.title || "")) continue;
      if (ii.mime && !/image\/(jpeg|png|jpg)/i.test(ii.mime)) continue;
      const w = ii.thumbwidth || ii.width || 0;
      const h = ii.thumbheight || ii.height || 0;
      if (w && h && w < h * 1.05) continue;
      const u = ii.thumburl || ii.url;
      if (u && !out.some(x => x.url === u)) out.push({ url: u, thumb: u, alt: (p.title || "").replace(/^File:/, "") });
    }
    return out;
  } catch {
    return [];
  }
}

async function searchPexels(q: string, pexelsKey: string): Promise<Img[]> {
  if (!pexelsKey) return [];
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=12&orientation=landscape`,
      { headers: { Authorization: pexelsKey } }
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      photos?: Array<{ src?: { large2x?: string; large?: string; medium?: string; original?: string }; alt?: string }>;
    };
    return (data.photos || [])
      .map(p => ({
        url:   p.src?.large2x || p.src?.large || p.src?.original || "",
        thumb: p.src?.medium || p.src?.large || "",
        alt:   p.alt || "",
      }))
      .filter(p => p.url);
  } catch {
    return [];
  }
}

// 搜尋圖庫：Wikimedia 實景 + Pexels 圖庫 合併（供後台個別換圖使用）
export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json() as { query?: string };
    const q = (query || "").trim();
    if (!q) return NextResponse.json({ error: "請輸入搜尋關鍵字" }, { status: 400 });

    const pexelsKey = process.env.PEXELS_API_KEY || "";

    const [wiki, pexels] = await Promise.all([
      searchWikimedia(q),
      searchPexels(q, pexelsKey),
    ]);

    // Wikimedia 實景優先（具名景點較準），Pexels 補足；去重
    const seen = new Set<string>();
    const images: Img[] = [];
    for (const img of [...wiki, ...pexels]) {
      if (seen.has(img.url)) continue;
      seen.add(img.url);
      images.push(img);
    }

    if (images.length === 0) {
      return NextResponse.json({ error: "找不到照片，試試更具體的地名或英文關鍵字" }, { status: 200 });
    }
    return NextResponse.json({ images: images.slice(0, 24) });
  } catch (e) {
    console.error("[tour-page/image-search] error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
