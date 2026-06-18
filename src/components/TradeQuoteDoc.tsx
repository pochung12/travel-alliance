"use client";
import { useEffect, useState } from "react";
import { supabase, Tour, TourPageContent } from "@/lib/supabase";
import { FileText, FileDown, Printer, Loader2, Building2 } from "lucide-react";

interface Props { tour: Tour }
type VersionLite = { id: string; version_label: string; status: string };

function fmt(d: string) {
  return new Date(d).toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}
function dayDate(start: string, day: number) {
  const d = new Date(new Date(start).getTime() + (day - 1) * 86400000);
  return `${d.getMonth() + 1}/${d.getDate()}（${d.toLocaleDateString("zh-TW", { weekday: "short" })}）`;
}
function esc(s: string) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 產生「地接社報價用」乾淨行程 HTML（無任何報價金額）
function buildBodyHtml(tour: Tour, c: TourPageContent): string {
  const days = Math.round((new Date(tour.end_date).getTime() - new Date(tour.start_date).getTime()) / 86400000) + 1;
  const flightRows = (c.flights || []).map(f => `
    <tr>
      <td>${esc(f.date)}</td>
      <td>${esc(f.flight_no)}</td>
      <td>${esc(f.from)}${f.from_terminal ? " " + esc(f.from_terminal) : ""} → ${esc(f.to)}${f.to_terminal ? " " + esc(f.to_terminal) : ""}</td>
      <td>${esc(f.depart)}–${esc(f.arrive)}</td>
    </tr>`).join("");

  const dayRows = (c.days || []).map(d => `
    <tr>
      <td class="c">第${d.day}天<br><span class="sub">${dayDate(tour.start_date, d.day)}</span></td>
      <td>
        <div class="t">${esc(d.title)}</div>
        ${d.spots && d.spots.length ? `<div class="sub">景點：${d.spots.map(esc).join("、")}</div>` : ""}
        ${d.description ? `<div class="desc">${esc(d.description)}</div>` : ""}
      </td>
      <td class="m">${esc(d.meals?.breakfast || "")}</td>
      <td class="m">${esc(d.meals?.lunch || "")}</td>
      <td class="m">${esc(d.meals?.dinner || "")}</td>
      <td class="h">${esc(d.hotel || "")}</td>
    </tr>`).join("");

  // 住宿一覽（每日飯店單獨列出）
  const hotelRows = (c.days || [])
    .filter(d => (d.hotel || "").trim() && d.hotel !== "溫暖的家")
    .map(d => `
      <tr>
        <td class="c">第${d.day}天</td>
        <td class="c">${dayDate(tour.start_date, d.day)}</td>
        <td class="hl">${esc(d.hotel)}</td>
      </tr>`).join("");

  return `
  <div class="doc">
    <h1>${esc(tour.name)}</h1>
    <div class="meta">
      目的地：${esc(tour.destination)}　｜　日期：${fmt(tour.start_date)} ~ ${fmt(tour.end_date)}（${days}天${days - 1}夜）　｜　人數：${tour.pax || "—"} 人
    </div>
    ${flightRows ? `
    <h2>參考航班</h2>
    <table class="tbl">
      <tr><th>日期</th><th>航班</th><th>航段（含航廈）</th><th>時間</th></tr>
      ${flightRows}
    </table>` : ""}
    ${hotelRows ? `
    <h2>住宿一覽（每日飯店）</h2>
    <table class="tbl">
      <tr><th style="width:78px">天數</th><th style="width:120px">日期</th><th>住宿飯店</th></tr>
      ${hotelRows}
    </table>` : ""}
    <h2>每日行程</h2>
    <table class="tbl itin">
      <tr><th style="width:78px">天數</th><th>行程內容</th><th style="width:70px">早餐</th><th style="width:70px">午餐</th><th style="width:70px">晚餐</th><th style="width:150px">住宿（選定）</th></tr>
      ${dayRows}
    </table>
    <p class="note">※ 本行程供地接社報價參考，請依此統一行程內容（含選定飯店、餐食安排）報價，以利各家比較。本文件不含任何報價金額。</p>
  </div>`;
}

const DOC_CSS = `
  * { box-sizing: border-box; }
  body { font-family: "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif; color:#222; }
  .doc { max-width: 920px; margin: 0 auto; padding: 8px; }
  h1 { font-size: 22px; margin: 0 0 6px; text-align:center; }
  h2 { font-size: 15px; margin: 18px 0 6px; padding-bottom:4px; border-bottom:2px solid #b04a3a; color:#b04a3a; }
  .meta { text-align:center; font-size: 12.5px; color:#444; margin-bottom: 6px; }
  table.tbl { width:100%; border-collapse: collapse; font-size: 12px; }
  table.tbl th { background:#f3ece0; border:1px solid #d8cdb8; padding:6px 8px; text-align:left; font-weight:700; }
  table.tbl td { border:1px solid #d8cdb8; padding:6px 8px; vertical-align: top; }
  td.c { text-align:center; white-space:nowrap; font-weight:700; }
  td.m, td.h { font-size: 11.5px; }
  td.hl { font-weight:700; color:#1f3d2f; }
  .t { font-weight:700; margin-bottom:2px; }
  .sub { font-size: 11px; color:#666; }
  .desc { font-size: 11px; color:#444; margin-top:3px; line-height:1.5; }
  .note { font-size: 11px; color:#777; margin-top:14px; line-height:1.6; }
`;

export default function TradeQuoteDoc({ tour }: Props) {
  const [versions, setVersions] = useState<VersionLite[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [content, setContent] = useState<TourPageContent | null>(null);
  const [loading, setLoading] = useState(true);

  const loadList = async () => {
    let res = await supabase.from("tour_pages").select("id,version_label,status").eq("tour_id", tour.id).order("created_at");
    if (res.error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res = await supabase.from("tour_pages").select("id,status").eq("tour_id", tour.id).order("created_at") as any;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = ((res.data || []) as any[]).map((r, i) => ({ id: r.id, status: r.status, version_label: r.version_label || `版本 ${i + 1}` }));
    setVersions(list);
    const pick = list.find(v => v.status === "published") || list[0];
    if (pick) await loadContent(pick.id);
    setLoading(false);
  };
  const loadContent = async (id: string) => {
    setActiveId(id);
    const { data } = await supabase.from("tour_pages").select("content").eq("id", id).single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setContent(((data as any)?.content || null) as TourPageContent | null);
  };
  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, [tour.id]);

  const hasItin = content && (content.days?.length || 0) > 0;

  const downloadWord = () => {
    if (!content) return;
    const body = buildBodyHtml(tour, content);
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>${DOC_CSS}</style></head><body>${body}</body></html>`;
    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${tour.name}-地接社報價行程.doc`;
    a.click();
  };
  const printPdf = () => {
    if (!content) return;
    const body = buildBodyHtml(tour, content);
    const w = window.open("", "_blank");
    if (!w) { alert("請允許彈出視窗以列印/存 PDF"); return; }
    w.document.write(`<html><head><meta charset="utf-8"><title>${esc(tour.name)}-地接社報價行程</title><style>${DOC_CSS}@media print{@page{margin:14mm}}</style></head><body>${body}<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 md:p-5">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-4.5 h-4.5 text-amber-600" />
          <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">地接社報價行程（統一行程・無報價金額）</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
          以「行程網頁」的內容（每日路線、景點、餐食、選定飯店、航班）產生一份<span className="text-amber-600 dark:text-amber-400 font-medium">乾淨、不含任何報價金額</span>的行程，
          下載 Word 或存成 PDF 後給各家地接社報價，大家報同一份行程才好比較。飯店請先在「🌐 行程網頁」分頁的每日行程裡選定。
        </p>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /></div>
        ) : versions.length === 0 || !hasItin ? (
          <p className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 dark:border-slate-600 rounded-lg">
            尚無行程內容。請先到「🌐 行程網頁」分頁生成行程（並選定每天飯店），再回來產生報價行程。
          </p>
        ) : (
          <>
            {/* 版本選擇（多版本）*/}
            {versions.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="text-xs text-slate-400">選擇版本：</span>
                {versions.map(v => (
                  <button key={v.id} onClick={() => loadContent(v.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      v.id === activeId ? "bg-amber-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                    }`}>
                    {v.version_label}{v.status === "published" ? " ●" : ""}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap mb-4">
              <button onClick={downloadWord}
                className="flex items-center gap-1.5 text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
                <FileDown className="w-4 h-4" /> 下載 Word
              </button>
              <button onClick={printPdf}
                className="flex items-center gap-1.5 text-sm px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium transition-colors">
                <Printer className="w-4 h-4" /> 列印 / 存 PDF
              </button>
              <span className="text-[11px] text-slate-400">Word 可再編輯；PDF 走瀏覽器列印（選「另存為 PDF」）</span>
            </div>

            {/* 預覽 */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-600 overflow-auto bg-white">
              <div className="p-4 text-slate-800" dangerouslySetInnerHTML={{ __html: `<style>${DOC_CSS}</style>` + buildBodyHtml(tour, content!) }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
