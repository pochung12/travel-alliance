import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { token, signer_name, signature_image, zone_responses } = await req.json();

    if (!token) return NextResponse.json({ error: "缺少 token" }, { status: 400 });

    // 查找合約
    const { data: contract, error: findErr } = await supabase
      .from("contracts")
      .select("id, status")
      .eq("sign_token", token)
      .single();

    if (findErr || !contract) {
      return NextResponse.json({ error: "找不到此合約" }, { status: 404 });
    }
    if (contract.status === "signed") {
      return NextResponse.json({ error: "此合約已完成簽署" }, { status: 409 });
    }

    // 更新簽署資料
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

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
