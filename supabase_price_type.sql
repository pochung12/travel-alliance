-- ═══════════════════════════════════════════════════════════════
-- V2.8.2：團費標示（現金價 / 刷卡價）
-- 請在 Supabase SQL Editor 執行（可重複執行）
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS price_type TEXT NOT NULL DEFAULT '';
-- ''=不標示 / 'cash'=現金價 / 'card'=刷卡價
