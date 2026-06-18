-- ═══════════════════════════════════════════════════════════════
-- V2.13.3：費用試算保留人民幣參考金額
-- 請在 Supabase SQL Editor 執行（可重複執行）
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE tour_costs
  ADD COLUMN IF NOT EXISTS cny NUMERIC(12,2) NOT NULL DEFAULT 0;
-- cny：人民幣參考金額（僅供參考，不計入總成本；總成本只算新台幣 unit_price × 人數）
