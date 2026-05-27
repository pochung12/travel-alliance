"use client";
import { useState, useEffect, useCallback } from "react";

const LS_KEY = "ta_cny_twd_rate";

interface RateCache { date: string; rate: number }

export function useExchangeRate() {
  const [rate,       setRate]       = useState<number | null>(null);
  const [rateDate,   setRateDate]   = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 初始載入：先讀 localStorage，再讀 DB（不打外部 API）
  useEffect(() => {
    // 先從 localStorage 快速顯示
    try {
      const cached: RateCache = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (cached?.rate) {
        setRate(cached.rate);
        setRateDate(cached.date ?? null);
      }
    } catch { /* ignore */ }

    // 再從 DB 取最新值（手動更新後會反映）
    fetch("/api/exchange-rate")
      .then(r => r.json())
      .then(data => {
        if (data.rate) {
          setRate(data.rate);
          setRateDate(data.date ?? null);
          localStorage.setItem(LS_KEY, JSON.stringify({ date: data.date, rate: data.rate }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 手動更新：呼叫 POST，從外部 API 抓最新匯率
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/exchange-rate", { method: "POST" });
      const data = await res.json();
      if (data.rate) {
        setRate(data.rate);
        setRateDate(data.date ?? null);
        localStorage.setItem(LS_KEY, JSON.stringify({ date: data.date, rate: data.rate }));
      } else {
        alert(data.error || "更新失敗，請稍後再試");
      }
    } catch {
      alert("網路錯誤，請稍後再試");
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { rate, rateDate, loading, refreshing, refresh };
}
