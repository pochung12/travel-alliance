import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, imageBase64 } = await req.json();
    if (!text && !imageBase64) {
      return NextResponse.json({ error: "Missing text or imageBase64" }, { status: 400 });
    }
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });

    const systemPrompt = `你是航空機票/訂位確認單解析系統。從提供的機票文字或圖片中，提取所有航班資訊。

回傳 JSON 陣列，每筆代表一個航段（flight segment）。欄位如下（無法辨識填空字串 ""）：
- passenger_name: 旅客姓名（多人用頓號分隔，如 "CHANG/POCHUNG, WANG/XIAOMIN"）
- pnr: PNR 訂位代號（通常6碼英數字，如 "ABCDEF"）
- ticket_number: 票號（13位數字或含航空公司代碼前綴，如 "297-1234567890"）
- flight_number: 航班號（如 "CI100", "CX101", "BR205"）
- flight_date: 航班日期（YYYY-MM-DD，例如 "2024-12-25"）
- departure_time: 出發時間（HH:MM 24小時制，如 "10:30"）
- arrival_time: 到達時間（HH:MM 24小時制，如 "14:45"）
- departure_airport: 出發機場（IATA代碼優先，如 "TPE"，或全名）
- departure_terminal: 出發航廈（如 "T2", "第二航廈"，無則空字串）
- arrival_airport: 到達機場（IATA代碼優先，如 "HKG"）
- arrival_terminal: 到達航廈（無則空字串）

只回傳 JSON 陣列，不要有任何說明文字或 markdown 格式。
若有多個航段（去程/回程/轉機），每個航段獨立列出。
範例：
[{"passenger_name":"CHANG/POCHUNG MR","pnr":"ABCDEF","ticket_number":"297-1234567890","flight_number":"CI100","flight_date":"2024-12-25","departure_time":"10:30","arrival_time":"12:45","departure_airport":"TPE","departure_terminal":"T2","arrival_airport":"HKG","arrival_terminal":"T1"},{"passenger_name":"CHANG/POCHUNG MR","pnr":"ABCDEF","ticket_number":"297-1234567890","flight_number":"CI101","flight_date":"2025-01-02","departure_time":"14:00","arrival_time":"16:30","departure_airport":"HKG","departure_terminal":"T1","arrival_airport":"TPE","arrival_terminal":"T2"}]`;

    let messages: object[];
    if (imageBase64) {
      const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
      messages = [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: systemPrompt },
        ],
      }];
    } else {
      messages = [{
        role: "user",
        content: `${systemPrompt}\n\n以下是機票/訂位確認資訊：\n\n${text}`,
      }];
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://travel-alliance-production-1063.up.railway.app",
        "X-Title": "Travel Alliance Flight OCR",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenRouter API error:", err);
      return NextResponse.json({ error: "API error: " + response.status }, { status: 500 });
    }

    const data = await response.json();
    const raw: string = data.choices?.[0]?.message?.content || "";

    // Extract JSON array from response
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("No JSON array found in flight OCR response:", raw);
      return NextResponse.json({ error: "Could not parse flight data", raw }, { status: 500 });
    }
    const flights = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ flights: Array.isArray(flights) ? flights : [flights] });
  } catch (e) {
    console.error("Flight OCR route error:", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
