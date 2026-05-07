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
      docType === "auto"
        ? `你是一個多功能證件 OCR 系統。請辨識圖片中的證件類型並提取所有可見資訊。
只回傳一個合法的 JSON 物件，不要有任何說明文字。

欄位說明（無法辨識或不適用填 null）：
- docType："passport"（護照）/"idCard"（台灣身分證）/"taibao"（台胞證/回鄉證）
- name：中文姓名
- nameEn：英文/拼音姓名（若有）
- birthday：生日（YYYY-MM-DD，民國年換算西元年，例如民國74年=1985年）
- gender："male" 或 "female"
- passport：護照號碼（護照時填）
- passportExpiry：護照效期（YYYY-MM-DD，護照時填）
- idNumber：身分證字號（身分證時填）
- taibaoNumber：台胞證號碼（台胞證時填）
- taibaoExpiry：台胞證效期（YYYY-MM-DD，台胞證時填）

回傳範例：
{"docType":"passport","name":"王小明","nameEn":"WANG XIAO MING","birthday":"1985-03-15","gender":"male","passport":"A12345678","passportExpiry":"2030-06-20","idNumber":null,"taibaoNumber":null,"taibaoExpiry":null}`
      : docType === "passport"
        ? `你是一個護照 OCR 系統。請仔細辨識這張護照圖片，擷取以下欄位資訊。
只回傳一個合法的 JSON 物件，不要有任何說明文字。

欄位說明：
- name：中文姓名（例如「王小明」）
- nameEn：英文/拼音全名（例如「WANG XIAO MING」）
- passport：護照號碼（英文字母+數字，例如「A12345678」）
- birthday：生日，格式 YYYY-MM-DD
- gender：性別，只能是 "male" 或 "female"
- passportExpiry：護照效期，格式 YYYY-MM-DD
- idNumber：中華民國國民身分證字號（1個英文字母+9個數字，例如「A123456789」）。部分護照的個人資料頁或備註欄會印有身分證字號，若有請填入；若無則填 null。

若某欄位無法辨識請填 null。

回傳格式範例：
{
  "name": "王小明",
  "nameEn": "WANG XIAO MING",
  "passport": "A12345678",
  "birthday": "1985-03-15",
  "gender": "male",
  "passportExpiry": "2030-06-20",
  "idNumber": "A123456789"
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
        model: "google/gemini-2.5-flash",
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
