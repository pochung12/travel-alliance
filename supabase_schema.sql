-- =====================================================
-- 旅遊大聯盟 Supabase Schema
-- 在 Supabase Dashboard → SQL Editor 執行此腳本
-- =====================================================

-- 1. 出團資料表
CREATE TABLE tours (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  destination   TEXT NOT NULL DEFAULT '',
  start_date    DATE,
  end_date      DATE,
  pax           INTEGER NOT NULL DEFAULT 0,
  selling_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'planning'
                  CHECK (status IN ('planning','confirmed','ongoing','completed','cancelled')),
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 費用明細表
CREATE TABLE tour_costs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id     UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  unit_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity    NUMERIC(10,2) NOT NULL DEFAULT 1,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 旅客 CRM
CREATE TABLE customers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  phone             TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  id_number         TEXT NOT NULL DEFAULT '',
  passport          TEXT NOT NULL DEFAULT '',
  birthday          DATE,
  gender            TEXT NOT NULL DEFAULT 'other'
                      CHECK (gender IN ('male','female','other')),
  address           TEXT NOT NULL DEFAULT '',
  emergency_contact TEXT NOT NULL DEFAULT '',
  emergency_phone   TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 旅客出團關聯
CREATE TABLE customer_tours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tour_id     UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'registered'
                CHECK (status IN ('registered','confirmed','cancelled')),
  paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id, tour_id)
);

-- 5. 索引
CREATE INDEX idx_tour_costs_tour_id ON tour_costs(tour_id);
CREATE INDEX idx_customer_tours_customer_id ON customer_tours(customer_id);
CREATE INDEX idx_customer_tours_tour_id ON customer_tours(tour_id);
CREATE INDEX idx_tours_status ON tours(status);
CREATE INDEX idx_tours_start_date ON tours(start_date);

-- 6. Row Level Security（先關閉，之後視需求開啟）
ALTER TABLE tours DISABLE ROW LEVEL SECURITY;
ALTER TABLE tour_costs DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tours DISABLE ROW LEVEL SECURITY;
