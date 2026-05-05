import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, docType } = await req.json();

    if (!imageBase64 || !docType) {
      return NextResponse.json({ error: "Missing imageBase64 or docType" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
    }

    // Ensure data URL format for OpenRouter
    const imageUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    const prompt =
      docType === "passport"
        ? `你是一個護照 OCR 系統。請仔細辨識這張護照圖片，擷取以下欄位資訊。
只回傳一個合法的 JSON 物件，不要有任何說明文字。

欄位說明：
- name：中文姓名（例如「王小明」）
- nameEn：英文/拼音全名（例如「WANG XIAO MING」）
- passport：護照號碼（英文字母+數字，例如「A12345678」）
- birthday：生日，格式 YYYY-MM-DD
- gender：性別，只能是 "male" 或 "female"
- passportExpiry：護照效期，格式 YYYY-MM-DD

若某欄位無法辨識請填 null。

回傳格式範例：
{
  "name": "王小明",
  "nameEn": "WANG XIAO MING",
  "passport": "A12345678",
  "birthday": "1985-03-15",
  "gender": "male",
  "passportExpiry": "2030-06-20"
}`
      : docType === "idCard"
        ? `你是一個台灣國民身分證 OCR 系統。請仔細辨識這張中華民國國民身分證圖片，擷取以下欄位資訊。
只回傳一個合法的 JSON 物件，不要有任何說明文字。

欄位說明：
- name：中文姓名（例如「王小明」）
- idNumber：身分證字號（1個英文字母+9個數字，例如「A123456789」）
- birthday：生日，格式 YYYY-MM-DD（民國年請換算為西元年，例如民國74年=1985年）
- gender：性別，只能是 "male" 或 "female"

若某欄位無法辨識請填 null。

回傳格式範例：
{
  "name": "王小明",
  "idNumber": "A123456789",
  "birthday": "1985-03-15",
  "gender": "male"
}`
        : `你是一個台胞證 OCR 系統。請仔細辨識這張台灣居民來往大陸通行證（台胞證/回鄉證）圖片，擷取以下欄位資訊。
只回傳一個合法的 JSON 物件，不要有任何說明文字。

欄位說明：
- name：中文姓名（例如「王小明」）
- nameEn：英文/拼音全名（若有的話）
- taibaoNumber：台胞證號碼（8位數字或英數混合）
- birthday：生日，格式 YYYY-MM-DD
- gender：性別，只能是 "male" 或 "female"
- taibaoExpiry：台胞證效期，格式 YYYY-MM-DD

若某欄位無法辨識請填 null。

回傳格式範例：
{
  "name": "王小明",
  "nameEn": "WANG XIAO MING",
  "taibaoNumber": "12345678",
  "birthday": "1985-03-15",
  "gender": "male",
  "taibaoExpiry": "2028-09-01"
}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://travel-alliance-production-1063.up.railway.app",
        "X-Title": "Travel Alliance OCR",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenRouter API error:", err);
      return NextResponse.json({ error: "OpenRouter API error: " + response.status }, { status: 500 });
    }

    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in OCR response:", text);
      return NextResponse.json({ error: "Could not parse OCR result" }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (e) {
    console.error("OCR route error:", e);
    return NextResponse.json({ error: "OCR processing failed" }, { status: 500 });
  }
}
