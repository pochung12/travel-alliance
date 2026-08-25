-- 第一階段回復（萬一後台哪裡壞掉，貼這段可立即還原成執行前的狀態）
ALTER TABLE tour_costs         DISABLE ROW LEVEL SECURITY;
ALTER TABLE tour_payments      DISABLE ROW LEVEL SECURITY;
ALTER TABLE tour_cost_versions DISABLE ROW LEVEL SECURITY;
ALTER TABLE tour_images        DISABLE ROW LEVEL SECURITY;
