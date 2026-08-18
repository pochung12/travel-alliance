-- CRM / Query Performance 優化與診斷
-- Supabase SQL Editor 執行一次。所有索引皆使用 IF NOT EXISTS，可安全重跑。

-- 1) CRM 常用排序與精準查找索引
CREATE INDEX IF NOT EXISTS idx_customers_created_at_desc
  ON customers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_passport
  ON customers (passport) WHERE passport <> '';
CREATE INDEX IF NOT EXISTS idx_customers_taibao_number
  ON customers (taibao_number) WHERE taibao_number <> '';
CREATE INDEX IF NOT EXISTS idx_customers_id_number
  ON customers (id_number) WHERE id_number <> '';
CREATE INDEX IF NOT EXISTS idx_customers_phone
  ON customers (phone) WHERE phone <> '';
CREATE INDEX IF NOT EXISTS idx_customers_name_birthday
  ON customers (name, birthday);

-- OCR／掃描建檔會用 ilike 尋找相似姓名；trigram 避免資料量增長後逐列掃描。
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin (name extensions.gin_trgm_ops);

-- 2) 標籤關聯查詢與刪除
CREATE INDEX IF NOT EXISTS idx_customer_labels_customer_id
  ON customer_labels (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_labels_label_id
  ON customer_labels (label_id);
CREATE INDEX IF NOT EXISTS idx_customer_labels_customer_label
  ON customer_labels (customer_id, label_id);

-- 3) 參團查詢（原 schema 已有單欄索引，補常用複合條件）
CREATE INDEX IF NOT EXISTS idx_customer_tours_customer_status
  ON customer_tours (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_tours_tour_status
  ON customer_tours (tour_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_tours_customer_tour
  ON customer_tours (customer_id, tour_id);

-- 4) 更新統計資訊，讓 planner 使用新索引
ANALYZE customers;
ANALYZE customer_labels;
ANALYZE customer_tours;
ANALYZE crm_labels;
ANALYZE customer_document_images;

-- 5) 慢 SQL 統計。結果依「總耗時」排序，用來定位長期 I/O 消耗。
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;

SELECT
  queryid,
  calls,
  ROUND(total_exec_time::numeric, 1) AS total_ms,
  ROUND(mean_exec_time::numeric, 1) AS avg_ms,
  rows,
  shared_blks_read,
  shared_blks_hit,
  temp_blks_written,
  LEFT(REGEXP_REPLACE(query, '\\s+', ' ', 'g'), 500) AS query
FROM extensions.pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND query NOT ILIKE '%pg_stat_statements%'
ORDER BY total_exec_time DESC
LIMIT 30;

-- 6) 現在仍在執行或等待鎖的查詢。正常情況應只有本次診斷查詢。
SELECT
  pid,
  usename,
  state,
  wait_event_type,
  wait_event,
  NOW() - query_start AS running_for,
  LEFT(REGEXP_REPLACE(query, '\\s+', ' ', 'g'), 500) AS query
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND state <> 'idle'
ORDER BY query_start;

-- 7) 未被授予的鎖；有結果代表查詢正在互相阻塞。
SELECT
  blocked.pid AS blocked_pid,
  NOW() - blocked.query_start AS blocked_for,
  LEFT(blocked.query, 300) AS blocked_query,
  blocker.pid AS blocker_pid,
  NOW() - blocker.query_start AS blocker_for,
  LEFT(blocker.query, 300) AS blocker_query
FROM pg_stat_activity blocked
JOIN pg_locks blocked_lock ON blocked_lock.pid = blocked.pid AND NOT blocked_lock.granted
JOIN pg_locks blocker_lock
  ON blocker_lock.locktype = blocked_lock.locktype
 AND blocker_lock.database IS NOT DISTINCT FROM blocked_lock.database
 AND blocker_lock.relation IS NOT DISTINCT FROM blocked_lock.relation
 AND blocker_lock.page IS NOT DISTINCT FROM blocked_lock.page
 AND blocker_lock.tuple IS NOT DISTINCT FROM blocked_lock.tuple
 AND blocker_lock.virtualxid IS NOT DISTINCT FROM blocked_lock.virtualxid
 AND blocker_lock.transactionid IS NOT DISTINCT FROM blocked_lock.transactionid
 AND blocker_lock.classid IS NOT DISTINCT FROM blocked_lock.classid
 AND blocker_lock.objid IS NOT DISTINCT FROM blocked_lock.objid
 AND blocker_lock.objsubid IS NOT DISTINCT FROM blocked_lock.objsubid
 AND blocker_lock.granted
JOIN pg_stat_activity blocker ON blocker.pid = blocker_lock.pid;
