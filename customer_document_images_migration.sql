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

-- 本專案現有 CRM 由前端 authenticated/anon Supabase client 讀寫，權限與 customers 表保持一致。
ALTER TABLE customer_document_images DISABLE ROW LEVEL SECURITY;
