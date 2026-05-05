# 旅遊大聯盟 — 部署指引

## 步驟 1：建立 Supabase 專案

1. 前往 https://supabase.com → 登入 → **New project**
2. 填寫專案名稱（例：`travel-alliance`），設定資料庫密碼，選擇區域（東亞/新加坡較快）
3. 建立完成後進入 **SQL Editor**，貼上 `supabase_schema.sql` 全部內容，點 **Run**
4. 進入 **Settings → API**，複製：
   - `Project URL` → 這是 `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → 這是 `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 步驟 2：推上 GitHub

```bash
cd travel-alliance
git init
git add .
git commit -m "init: 旅遊大聯盟管理系統"
git remote add origin https://github.com/你的帳號/travel-alliance.git
git push -u origin main
```

---

## 步驟 3：部署到 Railway

1. 前往 https://railway.app → 登入
2. **New Project → Deploy from GitHub repo** → 選 `travel-alliance`
3. 進入 **Variables** 頁籤，新增：
   ```
   NEXT_PUBLIC_SUPABASE_URL   = （步驟1複製的URL）
   NEXT_PUBLIC_SUPABASE_ANON_KEY = （步驟1複製的Key）
   PORT = 3000
   ```
4. Railway 會自動偵測 Next.js 並開始 build & deploy

---

## 步驟 4：自訂網域（可選）

Railway 會自動給一個 `.up.railway.app` 的網址。
若要用自己的網域，在 **Settings → Networking → Custom Domain** 設定即可。

---

## 本地開發

```bash
cp .env.example .env.local
# 填入 Supabase 的 URL 和 KEY
npm install
npm run dev
```
