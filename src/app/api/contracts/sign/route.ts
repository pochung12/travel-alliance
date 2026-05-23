import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { token, party, signer_name, signature_image, zone_responses } = await req.json();

    if (!token) return NextResponse.json({ error: "缺少 token" }, { status: 400 });

    // 查找合約（支援甲方 / 乙方 token）
    const { data: contract, error: findErr } = await supabase
      .from("contracts")
      .select("id, status, sign_token, sign_token_a, signed_at_a")
      .or(`sign_token.eq.${token},sign_token_a.eq.${token}`)
      .single();

    if (findErr || !contract) {
      return NextResponse.json({ error: "找不到此合約" }, { status: 404 });
    }

    // 判斷是甲方還是乙方
    const isPartyA = contract.sign_token_a === token;

    if (isPartyA) {
      // 甲方：更新 signed_at_a / signer_name_a / zone_responses_a
      // （不改 status，乙方簽完才算完成）
      if (contract.signed_at_a) {
        return NextResponse.json({ error: "甲方已完成簽署" }, { status: 409 });
      }
      const { error: updateErr } = await supabase
        .from("contracts")
        .update({
          signed_at_a:      new Date().toISOString(),
          signer_name_a:    (signer_name || "").trim(),
          ...(zone_responses ? { zone_responses_a: zone_responses } : {}),
        })
        .eq("id", contract.id);
      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
    } else {
      // 乙方：原有行為，簽完即 status = "signed"
      if (contract.status === "signed") {
        return NextResponse.json({ error: "此合約已完成簽署" }, { status: 409 });
      }
      const { error: updateErr } = await supabase
        .from("contracts")
        .update({
          status:          "signed",
          signed_at:       new Date().toISOString(),
          signature_image: signature_image,
          signer_name:     (signer_name || "").trim(),
          ...(zone_responses ? { zone_responses } : {}),
        })
        .eq("id", contract.id);
      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, party: isPartyA ? "a" : "b" });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
