import { NextRequest, NextResponse } from "next/server";

// 收款截圖辨識：轉帳明細、ATM 交易明細、網銀截圖、LINE Pay / 街口 / 匯款單…
// 一張截圖可能含多筆（例如帳戶交易明細列表），所以固定回傳陣列。

interface ParsedPay {
  payer_name: string | null;      // 匯款人/付款人姓名（截圖上讀到的原文）
  matched_name: string | null;    // 對到的團員中文姓名（AI 由名單挑選）
  amount: number | null;
  payment_date: string | null;    // YYYY-MM-DD
  account_last5: string | null;   // 帳號末五碼
  method: string | null;          // 轉帳/ATM/臨櫃/LINE Pay/現金…
  bank: string | null;            // 銀行名稱
  category: "deposit" | "balance" | "other_in" | null;
  note: string | null;
  confidence: "high" | "medium" | "low" | null;
}

const isYmd = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** 民國年 → 西元年（截圖上常見 115/09/03） */
function normalizeDate(v: unknown): string | null {
  if (isYmd(v)) return v;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/[./]/g, "-");
  const m = /^(\d{2,4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  let y = parseInt(m[1], 10);
  if (y < 200) y += 1911;            // 民國年
  else if (y < 100) y += 2000;
  const pad = (n: string) => n.padStart(2, "0");
  return `${y}-${pad(m[2])}-${pad(m[3])}`;
}

function toAmount(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v) && v > 0) return Math.round(v);
  if (typeof v !== "string") return null;
  const n = Number(v.replace(/[^\d.]/g, ""));
  return isFinite(n) && n > 0 ? Math.round(n) : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const imageBase64: string = body?.imageBase64;
    const names: string[] = Array.isArray(body?.names) ? body.names.slice(0, 300) : [];
    const today: string = normalizeDate(body?.today) || new Date().toISOString().slice(0, 10);

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

    const nameBlock = names.length
      ? `\n\n【本團團員名單】（matched_name 只能從這份名單裡挑，或填 null，絕對不可自創）\n${names.join("、")}`
      : "\n\n（本團尚無團員名單，matched_name 一律填 null）";

    const prompt = `你是旅行社的收款截圖辨識助手。使用者上傳的是「收到客人付款」的證明截圖，可能是：
網路銀行轉帳成功畫面、ATM 交易明細、存摺／帳戶交易明細列表、LINE Pay／街口／悠遊付截圖、匯款單拍照、信用卡簽單。

請把畫面上**每一筆入帳**都抓出來。一張截圖可能只有一筆，也可能是一整頁交易列表（多筆）。
只回傳一個合法的 JSON 物件，不要有任何說明文字、不要 markdown 圍籬。

格式：
{"records":[ {…}, {…} ]}

每一筆的欄位（讀不到就填 null，不要猜、不要編）：
- payer_name：截圖上顯示的付款人姓名原文。欄位標籤可能寫成
  「轉出人」「匯款人」「付款人」「轉出戶名」「來源帳戶名稱」「付款方」「戶名」「From」「付款人姓名」等，
  只要有其中任何一個，後面接的人名就是 payer_name。若只顯示部分（例如「王＊明」）就照抄。
- matched_name：把 payer_name 對應到下面團員名單中的某一位，回傳該團員的完整中文姓名。
  對應規則：完全相同 → 直接對應；有遮罩（王＊明）→ 只有名單中「唯一一位」符合才對應，兩位以上符合就填 null；
  只有姓氏或完全讀不到姓名 → 填 null。**寧可 null 也不要對錯人。**
- amount：金額，只填阿拉伯數字（不要千分位、不要 NT$）。轉帳金額優先於餘額；
  看到「餘額」「結餘」「可用餘額」那個數字**不是**金額，不要填。
- payment_date：交易日期，格式 YYYY-MM-DD。畫面若是民國年（例如 115/09/03）請換算成西元。
  只有時間沒有日期時填 null（不要用今天代替）。今天是 ${today}，可用來判斷年份但不要當成預設值。
- account_last5：轉出或轉入帳號的末五碼（只留數字）。
- bank：銀行或支付工具名稱（例如「玉山銀行」「國泰世華」「LINE Pay」）。
  **畫面最上方的標題列／頁首／App 名稱裡的銀行名稱也算**，不要因為它不在欄位裡就填 null。
- method：付款方式，用「轉帳」「ATM」「臨櫃」「信用卡」「行動支付」「現金」其中之一。
- category：這筆屬於 "deposit"（訂金）／"balance"（尾款）／"other_in"（其他收入）。
  判斷依據是**畫面上出現的文字**：備註／附言／摘要／交易說明裡若含「訂金」「頭款」「訂」→ "deposit"；
  含「尾款」「餘款」「補款」「全額」「全款」→ "balance"。畫面上沒有這類字眼就填 null，不要猜。
- note：**備註／附言／摘要／交易說明欄的文字一定要原文照抄放進來**，再加上交易序號等其他有用資訊。
  真的什麼都沒有才填 null。
- confidence："high"＝金額與日期都很清楚；"medium"＝有一項模糊；"low"＝畫質差或欄位大多讀不到。

注意事項：
- 這是「收到的款項」，如果截圖明顯是**支出**（例如付給航空公司、飯店），仍照實抓出來，
  但在 note 註明「疑似支出」。
- 同一張截圖出現多筆交易時，逐筆列出，不要合併。
- 完全讀不到任何交易時回傳 {"records":[]}。${nameBlock}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://1trip.com.tw",
        "X-Title": "Travel Alliance Payment OCR",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: prompt },
          ],
        }],
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenRouter API error:", err);
      return NextResponse.json({ error: "辨識服務回應 " + response.status }, { status: 500 });
    }

    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON in payment OCR response:", text);
      return NextResponse.json({ error: "辨識結果無法解析" }, { status: 500 });
    }

    const raw = JSON.parse(jsonMatch[0]);
    const list: unknown[] = Array.isArray(raw?.records) ? raw.records
      : Array.isArray(raw) ? raw
      : [raw];

    const nameSet = new Set(names);
    const records: ParsedPay[] = list.map((item): ParsedPay => {
      const r = (item || {}) as Record<string, unknown>;
      const matched = typeof r.matched_name === "string" && nameSet.has(r.matched_name)
        ? r.matched_name : null;   // AI 自創的名字一律丟掉
      const cat = r.category;
      return {
        payer_name:  typeof r.payer_name === "string" ? r.payer_name.trim() || null : null,
        matched_name: matched,
        amount:      toAmount(r.amount),
        payment_date: normalizeDate(r.payment_date),
        account_last5: typeof r.account_last5 === "string"
          ? (r.account_last5.replace(/\D/g, "").slice(-5) || null) : null,
        method: typeof r.method === "string" ? r.method.trim() || null : null,
        bank:   typeof r.bank === "string"   ? r.bank.trim()   || null : null,
        category: (cat === "deposit" || cat === "balance" || cat === "other_in") ? cat : null,
        note:   typeof r.note === "string" ? r.note.trim() || null : null,
        confidence: r.confidence === "high" || r.confidence === "medium" || r.confidence === "low"
          ? r.confidence : null,
      };
    }).filter(r => r.amount !== null || r.payer_name !== null);

    return NextResponse.json({ records });
  } catch (e) {
    console.error("Payment OCR route error:", e);
    return NextResponse.json({ error: "辨識失敗" }, { status: 500 });
  }
}
