-- ══════════════════════════════════════════════════════════════
--  旅遊部落格 Blog Posts Table
--  貼到 Supabase SQL Editor 執行
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blog_posts (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title        TEXT        NOT NULL DEFAULT '',
  slug         TEXT        UNIQUE NOT NULL DEFAULT '',
  content      TEXT        NOT NULL DEFAULT '',
  excerpt      TEXT        DEFAULT '',
  cover_image  TEXT        DEFAULT '',
  category     TEXT        DEFAULT 'travel',
  tags         TEXT[]      DEFAULT '{}',
  status       TEXT        DEFAULT 'draft'
               CHECK (status IN ('draft','published','scheduled')),
  author       TEXT        DEFAULT '暖心旅行社',
  ai_generated BOOLEAN     DEFAULT false,
  ai_prompt    TEXT        DEFAULT '',
  featured     BOOLEAN     DEFAULT false,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  view_count   INTEGER     DEFAULT 0,
  reading_time INTEGER     DEFAULT 5,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blog_posts_status_idx      ON blog_posts(status);
CREATE INDEX IF NOT EXISTS blog_posts_slug_idx        ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS blog_posts_published_idx   ON blog_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS blog_posts_category_idx    ON blog_posts(category);
CREATE INDEX IF NOT EXISTS blog_posts_featured_idx    ON blog_posts(featured);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_blog_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_blog_updated_at ON blog_posts;
CREATE TRIGGER trg_blog_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE PROCEDURE update_blog_updated_at();
