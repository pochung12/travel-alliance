-- ═══════════════════════════════════════════════════════════════
-- V2.1.0：AI 行程網頁（tour_pages）
-- 請在 Supabase SQL Editor 執行
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tour_pages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id      uuid NOT NULL UNIQUE REFERENCES tours(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'draft',   -- draft | published
  category     text NOT NULL DEFAULT 'group',   -- group/island/family/japan/china/sea/europe/custom
  hero_posters jsonb NOT NULL DEFAULT '[]',     -- [{image,title,subtitle}]
  content      jsonb NOT NULL DEFAULT '{}',     -- {subtitle,intro,highlights,days,flights,includes,excludes,notes}
  raw_input    text NOT NULL DEFAULT '',        -- 管理員輸入的原始素材
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tour_pages_tour_id ON tour_pages(tour_id);
CREATE INDEX IF NOT EXISTS idx_tour_pages_status   ON tour_pages(status);

ALTER TABLE tour_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tour_pages_select" ON tour_pages;
CREATE POLICY "tour_pages_select" ON tour_pages FOR SELECT USING (true);

DROP POLICY IF EXISTS "tour_pages_insert" ON tour_pages;
CREATE POLICY "tour_pages_insert" ON tour_pages FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "tour_pages_update" ON tour_pages;
CREATE POLICY "tour_pages_update" ON tour_pages FOR UPDATE USING (true);

DROP POLICY IF EXISTS "tour_pages_delete" ON tour_pages;
CREATE POLICY "tour_pages_delete" ON tour_pages FOR DELETE USING (true);
