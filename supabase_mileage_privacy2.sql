-- ═══════════════════════════════════════════════════════════════
-- V2.4.1 隱私強化（二）：登入會員也看不到聯絡資訊
-- 只有 staff/admin 能透過 mileage_listings_admin view 取得
-- 請在 Supabase SQL Editor 執行（可重複執行）
-- ═══════════════════════════════════════════════════════════════

-- 0) 權限判斷函式（SECURITY DEFINER，不受 profiles RLS 影響）
CREATE OR REPLACE FUNCTION is_staff_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('staff', 'admin')
  );
$$;

-- 1) 一般登入會員（authenticated）收回 contact_info 欄位
REVOKE SELECT ON mileage_listings FROM authenticated;
GRANT SELECT (id, type, airline, miles, price_per_k, expiry_date,
              route, travel_date, cabin, notes, contact_name,
              status, created_at, updated_at)
  ON mileage_listings TO authenticated;

-- 2) 後台專用 view：postgres 擁有（可讀全部欄位），只回傳給 staff/admin
CREATE OR REPLACE VIEW mileage_listings_admin AS
  SELECT l.*
  FROM mileage_listings l
  WHERE is_staff_admin();

REVOKE ALL ON mileage_listings_admin FROM anon;
GRANT SELECT ON mileage_listings_admin TO authenticated;

-- 3) 用函式重建各 RLS policy（避免 profiles RLS 擋住子查詢）
DROP POLICY IF EXISTS "mileage_inquiries_select" ON mileage_inquiries;
CREATE POLICY "mileage_inquiries_select" ON mileage_inquiries FOR SELECT
  USING (is_staff_admin());

DROP POLICY IF EXISTS "mileage_listings_update" ON mileage_listings;
CREATE POLICY "mileage_listings_update" ON mileage_listings FOR UPDATE
  USING (is_staff_admin());

DROP POLICY IF EXISTS "mileage_listings_delete" ON mileage_listings;
CREATE POLICY "mileage_listings_delete" ON mileage_listings FOR DELETE
  USING (is_staff_admin());

DROP POLICY IF EXISTS "mileage_inquiries_update" ON mileage_inquiries;
CREATE POLICY "mileage_inquiries_update" ON mileage_inquiries FOR UPDATE
  USING (is_staff_admin());

DROP POLICY IF EXISTS "mileage_inquiries_delete" ON mileage_inquiries;
CREATE POLICY "mileage_inquiries_delete" ON mileage_inquiries FOR DELETE
  USING (is_staff_admin());
