import { NextRequest, NextResponse } from "next/server";

// 判斷證件照片需要順時針旋轉幾度才正立（0/90/180/270）
export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: "Missing imageBase64" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
    }

    const imageUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    const prompt = `這是一張證件照片（護照/身分證/台胞證）。請判斷這張圖片目前的方向：圖片需要「順時針」旋轉幾度，證件上的文字才會正向朝上、可正常閱讀？

只回傳一個合法的 JSON 物件，不要有任何說明文字。rotation 只能是 0、90、180、270 其中之一（0 表示已經是正的）。

回傳範例：
{"rotation": 90}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://travel-alliance-production-1063.up.railway.app",
        "X-Title": "Travel Alliance Orientation",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl } },
              { type: "text", text: prompt },
            ],
          },
        ],
        max_tokens: 64,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenRouter API error:", err);
      return NextResponse.json({ error: "OpenRouter API error: " + response.status }, { status: 500 });
    }

    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON in orientation response:", text);
      return NextResponse.json({ error: "Could not parse orientation result" }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);
    const rotation = [0, 90, 180, 270].includes(result.rotation) ? result.rotation : 0;
    return NextResponse.json({ rotation });
  } catch (e) {
    console.error("Orientation route error:", e);
    return NextResponse.json({ error: "Orientation detection failed" }, { status: 500 });
  }
}
