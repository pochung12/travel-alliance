-- ═══════════════════════════════════════════════════════════════
-- V2.6.0：行程網頁自訂上傳照片（Supabase Storage）
-- 請在 Supabase SQL Editor 執行（可重複執行）
-- ═══════════════════════════════════════════════════════════════

-- 公開 bucket：tour-photos（前台需直接讀取，故 public = true）
INSERT INTO storage.buckets (id, name, public)
VALUES ('tour-photos', 'tour-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- storage.objects 政策（限定本 bucket）
DROP POLICY IF EXISTS "tour_photos_read"   ON storage.objects;
CREATE POLICY "tour_photos_read"   ON storage.objects FOR SELECT
  USING (bucket_id = 'tour-photos');

DROP POLICY IF EXISTS "tour_photos_insert" ON storage.objects;
CREATE POLICY "tour_photos_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tour-photos');

DROP POLICY IF EXISTS "tour_photos_update" ON storage.objects;
CREATE POLICY "tour_photos_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'tour-photos');

DROP POLICY IF EXISTS "tour_photos_delete" ON storage.objects;
CREATE POLICY "tour_photos_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'tour-photos');
