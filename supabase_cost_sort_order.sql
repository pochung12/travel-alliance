-- 費用試算列排序（V2.18.0）
-- 在 Supabase SQL Editor 執行一次即可。
-- 未執行前功能仍可用（上下移動當次有效），但排序不會存檔、重新整理會跳回原順序。
ALTER TABLE tour_costs ADD COLUMN IF NOT EXISTS sort_order INTEGER;
