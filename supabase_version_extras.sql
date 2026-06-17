-- ═══════════════════════════════════════════════════════════════
-- V2.9.0：報價版本參考圖片 + 飯店比較表
-- 請在 Supabase SQL Editor 執行（可重複執行）
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE tour_cost_versions
  ADD COLUMN IF NOT EXISTS reference_images JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS hotels JSONB NOT NULL DEFAULT '[]';
-- reference_images: string[]（Storage 公開 URL）
-- hotels: [{name, nights, stars, trip_url, ctrip_url, note}]
