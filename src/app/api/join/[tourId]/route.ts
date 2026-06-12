import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { pushTravelLead } from "@/lib/autowinBridge";

// ── Supabase client ───────────────────────────────────────────────────────────
function getAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

// ── 台胞證判斷：目的地含大陸城市/省份/關鍵字才需要 ──────────────────────────
const MAINLAND_KEYWORDS = [
  // 通用詞
  "大陸", "中國大陸", "中国", "內地",
  // 直轄市
  "北京", "上海", "天津", "重慶",
  // 一線城市
  "廣州", "深圳", "成都", "武漢", "西安", "杭州", "南京", "青島",
  "廈門", "大連", "瀋陽", "長春", "哈爾濱", "烏魯木齊",
  // 熱門旅遊城市
  "蘇州", "無錫", "昆明", "三亞", "桂林", "麗江", "九寨溝",
  "張家界", "黃山", "敦煌", "洛陽", "泰山", "峨眉山", "樂山",
  "西雙版納", "香格里拉", "西寧", "拉薩", "烏魯木齊",
  "鄭州", "長沙", "濟南", "南昌", "合肥", "福州", "南寧", "貴陽",
  "蘭州", "太原", "石家莊", "南寧", "銀川", "呼和浩特",
  // 省份/自治區
  "廣東", "浙江", "江蘇", "四川", "湖南", "湖北", "福建", "雲南",
  "貴州", "廣西", "海南", "新疆", "西藏", "內蒙古", "黑龍江",
  "吉林", "遼寧", "河北", "山西", "河南", "山東", "安徽", "江西", "陝西", "甘肅",
  // 轉機/過境
  "轉機大陸", "轉機中國", "經大陸", "過境大陸", "經中國",
];

function checkRequiresTaibao(destination: string): boolean {
  return MAINLAND_KEYWORDS.some(kw => destination.includes(kw));
}

// ── Pexels 景點背景圖 ─────────────────────────────────────────────────────────
async function fetchHeroImage(destination: string): Promise<string> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !destination.trim()) return "";
  try {
    const query = encodeURIComponent(`${destination} travel landmark scenic`);
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${query}&per_page=5&orientation=landscape`,
      { headers: { Authorization: key }, next: { revalidate: 3600 } }
    );
    if (!res.ok) return "";
    const json = await res.json();
    const photos: Array<{ src: { large2x: string; large: string } }> = json.photos || [];
    if (photos.length === 0) return "";
    const pick = photos[Math.floor(Math.random() * Math.min(photos.length, 3))];
    return pick.src.large2x || pick.src.large || "";
  } catch {
    return "";
  }
}

// ── 自動分房 ──────────────────────────────────────────────────────────────────
async function autoAssignRoom(
  sb: SupabaseClient,
  tourId: string,
  customerId: string,
  roommateName: string,
  singleRoom: boolean,
): Promise<void> {
  const noteParts: string[] = [];

  if (singleRoom) {
    noteParts.push("需求：單人房");
  }

  if (roommateName.trim()) {
    type Participant = { id: string; room_number: string; customer: { name: string } | null };
    const { data: others } = await sb
      .from("customer_tours")
      .select("id, room_number, customer:customers!inner(name)")
      .eq("tour_id", tourId)
      .neq("customer_id", customerId) as { data: Participant[] | null };

    const name = roommateName.trim();
    const match = (others || []).find(p => {
      const mName = p.customer?.name || "";
      return mName.includes(name) || name.includes(mName);
    });

    if (match) {
      let roomNum = match.room_number?.trim() || "";
      if (!roomNum) {
        const allNums = (others || [])
          .map(p => parseInt(p.room_number || "0", 10))
          .filter(n => Number.isFinite(n) && n > 0);
        roomNum = String(allNums.length > 0 ? Math.max(...allNums) + 1 : 1);
        await sb.from("customer_tours").update({ room_number: roomNum }).eq("id", match.id);
      }
      await sb.from("customer_tours")
        .update({ room_number: roomNum })
        .eq("customer_id", customerId)
        .eq("tour_id", tourId);
    } else {
      noteParts.push(`同住偏好：${name}`);
    }
  }

  if (noteParts.length > 0) {
    await sb.from("customer_tours")
      .update({ notes: noteParts.join("；") })
      .eq("customer_id", customerId)
      .eq("tour_id", tourId);
  }
}

// ── GET: 行程資訊 + 台胞證判斷 + 背景圖 + 綁定文章 ──────────────────────────
export async function GET(
  _req: Request,
  context: { params: Promise<{ tourId: string }> }
) {
  const { tourId } = await context.params;
  const sb = getAdmin();

  const [{ data: tour, error: tourErr }, { data: itin }, { data: links }] = await Promise.all([
    sb.from("tours")
      .select("id, name, destination, start_date, end_date, pax, notes, status, selling_price")
      .eq("id", tourId)
      .single(),
    sb.from("tour_itinerary")
      .select("doc_url, pdf_name")
      .eq("tour_id", tourId)
      .eq("variant", "customer")
      .limit(1),
    sb.from("tour_blog_links")
      .select("blog_post_id, display_order")
      .eq("tour_id", tourId)
      .order("display_order"),
  ]);

  if (tourErr || !tour) {
    return NextResponse.json({ error: "行程不存在" }, { status: 404 });
  }

  // 取綁定文章詳情
  const linkedIds = (links || []).map((l: { blog_post_id: string }) => l.blog_post_id);
  let blogPosts: unknown[] = [];
  if (linkedIds.length > 0) {
    const { data: posts } = await sb
      .from("blog_posts")
      .select("id, slug, title, excerpt, cover_image, category, published_at")
      .in("id", linkedIds)
      .eq("status", "published");
    // 維持 display_order 排序
    blogPosts = (posts || []).sort(
      (a: { id: string }, b: { id: string }) => linkedIds.indexOf(a.id) - linkedIds.indexOf(b.id)
    );
  }

  const [requiresTaibao, heroImageUrl] = await Promise.all([
    Promise.resolve(checkRequiresTaibao(tour.destination || "")),
    fetchHeroImage(tour.destination || ""),
  ]);

  return NextResponse.json({
    tour,
    itinerary:     itin?.[0] || null,
    requiresTaibao,
    heroImageUrl,
    blogPosts,
  });
}

// ── POST: 提交報名表 ─────────────────────────────────────────────────────────
export async function POST(
  req: Request,
  context: { params: Promise<{ tourId: string }> }
) {
  const { tourId } = await context.params;
  const sb = getAdmin();

  const { data: tour } = await sb.from("tours").select("id,name,destination").eq("id", tourId).single();
  if (!tour) {
    return NextResponse.json({ error: "行程不存在" }, { status: 404 });
  }

  const body = await req.json();
  const {
    name, name_en, phone, email, id_number, birthday, gender, address,
    passport, passport_expiry, taibao_number, taibao_expiry,
    emergency_contact, emergency_phone, meal_preference, notes,
    passport_image, taibao_image,
    participant_type,
    roommate_name,
    single_room,
  } = body as Record<string, string>;

  if (!name?.trim())    return NextResponse.json({ error: "請填寫中文姓名" }, { status: 400 });
  if (!name_en?.trim()) return NextResponse.json({ error: "請填寫英文姓名拼音" }, { status: 400 });
  if (!phone?.trim())   return NextResponse.json({ error: "請填寫聯絡電話" }, { status: 400 });

  // 查詢是否已有相同電話的旅客
  const { data: existingCusts } = await sb
    .from("customers").select("id").eq("phone", phone.trim()).limit(1);

  let customerId: string;

  if (existingCusts && existingCusts.length > 0) {
    customerId = existingCusts[0].id;
    await sb.from("customers").update({
      name:              name.trim(),
      name_en:           name_en.trim(),
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
      ...(passport_image ? { passport_image } : {}),
      ...(taibao_image   ? { taibao_image }   : {}),
    }).eq("id", customerId);
  } else {
    const { data: newCust, error: custErr } = await sb
      .from("customers")
      .insert([{
        name:              name.trim(),
        name_en:           name_en.trim(),
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
        id_card_image:     "",
        emergency_contact: emergency_contact?.trim() || "",
        emergency_phone:   emergency_phone?.trim()   || "",
        meal_preference:   meal_preference           || "",
        notes:             notes?.trim()             || "",
      }])
      .select("id")
      .single();

    if (custErr || !newCust) {
      return NextResponse.json({ error: "建立旅客資料失敗：" + custErr?.message }, { status: 500 });
    }
    customerId = newCust.id;
  }

  // 已報名處理
  const { data: existingEnroll } = await sb
    .from("customer_tours").select("id")
    .eq("customer_id", customerId).eq("tour_id", tourId).limit(1);

  if (existingEnroll && existingEnroll.length > 0) {
    if (roommate_name?.trim() || single_room === "true") {
      await autoAssignRoom(sb, tourId, customerId,
        roommate_name?.trim() || "", single_room === "true");
    }
    return NextResponse.json({
      success: true, message: "您的資料已更新，感謝您！",
      customerId, alreadyEnrolled: true,
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
    return NextResponse.json({ error: "報名失敗：" + enrollErr.message }, { status: 500 });
  }

  if (roommate_name?.trim() || single_room === "true") {
    await autoAssignRoom(sb, tourId, customerId,
      roommate_name?.trim() || "", single_room === "true");
  }

  // ── 橋接：報名事件推入 autowin-os travel 租戶 CRM（不影響主流程）──
  await pushTravelLead({
    name: name.trim(),
    phone: phone.trim(),
    email: email?.trim() || "",
    source: "travel_join",
    source_details: `報名「${tour.name}」`,
    tags: ["行程報名", tour.destination].filter(Boolean),
    interests: ["旅遊", tour.destination].filter(Boolean),
    custom_fields: {
      tour_id: tourId,
      tour_name: tour.name,
      destination: tour.destination,
      participant_type: participant_type || "adult",
    },
  });

  return NextResponse.json({ success: true, message: "報名成功！", customerId });
}
