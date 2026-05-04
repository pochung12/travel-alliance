"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Map, Users, CheckCircle2, TrendingUp, CalendarDays } from "lucide-react";
import Link from "next/link";

export default function AdminDashboard() {
  const [tours, setTours] = useState([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: tourData }, { count }] = await Promise.all([
        supabase.from("tours").select("*").order("created_at", { ascending: false }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
      ]);
      setTours(tourData || []);
      setCustomerCount(count || 0);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">儀表板</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100"><div className="text-2xl font-bold">{tours.length}</div><div className="text-sm text-slate-500">總出團數</div></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100"><div className="text-2xl font-bold">{customerCount}</div><div className="text-sm text-slate-500">旅客人數</div></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100"><div className="text-2xl font-bold">{tours.filter(t=>t.status==="confirmed"||t.status==="ongoing").length}</div><div className="text-sm text-slate-500">已確認出發</div></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100"><div className="text-2xl font-bold">{tours.filter(t=>t.status==="completed").length}</div><div className="text-sm text-slate-500">已完成</div></div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2"><CalendarDays className="w-4 h-4" /> 近期出發團</h2>
          <Link href="/admin/groups" className="text-sm text-blue-600 hover:underline">查看全部</Link>
        </div>
        <div className="px-5 py-8 text-center text-slate-400 text-sm">請新增出團以查看近期行程</div>
      </div>
    </div>
  );
}
