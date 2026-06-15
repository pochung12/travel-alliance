-- ═══════════════════════════════════════════════════════════════
-- V2.5.2：團費原價（行銷劃線價）
-- 請在 Supabase SQL Editor 執行（可重複執行）
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2) NOT NULL DEFAULT 0;
-- original_price > selling_price 時，前台顯示劃線原價 + 現價 + 折扣標籤
