-- ═══════════════════════════════════════════════════════════════
-- V2.4.1 隱私強化（二）：登入會員也看不到聯絡資訊
-- 只有 staff/admin 能透過 mileage_listings_admin view 取得
-- 請在 Supabase SQL Editor 執行
-- ═══════════════════════════════════════════════════════════════

-- 1) 一般登入會員（authenticated）也收回 contact_info 欄位
REVOKE SELECT ON mileage_listings FROM authenticated;
GRANT SELECT (id, type, airline, miles, price_per_k, expiry_date,
              route, travel_date, cabin, notes, contact_name,
              status, created_at, updated_at)
  ON mileage_listings TO authenticated;

-- 2) 後台專用 view：由 postgres 擁有（可讀全部欄位），
--    但 WHERE 條件限定只有 staff/admin 登入者才回傳資料
CREATE OR REPLACE VIEW mileage_listings_admin AS
  SELECT l.*
  FROM mileage_listings l
  WHERE EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('staff', 'admin')
  );

REVOKE ALL ON mileage_listings_admin FROM anon;
GRANT SELECT ON mileage_listings_admin TO authenticated;
