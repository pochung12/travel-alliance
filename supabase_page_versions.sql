-- ═══════════════════════════════════════════════════════════════
-- V2.11.0：行程網頁多版本（同一團可有多個頁面版本，切換比較）
-- 請在 Supabase SQL Editor 執行（可重複執行）
-- ═══════════════════════════════════════════════════════════════

-- 解除「一團一頁」限制，改為一團可多個版本
ALTER TABLE tour_pages DROP CONSTRAINT IF EXISTS tour_pages_tour_id_key;

-- 版本名稱
ALTER TABLE tour_pages
  ADD COLUMN IF NOT EXISTS version_label TEXT NOT NULL DEFAULT '版本 1';

-- 前台仍以 status='published' 取頁；發布新版本時程式會自動把同團其他版本設為 draft，
-- 確保每團只有一個已發布版本。
