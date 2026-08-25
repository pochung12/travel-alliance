-- ════════════════════════════════════════════════════════════════════
-- RLS 第一階段：關閉匿名對「成本／收付款」的存取
--
-- 為什麼安全：這四張表只出現在 admin 頁面與 admin 專用元件，
--   前台頁面（tours / join / sign / blog / j / t）完全不碰，
--   也沒有任何 API route 使用 —— 已逐檔查證。
-- 後台不受影響：後台以 Supabase Auth 登入（authenticated 角色），
--   policy 已放行；未登入會被 AdminShell 導回 /login。
--
-- 在 Supabase Dashboard → SQL Editor 貼上執行。
-- ════════════════════════════════════════════════════════════════════

-- ① 開啟 RLS（開啟後：沒有 policy 的角色一律讀不到、寫不進）
ALTER TABLE tour_costs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_cost_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_images        ENABLE ROW LEVEL SECURITY;

-- ② 只放行已登入的後台使用者（anon 沒有 policy ⇒ 全擋）
DROP POLICY IF EXISTS auth_all_tour_costs         ON tour_costs;
DROP POLICY IF EXISTS auth_all_tour_payments      ON tour_payments;
DROP POLICY IF EXISTS auth_all_tour_cost_versions ON tour_cost_versions;
DROP POLICY IF EXISTS auth_all_tour_images        ON tour_images;

CREATE POLICY auth_all_tour_costs         ON tour_costs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_tour_payments      ON tour_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_tour_cost_versions ON tour_cost_versions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_tour_images        ON tour_images
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ③ 確認結果（rowsecurity 應全為 true，每張表各 1 條 policy）
SELECT c.relname AS 資料表,
       c.relrowsecurity AS RLS已開,
       count(p.polname) AS policy數
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname IN ('tour_costs','tour_payments','tour_cost_versions','tour_images')
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;
