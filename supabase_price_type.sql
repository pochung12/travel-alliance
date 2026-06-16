-- ═══════════════════════════════════════════════════════════════
-- V2.8.2：團費標示（現金價 / 刷卡價）
-- 請在 Supabase SQL Editor 執行（可重複執行）
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS price_type TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS card_surcharge_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_surcharge_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
-- price_type：''=不標示 / 'cash'=現金價 / 'card'=刷卡價
-- card_surcharge_*：以團費為現金價，加成顯示刷卡價（金額優先於百分比，建議 2%）
