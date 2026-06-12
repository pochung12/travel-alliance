import { NextRequest, NextResponse } from "next/server";
import { pushTravelLead } from "@/lib/autowinBridge";

/**
 * POST /api/bridge/lead
 * 前台事件（哩程刊登/媒合意願）→ 轉發到 autowin-os travel 租戶 CRM。
 * secret 只存在 server-side env，前端不經手。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      kind?: "mileage_listing" | "mileage_inquiry";
      name?: string;
      contact?: string;       // 電話或 LINE ID
      airline?: string;
      miles?: number;
      listing_type?: string;  // sell | buy
      message?: string;
    };

    const name = (body.name || "").trim();
    const contact = (body.contact || "").trim();
    if (!name || !contact) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // contact 可能是電話或 LINE ID：像電話就放 phone，否則塞 custom_fields
    const isPhone = /^[\d+\-\s()]{8,}$/.test(contact);
    const isEmail = contact.includes("@");

    const kind = body.kind === "mileage_listing" ? "travel_mileage_listing" : "travel_mileage_inquiry";
    const detail = body.kind === "mileage_listing"
      ? `哩程刊登（${body.listing_type === "buy" ? "收購" : "出售"}）${body.airline || ""} ${body.miles ? `${body.miles.toLocaleString()}哩` : ""}`
      : `哩程媒合意願 ${body.airline || ""}${body.message ? `：${body.message.slice(0, 80)}` : ""}`;

    await pushTravelLead({
      name,
      phone: isPhone ? contact : "",
      email: isEmail ? contact : "",
      source: kind,
      source_details: detail.trim(),
      tags: ["哩程交易", body.airline || ""].filter(Boolean),
      interests: ["哩程", "機票"],
      custom_fields: {
        contact_raw: contact,
        airline: body.airline || "",
        miles: body.miles || 0,
        listing_type: body.listing_type || "",
        message: (body.message || "").slice(0, 300),
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
