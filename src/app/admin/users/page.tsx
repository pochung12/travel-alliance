"use client";
import { useEffect, useState } from "react";
import { supabase, Profile, UserRole } from "@/lib/supabase";
import { UserCog, ShieldCheck, Users, User, Loader2 } from "lucide-react";

const ROLE_LABEL: Record<UserRole, { label: string; color: string; icon: React.ElementType }> = {
  admin:    { label: "超級管理員", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", icon: ShieldCheck },
  staff:    { label: "員工",       color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",         icon: UserCog },
  customer: { label: "顧客會員",   color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",        icon: User },
};

export default function UsersPage() {
  const [profiles,    setProfiles]    = useState<Profile[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState<string | null>(null);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const [{ data: prof }, { data: all }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", session.user.id).single(),
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    ]);

    setCurrentUser(prof);
    setProfiles(all || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRoleChange = async (userId: string, role: UserRole) => {
    setSaving(userId);
    await supabase.from("profiles").update({ role }).eq("id", userId);
    setSaving(null);
    load();
  };

  if (loading) return (
    <div className="flex justify-center py-24">
      <div className="w-6 h-6 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (currentUser?.role !== "admin") return (
    <div className="p-6">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-5 py-8 text-center text-sm text-red-600 dark:text-red-400">
        ⛔ 此頁面僅限超級管理員存取
      </div>
    </div>
  );

  const adminCount    = profiles.filter(p => p.role === "admin").length;
  const staffCount    = profiles.filter(p => p.role === "staff").length;
  const customerCount = profiles.filter(p => p.role === "customer").length;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <UserCog className="w-6 h-6 text-violet-600" /> 用戶管理
        </h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "超級管理員", count: adminCount,    icon: ShieldCheck, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/30" },
          { label: "員工",       count: staffCount,    icon: UserCog,     color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-900/30" },
          { label: "顧客會員",   count: customerCount, icon: Users,       color: "text-slate-600 dark:text-slate-400",   bg: "bg-slate-50 dark:bg-slate-700/50" },
        ].map(({ label, count, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${bg}`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{count}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">姓名</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">角色</th>
              <th className="text-left px-4 py-3">加入時間</th>
              <th className="text-center px-4 py-3">變更角色</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
            {profiles.map(p => {
              const roleInfo = ROLE_LABEL[p.role];
              const RoleIcon = roleInfo.icon;
              const isSelf = p.id === currentUser?.id;
              const isSaving = saving === p.id;

              return (
                <tr key={p.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors ${isSelf ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                    {p.name || "—"}
                    {isSelf && <span className="ml-2 text-xs text-blue-500 dark:text-blue-400">（我）</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${roleInfo.color}`}>
                      <RoleIcon className="w-3.5 h-3.5" />
                      {roleInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
                    {new Date(p.created_at).toLocaleDateString("zh-TW")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isSelf ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                        <select
                          value={p.role}
                          disabled={isSaving}
                          onChange={e => handleRoleChange(p.id, e.target.value as UserRole)}
                          className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50"
                        >
                          <option value="customer">顧客會員</option>
                          <option value="staff">員工</option>
                          <option value="admin">超級管理員</option>
                        </select>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {profiles.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">尚無用戶</div>
        )}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        變更角色後立即生效。被降為顧客會員的用戶下次登入將無法進入管理後台。
      </p>
    </div>
  );
}
