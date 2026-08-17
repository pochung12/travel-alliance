-- 證件歷史照片可永久調整順序；數字越小越前面。
ALTER TABLE customer_document_images
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_customer_document_images_display_order
  ON customer_document_images(customer_id, document_type, display_order, created_at DESC);

-- 既有照片依建立時間由新到舊初始化順序。
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY customer_id, document_type
           ORDER BY created_at DESC, id
         ) AS seq
  FROM customer_document_images
)
UPDATE customer_document_images AS target
SET display_order = ranked.seq
FROM ranked
WHERE target.id = ranked.id
  AND target.display_order = 0;

ANALYZE customer_document_images;
