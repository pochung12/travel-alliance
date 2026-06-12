/**
 * autowin-os travel 租戶 CRM 橋接（server-side only）
 *
 * 環境變數（Railway）：
 *   AUTOWIN_BRIDGE_URL    例：https://shenglih.vip/api/bridge/travel-lead
 *   AUTOWIN_BRIDGE_SECRET 與 autowin-os 的 TRAVEL_BRIDGE_SECRET 相同
 *
 * 未設定環境變數時靜默跳過（fire-and-forget，不影響主流程）。
 */

export interface BridgeLeadPayload {
  name: string;
  phone?: string;
  email?: string;
  source: 'travel_join' | 'travel_mileage_listing' | 'travel_mileage_inquiry' | string;
  source_details?: string;
  tags?: string[];
  interests?: string[];
  custom_fields?: Record<string, unknown>;
}

export async function pushTravelLead(payload: BridgeLeadPayload): Promise<void> {
  const url = process.env.AUTOWIN_BRIDGE_URL;
  const secret = process.env.AUTOWIN_BRIDGE_SECRET;
  if (!url || !secret) return; // 未設定 → 靜默跳過

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.warn('[autowinBridge] push failed:', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.warn('[autowinBridge] push error:', e);
  }
}
