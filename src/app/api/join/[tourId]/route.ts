import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 使用 service role（允許公開寫入，不受 RLS 限制）
function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

// ── GET: 取得行程資訊（供報名表頁面顯示）──────────────────────────────────────
export async function GET(
  _req: Request,
  context: { params: Promise<{ tourId: string }> }
) {
  const { tourId } = await context.params;
  const sb = getAdmin();

  const [{ data: tour, error: tourErr }, { data: itin }] = await Promise.all([
    sb.from("tours")
      .select("id, name, destination, start_date, end_date, pax, notes, status, selling_price")
      .eq("id", tourId)
      .single(),
    sb.from("tour_itinerary")
      .select("doc_url, pdf_name")
      .eq("tour_id", tourId)
      .eq("variant", "customer")
      .limit(1),
  ]);

  if (tourErr || !tour) {
    return NextResponse.json({ error: "行程不存在" }, { status: 404 });
  }

  return NextResponse.json({ tour, itinerary: itin?.[0] || null });
}

// ── POST: 提交報名表 ─────────────────────────────────────────────────────────
export async function POST(
  req: Request,
  context: { params: Promise<{ tourId: string }> }
) {
  const { tourId } = await context.params;
  const sb = getAdmin();

  // 驗證行程存在
  const { data: tour } = await sb.from("tours").select("id").eq("id", tourId).single();
  if (!tour) {
    return NextResponse.json({ error: "行程不存在" }, { status: 404 });
  }

  const body = await req.json();
  const {
    name, name_en, phone, email, id_number, birthday, gender, address,
    passport, passport_expiry, taibao_number, taibao_expiry,
    emergency_contact, emergency_phone, meal_preference, notes,
    id_card_image, passport_image, taibao_image,
    participant_type,
  } = body as Record<string, string>;

  if (!name?.trim()) {
    return NextResponse.json({ error: "請填寫姓名" }, { status: 400 });
  }
  if (!phone?.trim()) {
    return NextResponse.json({ error: "請填寫聯絡電話" }, { status: 400 });
  }

  // 查詢是否已有相同電話的旅客
  const { data: existingCusts } = await sb
    .from("customers")
    .select("id")
    .eq("phone", phone.trim())
    .limit(1);

  let customerId: string;

  if (existingCusts && existingCusts.length > 0) {
    customerId = existingCusts[0].id;
    // 更新既有旅客資料
    await sb.from("customers").update({
      name:              name.trim(),
      name_en:           name_en?.trim()           || "",
      email:             email?.trim()             || "",
      id_number:         id_number?.trim()         || "",
      birthday:          birthday                  || null,
      gender:            gender                    || "other",
      address:           address?.trim()           || "",
      passport:          passport?.trim()          || "",
      passport_expiry:   passport_expiry           || null,
      taibao_number:     taibao_number?.trim()     || "",
      taibao_expiry:     taibao_expiry             || null,
      emergency_contact: emergency_contact?.trim() || "",
      emergency_phone:   emergency_phone?.trim()   || "",
      meal_preference:   meal_preference           || "",
      notes:             notes?.trim()             || "",
      ...(id_card_image  ? { id_card_image }  : {}),
      ...(passport_image ? { passport_image } : {}),
      ...(taibao_image   ? { taibao_image }   : {}),
    }).eq("id", customerId);
  } else {
    // 建立新旅客
    const { data: newCust, error: custErr } = await sb
      .from("customers")
      .insert([{
        name:              name.trim(),
        name_en:           name_en?.trim()           || "",
        phone:             phone.trim(),
        email:             email?.trim()             || "",
        id_number:         id_number?.trim()         || "",
        birthday:          birthday                  || null,
        gender:            gender                    || "other",
        address:           address?.trim()           || "",
        passport:          passport?.trim()          || "",
        passport_expiry:   passport_expiry           || null,
        passport_image:    passport_image            || "",
        taibao_number:     taibao_number?.trim()     || "",
        taibao_expiry:     taibao_expiry             || null,
        taibao_image:      taibao_image              || "",
        id_card_image:     id_card_image             || "",
        emergency_contact: emergency_contact?.trim() || "",
        emergency_phone:   emergency_phone?.trim()   || "",
        meal_preference:   meal_preference           || "",
        notes:             notes?.trim()             || "",
      }])
      .select("id")
      .single();

    if (custErr || !newCust) {
      return NextResponse.json(
        { error: "建立旅客資料失敗：" + custErr?.message },
        { status: 500 }
      );
    }
    customerId = newCust.id;
  }

  // 檢查是否已報名此行程
  const { data: existingEnroll } = await sb
    .from("customer_tours")
    .select("id")
    .eq("customer_id", customerId)
    .eq("tour_id", tourId)
    .limit(1);

  if (existingEnroll && existingEnroll.length > 0) {
    return NextResponse.json({
      success: true,
      message: "您的資料已更新，感謝您！",
      customerId,
      alreadyEnrolled: true,
    });
  }

  // 建立報名記錄
  const { error: enrollErr } = await sb.from("customer_tours").insert([{
    customer_id:      customerId,
    tour_id:          tourId,
    status:           "registered",
    paid_amount:      0,
    deposit_amount:   0,
    balance_amount:   0,
    participant_type: participant_type || "adult",
    notes:            "",
    room_number:      "",
    meal_preference:  meal_preference || "",
  }]);

  if (enrollErr) {
    return NextResponse.json(
      { error: "報名失敗：" + enrollErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, message: "報名成功！", customerId });
}
