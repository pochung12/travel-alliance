-- 同業行程：多份 Word / PDF 檔案備忘
CREATE TABLE IF NOT EXISTS tour_itinerary_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  variant TEXT NOT NULL DEFAULT 'trade' CHECK (variant IN ('customer','trade')),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf','docx','doc')),
  file_size BIGINT NOT NULL DEFAULT 0,
  file_data TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tour_itinerary_attachments_tour
  ON tour_itinerary_attachments(tour_id, variant, created_at DESC);

REVOKE ALL ON TABLE tour_itinerary_attachments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tour_itinerary_attachments TO authenticated;

ALTER TABLE tour_itinerary_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users manage itinerary attachments"
  ON tour_itinerary_attachments;
CREATE POLICY "Authenticated users manage itinerary attachments"
  ON tour_itinerary_attachments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ANALYZE tour_itinerary_attachments;
