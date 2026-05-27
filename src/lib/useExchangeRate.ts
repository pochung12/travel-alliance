"use client";
import { useState, useEffect } from "react";

const LS_KEY = "ta_cny_twd_rate";

interface RateCache { date: string; rate: number }

export function useExchangeRate() {
  const [rate,    setRate]    = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);

    // 先查 localStorage（同一天內不重複打 API）
    try {
      const cached: RateCache = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (cached?.date === today && cached?.rate) {
        setRate(cached.rate);
        setLoading(false);
        return;
      }
    } catch { /* ignore */ }

    // 向自己的 API 路由請求（伺服端會查 DB / 外部 API）
    fetch("/api/exchange-rate")
      .then(r => r.json())
      .then(data => {
        if (data.rate) {
          setRate(data.rate);
          localStorage.setItem(LS_KEY, JSON.stringify({ date: today, rate: data.rate }));
        }
      })
      .catch(() => { /* 網路失敗靜默 */ })
      .finally(() => setLoading(false));
  }, []);

  return { rate, loading };
}
