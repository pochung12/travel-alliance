-- 單房差欄位（V2.19.1）
-- 在 Supabase SQL Editor 執行一次即可。
ALTER TABLE tours ADD COLUMN IF NOT EXISTS single_supplement NUMERIC(10,2) NOT NULL DEFAULT 0;
