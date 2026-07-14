-- ═══════════════════════════════════════════════════════════════
-- V2.13.7：團管理旅客分頁「已訂票」勾選欄位
-- 請在 Supabase Dashboard → SQL Editor 執行
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE customer_tours
  ADD COLUMN IF NOT EXISTS ticket_booked BOOLEAN NOT NULL DEFAULT false;
