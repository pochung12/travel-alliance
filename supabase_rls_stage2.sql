-- ════════════════════════════════════════════════════════════════════════════
-- RLS 第二階段：關閉匿名對「客戶個資／報名資料／後台帳號」的存取
--
-- 前置已完成並驗證：
--   · Railway 已設 SUPABASE_SERVICE_ROLE_KEY（實測 role = service_role）
--   · 金絲雀測試：tour_itinerary 鎖表後，匿名讀 0 筆、/api/join 仍讀得到 2 筆
--     ⇒ 伺服器端 API 確實以 service role 執行，繞過 RLS
--
-- 這六張表前台頁面完全不使用（逐檔查證）：
--   報名寫入走 /api/join（service role）、後台以登入身分存取
--
-- 在 Supabase Dashboard → SQL Editor 執行。
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tours  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_labels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_blog_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_all_customers       ON customers;
DROP POLICY IF EXISTS auth_all_customer_tours  ON customer_tours;
DROP POLICY IF EXISTS auth_all_profiles        ON profiles;
DROP POLICY IF EXISTS auth_all_crm_labels      ON crm_labels;
DROP POLICY IF EXISTS auth_all_customer_labels ON customer_labels;
DROP POLICY IF EXISTS auth_all_tour_blog_links ON tour_blog_links;

CREATE POLICY auth_all_customers       ON customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_customer_tours  ON customer_tours
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_profiles        ON profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_crm_labels      ON crm_labels
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_customer_labels ON customer_labels
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_tour_blog_links ON tour_blog_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
