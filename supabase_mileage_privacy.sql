-- ═══════════════════════════════════════════════════════════════
-- V2.4.0 隱私強化：哩程平台聯絡資訊僅後台可見
-- 請在 Supabase SQL Editor 執行
-- ═══════════════════════════════════════════════════════════════

-- 1) 匿名訪客（前台未登入）完全拿不到 contact_info 欄位
--    （Postgres column-level grant：先收回整表 SELECT，再逐欄開放）
REVOKE SELECT ON mileage_listings FROM anon;
GRANT SELECT (id, type, airline, miles, price_per_k, expiry_date,
              route, travel_date, cabin, notes, contact_name,
              status, created_at, updated_at)
  ON mileage_listings TO anon;

-- 2) 媒合意願（買賣雙方聯絡資訊）匿名完全不可讀，僅保留刊登（INSERT）
REVOKE SELECT ON mileage_inquiries FROM anon;

-- 3) RLS：意願資料只有 staff/admin 登入者可讀
DROP POLICY IF EXISTS "mileage_inquiries_select" ON mileage_inquiries;
CREATE POLICY "mileage_inquiries_select" ON mileage_inquiries FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin')));

-- 4) 收緊修改/刪除權限：只有 staff/admin 能更新與刪除（防止匿名亂改）
DROP POLICY IF EXISTS "mileage_listings_update" ON mileage_listings;
CREATE POLICY "mileage_listings_update" ON mileage_listings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin')));

DROP POLICY IF EXISTS "mileage_listings_delete" ON mileage_listings;
CREATE POLICY "mileage_listings_delete" ON mileage_listings FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin')));

DROP POLICY IF EXISTS "mileage_inquiries_update" ON mileage_inquiries;
CREATE POLICY "mileage_inquiries_update" ON mileage_inquiries FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin')));

DROP POLICY IF EXISTS "mileage_inquiries_delete" ON mileage_inquiries;
CREATE POLICY "mileage_inquiries_delete" ON mileage_inquiries FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin')));
