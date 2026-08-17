-- CRM 證件照片歷史：合併重複旅客時保留所有不同圖片
CREATE TABLE IF NOT EXISTS customer_document_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('passport','taibao','id_card')),
  image_data TEXT NOT NULL,
  image_hash TEXT NOT NULL,
  document_number TEXT NOT NULL DEFAULT '',
  expiry DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, document_type, image_hash)
);

CREATE INDEX IF NOT EXISTS idx_customer_document_images_customer
  ON customer_document_images(customer_id, document_type, created_at DESC);

-- 護照／台胞證照片屬敏感個資：禁止 anon，只允許已登入後台使用者讀寫。
REVOKE ALL ON TABLE customer_document_images FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE customer_document_images TO authenticated;

ALTER TABLE customer_document_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users manage customer document images"
  ON customer_document_images;
CREATE POLICY "Authenticated users manage customer document images"
  ON customer_document_images
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
