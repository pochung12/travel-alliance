"use client";
import { useEffect, useState } from "react";
import { supabase, Tour } from "@/lib/supabase";
import { Map, Users, CheckCircle2, TrendingUp, CalendarDays } from "lucide-react";
import Link from "next/link";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  planning:  { label: "規劃中",  color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  confirmed: { label: "已確認",  color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  ongoing:   { label: "進行中",  color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  completed: { label: "已完成",  color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
  cancelled: { label: "已取消",  color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

export default function AdminDashboard() {
  const [tours, setTours] = useState<Tour[]>([]);
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

  const confirmed = tours.filter(t => t.status === "confirmed").length;
  const ongoing   = tours.filter(t => t.status === "ongoing").length;
  const completed = tours.filter(t => t.status === "completed").length;
  const upcoming  = tours
    .filter(t => ["planning","confirmed"].includes(t.status) && t.start_date)
    .sort((a,b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 5);

  const stats = [
    { label: "總出團數",   value: tours.length,     icon: Map,          color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-900/30" },
    { label: "旅客人數",   value: customerCount,    icon: Users,        color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/30" },
    { label: "已確認出發", value: confirmed+ongoing, icon: CheckCircle2, color: "text-green-600",  bg: "bg-green-50 dark:bg-green-900/30" },
    { label: "已完成",     value: completed,         icon: TrendingUp,   color: "text-slate-600 dark:text-slate-400",  bg: "bg-slate-50 dark:bg-slate-700/50" },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">📊 儀表板</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Upcoming tours */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <CalendarDays className="w-4 h-4" /> 近期出發團
          </h2>
          <Link href="/admin/groups" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            查看全部 →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">尚無近期出發團</div>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
            {upcoming.map(tour => {
              const s = STATUS_LABEL[tour.status];
              return (
                <Link
                  key={tour.id}
                  href={`/admin/groups/${tour.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-200 text-sm">{tour.name}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">
                      {tour.destination} ・ {tour.start_date} ～ {tour.end_date} ・ {tour.pax} 人
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.color}`}>
                    {s.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
