-- ═══════════════════════════════════════════════════════════════
-- V2.4.0：哩程交易媒合平台
-- 請在 Supabase SQL Editor 執行
-- ═══════════════════════════════════════════════════════════════

-- 刊登（賣哩程 / 買需求）
CREATE TABLE IF NOT EXISTS mileage_listings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL DEFAULT 'sell',     -- sell=出售哩程 | buy=收購/換票需求
  airline      text NOT NULL DEFAULT 'other',    -- 航空哩程計畫 key
  miles        integer NOT NULL DEFAULT 0,       -- 哩數
  price_per_k  numeric(10,2) NOT NULL DEFAULT 0, -- 每 1,000 哩開價 (NT$)
  expiry_date  date,                             -- 哩程效期（賣方）
  route        text NOT NULL DEFAULT '',         -- 需求航線（買方，例：台北-東京 來回）
  travel_date  text NOT NULL DEFAULT '',         -- 期望出發期間（買方）
  cabin        text NOT NULL DEFAULT '',         -- 艙等（買方）economy/premium/business/first
  notes        text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  contact_info text NOT NULL DEFAULT '',         -- 電話 / LINE ID（僅後台可見）
  status       text NOT NULL DEFAULT 'pending',  -- pending=待審核 | open=上架中 | matched=已媒合 | closed=已關閉
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mileage_listings_status  ON mileage_listings(status);
CREATE INDEX IF NOT EXISTS idx_mileage_listings_type    ON mileage_listings(type);
CREATE INDEX IF NOT EXISTS idx_mileage_listings_airline ON mileage_listings(airline);

-- 媒合意願（對某刊登有興趣）
CREATE TABLE IF NOT EXISTS mileage_inquiries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   uuid NOT NULL REFERENCES mileage_listings(id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT '',
  contact_info text NOT NULL DEFAULT '',
  message      text NOT NULL DEFAULT '',
  handled      boolean NOT NULL DEFAULT false,   -- 已聯繫處理
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mileage_inquiries_listing ON mileage_inquiries(listing_id);

ALTER TABLE mileage_listings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mileage_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mileage_listings_select" ON mileage_listings;
CREATE POLICY "mileage_listings_select" ON mileage_listings FOR SELECT USING (true);
DROP POLICY IF EXISTS "mileage_listings_insert" ON mileage_listings;
CREATE POLICY "mileage_listings_insert" ON mileage_listings FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "mileage_listings_update" ON mileage_listings;
CREATE POLICY "mileage_listings_update" ON mileage_listings FOR UPDATE USING (true);
DROP POLICY IF EXISTS "mileage_listings_delete" ON mileage_listings;
CREATE POLICY "mileage_listings_delete" ON mileage_listings FOR DELETE USING (true);

DROP POLICY IF EXISTS "mileage_inquiries_select" ON mileage_inquiries;
CREATE POLICY "mileage_inquiries_select" ON mileage_inquiries FOR SELECT USING (true);
DROP POLICY IF EXISTS "mileage_inquiries_insert" ON mileage_inquiries;
CREATE POLICY "mileage_inquiries_insert" ON mileage_inquiries FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "mileage_inquiries_update" ON mileage_inquiries;
CREATE POLICY "mileage_inquiries_update" ON mileage_inquiries FOR UPDATE USING (true);
DROP POLICY IF EXISTS "mileage_inquiries_delete" ON mileage_inquiries;
CREATE POLICY "mileage_inquiries_delete" ON mileage_inquiries FOR DELETE USING (true);
