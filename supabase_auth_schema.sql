-- =====================================================
-- 旅遊大聯盟 — 會員系統 Schema
-- 在 Supabase Dashboard → SQL Editor 執行此腳本
-- =====================================================

-- 1. 會員資料表（對應 auth.users）
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL DEFAULT '',
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'customer'
                CHECK (role IN ('customer', 'staff', 'admin')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 新用戶自動建立 profile（trigger）
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 3. 關閉 RLS（與其他資料表一致，內部工具）
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 4. 索引
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- 5. 第一個超級管理員：執行後請手動設定 role
-- UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
