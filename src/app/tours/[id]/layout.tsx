import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

// 每 5 分鐘重新抓取，確保 LINE/FB 連結預覽資訊夠新
export const revalidate = 300;

interface PosterLite { image?: string }

export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const [tourRes, pageRes] = await Promise.all([
      supabase
        .from("tours")
        .select("name,destination,start_date,end_date,selling_price")
        .eq("id", params.id)
        .single(),
      supabase
        .from("tour_pages")
        .select("hero_posters,content")
        .eq("tour_id", params.id)
        .eq("status", "published")
        .limit(1),
    ]);

    const tour = tourRes.data as {
      name: string; destination: string;
      start_date: string; end_date: string; selling_price: number;
    } | null;

    if (!tour) {
      return { title: "Travel Alliance 旅遊大聯盟" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = pageRes.data?.[0] as any | undefined;
    const posters = (page?.hero_posters || []) as PosterLite[];
    const posterImage = posters.find(p => p.image)?.image || "";
    const subtitle = String(page?.content?.subtitle || "");

    const days = Math.round(
      (new Date(tour.end_date).getTime() - new Date(tour.start_date).getTime()) / 86400000
    ) + 1;

    const description =
      subtitle ||
      `${tour.destination}・${days}天${days - 1}夜｜NT$${(tour.selling_price || 0).toLocaleString()} 起｜暖心旅行社 Travel Alliance`;

    return {
      title: `${tour.name}｜Travel Alliance 旅遊大聯盟`,
      description,
      openGraph: {
        title: tour.name,
        description,
        type: "website",
        siteName: "Travel Alliance 旅遊大聯盟",
        ...(posterImage
          ? { images: [{ url: posterImage, width: 1200, height: 630, alt: tour.name }] }
          : {}),
      },
      twitter: {
        card: posterImage ? "summary_large_image" : "summary",
        title: tour.name,
        description,
        ...(posterImage ? { images: [posterImage] } : {}),
      },
    };
  } catch {
    return { title: "Travel Alliance 旅遊大聯盟" };
  }
}

export default function TourDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
