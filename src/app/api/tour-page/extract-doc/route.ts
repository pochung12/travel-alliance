import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

/**
 * 行程檔案文字萃取
 * - { docxBase64 }：Word (.docx) → mammoth 抽純文字
 * - { images: [dataURL...] }：掃描版 PDF 頁面截圖 → AI 視覺辨識行程文字
 * 回傳 { text }
 */
export async function POST(req: NextRequest) {
  try {
    const { docxBase64, images } = await req.json() as { docxBase64?: string; images?: string[] };

    // ── Word (.docx) ──
    if (docxBase64) {
      const mammoth = await import("mammoth");
      const buf = Buffer.from(docxBase64, "base64");
      try {
        const result = await mammoth.extractRawText({ buffer: buf });
        const text = (result.value || "").replace(/\n{3,}/g, "\n\n").trim();
        if (!text) return NextResponse.json({ error: "Word 檔內沒有可讀取的文字" }, { status: 422 });
        return NextResponse.json({ text });
      } catch {
        return NextResponse.json(
          { error: "無法解析此 Word 檔。若是舊版 .doc 格式，請先另存為 .docx 或 PDF 再上傳" },
          { status: 422 },
        );
      }
    }

    // ── 掃描 PDF 頁面圖片 → AI 辨識 ──
    if (Array.isArray(images) && images.length > 0) {
      const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
      const baseUrl = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
      if (!apiKey) return NextResponse.json({ error: "未設定 AI API Key" }, { status: 500 });

      const texts: string[] = [];
      for (const img of images.slice(0, 8)) {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://1trip.com.tw",
            "X-Title": "Travel Alliance Doc Extract",
          },
          body: JSON.stringify({
            model: "anthropic/claude-sonnet-4-5",
            temperature: 0,
            max_tokens: 3000,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: "這是旅遊行程文件的一頁。請把頁面上的文字完整轉錄出來（保持原本的段落順序，包括每日行程、景點、餐食、飯店、航班、費用說明等）。只輸出轉錄文字，不要加任何說明。" },
                { type: "image_url", image_url: { url: img } },
              ],
            }],
          }),
        });
        if (!res.ok) continue;
        const j = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        const t = j.choices?.[0]?.message?.content?.trim();
        if (t) texts.push(t);
      }
      const text = texts.join("\n\n").trim();
      if (!text) return NextResponse.json({ error: "辨識不到文件內容，請改用複製貼上" }, { status: 422 });
      return NextResponse.json({ text });
    }

    return NextResponse.json({ error: "沒有收到檔案內容" }, { status: 400 });
  } catch (e) {
    console.error("[extract-doc] error:", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
