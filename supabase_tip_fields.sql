-- ═══════════════════════════════════════════════════════════════
-- V2.3.2：司機/導遊/領隊小費欄位
-- 請在 Supabase SQL Editor 執行
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS tip_per_day NUMERIC(10,2) NOT NULL DEFAULT 0,   -- 小費（元/天）
  ADD COLUMN IF NOT EXISTS tip_included BOOLEAN NOT NULL DEFAULT false;    -- 前台標示：true=已含於團費 / false=不含
