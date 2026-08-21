"use client";
import { useEffect, useState, useRef } from "react";
import {
  supabase, Tour, TourPage, TourPagePoster, TourPageContent, TourPageDay,
  TourPageFlightInfo, TourPageGallerySpot, TOUR_PAGE_CATEGORIES,
} from "@/lib/supabase";
import {
  Sparkles, Globe, Eye, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, EyeOff, ExternalLink, Image as ImageIcon, Pencil, X, Save, Upload, Search,
  Link as LinkIcon,
} from "lucide-react";
import FlightEditor from "@/components/FlightEditor";
import PageListEditor from "@/components/PageListEditor";
import ShareKit from "@/components/ShareKit";
import { Megaphone } from "lucide-react";

interface Props { tour: Tour }

const EMPTY_CONTENT: TourPageContent = {
  subtitle: "", intro: "", highlights: [], days: [],
  flights: [], includes: [], excludes: [], notes: [],
};

// 可選擇保留（不重新生成）的區塊
const KEEP_SECTIONS = [
  { key: "posters",    label: "🖼 行程海報" },
  { key: "intro",      label: "📝 副標語與介紹" },
  { key: "highlights", label: "✨ 行程特色" },
  { key: "days",       label: "📅 每日行程" },
  { key: "gallery",    label: "📷 景點美照" },
  { key: "flights",    label: "✈️ 航班資訊" },
  { key: "fees",       label: "💰 費用包含/不含" },
  { key: "notes",      label: "📌 注意事項" },
] as const;

function getDays(start: string, end: string) {
  const d = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
  return d + 1;
}

function dayImagesOf(d: TourPageDay): string[] {
  if (d.images && d.images.length) return d.images;
  if (d.image) return [d.image];
  return [];
}

// 日期：出發日 + (day-1)
function dayDateOf(start: string, day: number): Date {
  return new Date(new Date(start).getTime() + (day - 1) * 86400000);
}
// 把航班 date 字串正規化為 M/D（支援 2026-09-20 或 9/20 等）
function mdKey(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getMonth() + 1}/${d.getDate()}`;
  const m = s.match(/(\d{1,2})[\/\-月.](\d{1,2})/);
  return m ? `${+m[1]}/${+m[2]}` : "";
}

// 壓縮圖片成 JPEG Blob（上傳前縮圖）
function compressToBlob(file: File, maxPx = 1600, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("compress failed")), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load failed")); };
    img.src = url;
  });
}

// ── 換圖目標描述 ──────────────────────────────────────────────────────────────
type PickerTarget =
  | { kind: "poster"; idx: number; label: string }
  | { kind: "highlight"; idx: number; label: string }
  | { kind: "dayImage"; dayNum: number; slot: number; label: string }
  | { kind: "meal"; dayNum: number; mealKey: "breakfast" | "lunch" | "dinner"; label: string }
  | { kind: "hotel"; dayNum: number; label: string }
  | { kind: "gallery"; spotIdx: number; imgIdx: number; label: string };

// ── 縮圖換圖按鈕 ──────────────────────────────────────────────────────────────
function PhotoSlot({ url, onClick, ratio = "aspect-[4/3]", placeholder }: {
  url?: string; onClick: () => void; ratio?: string; placeholder?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`relative ${ratio} w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 group/slot`}>
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-slate-300 dark:text-slate-500">
          <ImageIcon className="w-4 h-4" />
          <span className="text-[9px]">{placeholder || "無圖"}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover/slot:bg-black/45 transition-colors flex items-center justify-center">
        <span className="opacity-0 group-hover/slot:opacity-100 flex items-center gap-1 text-white text-[10px] font-semibold bg-violet-600 px-2 py-1 rounded-full transition-opacity">
          <RefreshCw className="w-2.5 h-2.5" /> 換圖
        </span>
      </div>
    </button>
  );
}

type VersionLite = { id: string; version_label: string; status: string };

export default function TourPageTab({ tour }: Props) {
  const [page, setPage]         = useState<TourPage | null>(null);
  const [pages, setPages]       = useState<VersionLite[]>([]); // 版本清單
  const [activeId, setActiveId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [rawInput, setRawInput] = useState("");
  const [generating, setGenerating] = useState(false);
  // 從別家行程網址自動抓取
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping]   = useState(false);
  // 行程頁短網址（1trip.com.tw/t/xxxxxx）
  const [shortUrl, setShortUrl] = useState("");
  const [shortCopied, setShortCopied] = useState(false);
  // 上傳行程檔案（PDF / Word）
  const docFileRef = useRef<HTMLInputElement>(null);
  const [docParsing, setDocParsing] = useState(false);
  const [docMsg, setDocMsg] = useState("");
  const [docErr, setDocErr] = useState("");
  const [scrapeErr, setScrapeErr] = useState("");
  const [scrapedImages, setScrapedImages] = useState<string[]>([]);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  // 保留區塊（重新生成時不變動）
  const [keepSet, setKeepSet] = useState<Set<string>>(new Set());
  // 統一換圖／上傳 picker
  const [picker, setPicker]   = useState<PickerTarget | null>(null);
  const [pickerMode, setPickerMode] = useState<"upload" | "search" | "scraped">("upload");
  const [imgQuery, setImgQuery]   = useState("");
  const [imgResults, setImgResults] = useState<{ url: string; thumb: string; alt: string }[]>([]);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError]   = useState("");
  const [applyingImg, setApplyingImg] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 每日餐食/住宿/照片編輯
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [editVals, setEditVals] = useState({ title: "", breakfast: "", lunch: "", dinner: "", hotel: "" });
  const [savingDay, setSavingDay] = useState(false);
  // 景點美照展開
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // 住宿一覽（每日飯店）快速編輯
  const [hotelDraft, setHotelDraft] = useState<Record<number, string>>({});
  const [savingHotels, setSavingHotels] = useState(false);

  // 載入某個版本的完整內容
  const loadPage = async (id: string) => {
    const { data } = await supabase.from("tour_pages").select("*").eq("id", id).single();
    if (data) {
      setPage(data as TourPage);
      setRawInput((data as TourPage).raw_input || "");
      setActiveId(id);
      setScrapedImages([]);
    }
  };

  // 載入版本清單；preferId 指定要選哪個，否則選已發布或第一個
  const loadVersions = async (preferId?: string) => {
    let res = await supabase
      .from("tour_pages")
      .select("id,version_label,status")
      .eq("tour_id", tour.id)
      .order("created_at", { ascending: true });
    if (res.error) {
      // version_label 欄位尚未建立 → 降級（請執行 supabase_page_versions.sql）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res = await supabase.from("tour_pages").select("id,status").eq("tour_id", tour.id).order("created_at", { ascending: true }) as any;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = ((res.data || []) as any[]).map((r, i) => ({
      id: r.id, status: r.status, version_label: r.version_label || `版本 ${i + 1}`,
    })) as VersionLite[];
    setPages(list);
    const active = preferId
      ? list.find(p => p.id === preferId)
      : (list.find(p => p.status === "published") || list[0]);
    if (active) await loadPage(active.id);
    else { setPage(null); setRawInput(""); setActiveId(null); }
    return list;
  };

  useEffect(() => {
    loadVersions().finally(() => setLoading(false));
    // 取得（或建立）行程頁短網址
    fetch("/api/tour-link", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourId: tour.id }),
    }).then(r => r.json()).then(j => { if (j.tourUrl) setShortUrl(j.tourUrl); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id]);

  const copyShortUrl = async () => {
    if (!shortUrl) return;
    try { await navigator.clipboard.writeText(shortUrl); } catch { /* ignore */ }
    setShortCopied(true);
    setTimeout(() => setShortCopied(false), 1800);
  };

  // 切換版本
  const switchVersion = async (id: string) => {
    if (id === activeId) return;
    setSwitching(true);
    await loadPage(id);
    setSwitching(false);
  };

  // 新增空白版本
  const addVersion = async () => {
    const n = pages.length + 1;
    const { data, error } = await supabase.from("tour_pages")
      .insert([{ tour_id: tour.id, version_label: `版本 ${n}`, category: "group", hero_posters: [], content: {}, raw_input: "", status: "draft" }])
      .select("id").single();
    if (error || !data) { alert("新增版本失敗：" + (error?.message || "")); return; }
    await loadVersions(data.id);
  };

  // 重新命名版本
  const renameVersion = async (id: string) => {
    const cur = pages.find(p => p.id === id);
    const name = prompt("版本名稱", cur?.version_label || "");
    if (name == null) return;
    await supabase.from("tour_pages").update({ version_label: name.trim() || cur?.version_label }).eq("id", id);
    await loadVersions(activeId || undefined);
  };

  // 刪除版本
  const deleteVersion = async (id: string) => {
    if (!confirm("確定刪除此頁面版本？此版本的所有內容與設定都會刪除（不影響團本身）。")) return;
    await supabase.from("tour_pages").delete().eq("id", id);
    const remaining = pages.filter(p => p.id !== id);
    await loadVersions(remaining[0]?.id);
  };

  // ── 從別家行程網址抓取 → 萃取成素材（去除品牌）──────────────────────────────
  const scrapeFromUrl = async () => {
    const u = scrapeUrl.trim();
    if (!u) return;
    setScraping(true);
    setScrapeErr("");
    try {
      const res = await fetch("/api/tour-page/scrape", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const json = await res.json();
      if (!res.ok) { setScrapeErr(json.error || "抓取失敗"); return; }
      const material = (json.material || "").trim();
      if (!material) { setScrapeErr("未能萃取到行程內容"); return; }
      setRawInput(prev => prev.trim() ? prev.trim() + "\n\n" + material : material);
      setScrapedImages(Array.isArray(json.images) ? json.images : []);
      setScrapeUrl("");
    } catch {
      setScrapeErr("抓取失敗，請重試或改用複製貼上");
    } finally {
      setScraping(false);
    }
  };

  // ── 上傳行程檔案（PDF / Word）→ 萃取文字 → 自動生成 ─────────────────────────
  const handleDocFile = async (file: File) => {
    setDocParsing(true); setDocErr(""); setDocMsg("");
    try {
      const name = file.name.toLowerCase();
      let text = "";

      if (name.endsWith(".pdf")) {
        setDocMsg("讀取 PDF 文字中…");
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const parts: string[] = [];
        for (let p = 1; p <= Math.min(pdf.numPages, 20); p++) {
          const page = await pdf.getPage(p);
          const tc = await page.getTextContent();
          parts.push(tc.items.map(it => ("str" in it ? it.str : "")).join(" "));
        }
        text = parts.join("\n\n").replace(/[ \t]{2,}/g, " ").trim();

        // 文字太少 → 可能是掃描檔，改走頁面截圖 + AI 視覺辨識
        if (text.length < 80) {
          setDocMsg("此 PDF 為掃描檔，AI 辨識頁面中（較慢）…");
          const images: string[] = [];
          for (let p = 1; p <= Math.min(pdf.numPages, 8); p++) {
            const page = await pdf.getPage(p);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width; canvas.height = viewport.height;
            const ctx = canvas.getContext("2d")!;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
            images.push(canvas.toDataURL("image/jpeg", 0.9));
          }
          const res = await fetch("/api/tour-page/extract-doc", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ images }),
          });
          const j = await res.json();
          if (!res.ok) { setDocErr(j.error || "辨識失敗"); return; }
          text = (j.text || "").trim();
        }
      } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
        if (name.endsWith(".doc") && !name.endsWith(".docx")) {
          setDocErr("舊版 .doc 格式不支援，請在 Word 另存為 .docx 或 PDF 再上傳");
          return;
        }
        setDocMsg("解析 Word 檔中…");
        const buf = await file.arrayBuffer();
        let b64 = "";
        {
          const bytes = new Uint8Array(buf);
          let bin = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
          }
          b64 = btoa(bin);
        }
        const res = await fetch("/api/tour-page/extract-doc", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docxBase64: b64 }),
        });
        const j = await res.json();
        if (!res.ok) { setDocErr(j.error || "解析失敗"); return; }
        text = (j.text || "").trim();
      } else {
        setDocErr("請上傳 PDF 或 Word（.docx）檔案");
        return;
      }

      if (!text) { setDocErr("檔案裡讀不到行程文字，請改用複製貼上"); return; }
      const merged = rawInput.trim() ? rawInput.trim() + "\n\n" + text : text;
      setRawInput(merged);
      setDocMsg(`已讀取「${file.name}」（${text.length.toLocaleString()} 字），開始生成行程網頁…`);
      // 自動觸發生成（與按「AI 生成行程網頁」相同流程）
      await generate(merged);
      setDocMsg(`「${file.name}」已生成完成，可在下方預覽與編輯`);
    } catch (e) {
      console.error("[doc-upload]", e);
      setDocErr("讀取檔案失敗，請確認檔案未加密後重試");
    } finally {
      setDocParsing(false);
      if (docFileRef.current) docFileRef.current.value = "";
      setTimeout(() => setDocMsg(""), 8000);
    }
  };

  // ── AI 生成 ──────────────────────────────────────────────────────────────────
  // overrideInput：上傳檔案流程直接帶入剛萃取的素材（state 更新是非同步的，不能依賴 rawInput）
  const generate = async (overrideInput?: string) => {
    setGenerating(true);
    setError("");
    const inputText = typeof overrideInput === "string" ? overrideInput : rawInput;
    const keep = page ? Array.from(keepSet) : [];
    try {
      const res = await fetch("/api/tour-page/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tour: {
            name: tour.name,
            destination: tour.destination,
            start_date: tour.start_date,
            end_date: tour.end_date,
            days: getDays(tour.start_date, tour.end_date),
            selling_price: tour.selling_price,
          },
          rawInput: inputText,
          keep,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "生成失敗，請重試"); return; }

      const oldC = page?.content as TourPageContent | undefined;
      const newC = (json.content || EMPTY_CONTENT) as TourPageContent;
      const has = (k: string) => keep.includes(k) && !!oldC;
      const mergedContent: TourPageContent = {
        subtitle:   has("intro")      ? oldC!.subtitle   : newC.subtitle,
        intro:      has("intro")      ? oldC!.intro      : newC.intro,
        highlights: has("highlights") ? oldC!.highlights : newC.highlights,
        days:       has("days")       ? oldC!.days       : newC.days,
        gallery:    has("gallery")    ? (oldC!.gallery || []) : (newC.gallery || []),
        flights:    has("flights")    ? oldC!.flights    : newC.flights,
        includes:   has("fees")       ? oldC!.includes   : newC.includes,
        excludes:   has("fees")       ? oldC!.excludes   : newC.excludes,
        notes:      has("notes")      ? oldC!.notes      : newC.notes,
      };
      const mergedPosters = keep.includes("posters") && page
        ? page.hero_posters
        : (json.hero_posters || []);

      const payload = {
        tour_id:      tour.id,
        category:     page?.category || json.category || "group",
        hero_posters: mergedPosters,
        content:      mergedContent,
        raw_input:    rawInput,
        status:       page?.status || "draft",
        updated_at:   new Date().toISOString(),
      };
      if (page?.id) {
        const { error: e } = await supabase.from("tour_pages").update(payload).eq("id", page.id);
        if (e) { setError("儲存失敗：" + e.message); return; }
        setPage(prev => prev ? { ...prev, ...payload } as TourPage : prev);
      } else {
        const { data, error: e } = await supabase.from("tour_pages")
          .insert([{ ...payload, version_label: `版本 ${pages.length + 1}` }]).select("*").single();
        if (e) { setError("儲存失敗：" + e.message); return; }
        setPage(data as TourPage);
        await loadVersions((data as TourPage).id);
      }
    } catch {
      setError("生成失敗，請檢查網路後重試");
    } finally {
      setGenerating(false);
    }
  };

  // ── 發布 / 取消發布（發布時自動把同團其他版本設為草稿，確保只有一個上線）──
  const togglePublish = async () => {
    if (!page) return;
    setSaving(true);
    const next = page.status === "published" ? "draft" : "published";
    if (next === "published") {
      // 先把同團所有版本設為草稿，再發布這一個
      await supabase.from("tour_pages").update({ status: "draft" }).eq("tour_id", tour.id);
    }
    const { error: e } = await supabase.from("tour_pages")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", page.id);
    if (!e) {
      setPage(prev => prev ? { ...prev, status: next } : prev);
      if (next === "published" && !tour.is_public) {
        await supabase.from("tours").update({ is_public: true }).eq("id", tour.id);
      }
      await loadVersions(page.id);
    }
    setSaving(false);
  };

  // ── 統一換圖 picker ─────────────────────────────────────────────────────────
  const openPicker = (target: PickerTarget, suggestQuery: string) => {
    setPicker(target);
    setPickerMode("upload");
    setImgQuery(suggestQuery);
    setImgResults([]);
    setImgError("");
  };

  const searchImages = async () => {
    if (!imgQuery.trim()) return;
    setImgLoading(true);
    setImgError("");
    try {
      const res = await fetch("/api/tour-page/image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: imgQuery.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setImgError(json.error || "搜尋失敗"); return; }
      setImgResults(json.images || []);
      if ((json.images || []).length === 0) setImgError("找不到照片，請換個關鍵字（英文效果較好）");
    } catch {
      setImgError("搜尋失敗，請重試");
    } finally {
      setImgLoading(false);
    }
  };

  // 把 url 寫進 picker 指定的位置並存檔
  const applyImageToTarget = async (url: string) => {
    if (!page || !picker) return;
    setApplyingImg(url);

    // 海報存在 hero_posters 欄位（非 content）— 獨立處理
    if (picker.kind === "poster") {
      const posters = JSON.parse(JSON.stringify(page.hero_posters || [])) as TourPagePoster[];
      if (posters[picker.idx]) posters[picker.idx].image = url;
      const { error: e } = await supabase.from("tour_pages")
        .update({ hero_posters: posters, updated_at: new Date().toISOString() })
        .eq("id", page.id);
      if (!e) {
        setPage(prev => prev ? { ...prev, hero_posters: posters } : prev);
        setPicker(null);
      } else {
        alert("儲存失敗：" + e.message);
      }
      setApplyingImg("");
      return;
    }

    const content = JSON.parse(JSON.stringify(page.content)) as TourPageContent;
    if (picker.kind === "highlight") {
      if (content.highlights[picker.idx]) content.highlights[picker.idx].image = url;
    } else if (picker.kind === "dayImage") {
      const d = content.days.find(x => x.day === picker.dayNum);
      if (d) {
        const arr = dayImagesOf(d).slice();
        while (arr.length <= picker.slot) arr.push("");
        arr[picker.slot] = url;
        d.images = arr;
        if (picker.slot === 0) d.image = url;
      }
    } else if (picker.kind === "meal") {
      const d = content.days.find(x => x.day === picker.dayNum);
      if (d) d.meal_images = { ...(d.meal_images || {}), [picker.mealKey]: url };
    } else if (picker.kind === "hotel") {
      const d = content.days.find(x => x.day === picker.dayNum);
      if (d) d.hotel_image = url;
    } else if (picker.kind === "gallery") {
      const g = content.gallery?.[picker.spotIdx];
      if (g) {
        const arr = g.images.slice();
        while (arr.length <= picker.imgIdx) arr.push("");
        arr[picker.imgIdx] = url;
        g.images = arr;
      }
    }
    const { error: e } = await supabase.from("tour_pages")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", page.id);
    if (!e) {
      setPage(prev => prev ? { ...prev, content } : prev);
      setPicker(null);
    } else {
      alert("儲存失敗：" + e.message);
    }
    setApplyingImg("");
  };

  // 上傳檔案 → Storage → 套用
  const uploadAndApply = async (file: File) => {
    if (!picker) return;
    if (!file.type.startsWith("image/")) { setImgError("請選擇圖片檔"); return; }
    setUploading(true);
    setImgError("");
    try {
      const blob = await compressToBlob(file);
      const rand = Math.random().toString(36).slice(2, 8);
      const path = `${tour.id}/${Date.now()}-${rand}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("tour-photos")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) {
        setImgError("上傳失敗：" + upErr.message + "（請確認已執行 supabase_tour_photos_bucket.sql）");
        return;
      }
      const { data } = supabase.storage.from("tour-photos").getPublicUrl(path);
      await applyImageToTarget(data.publicUrl);
    } catch {
      setImgError("上傳失敗，請重試");
    } finally {
      setUploading(false);
    }
  };

  // 套用來源網頁圖片：先重新存到自家 Storage（永久保存），再套用
  const applyScrapedImage = async (srcUrl: string) => {
    if (!picker) return;
    setApplyingImg(srcUrl);
    setImgError("");
    try {
      const res = await fetch("/api/tour-page/rehost", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: srcUrl, tourId: tour.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) { setImgError(json.error || "圖片轉存失敗"); setApplyingImg(""); return; }
      await applyImageToTarget(json.url);
    } catch {
      setImgError("圖片轉存失敗，請改試其他張");
      setApplyingImg("");
    }
  };

  // ── 編輯單日餐食/住宿 ────────────────────────────────────────────────────────
  const startEditDay = (dayNum: number) => {
    const d = (page?.content as TourPageContent)?.days.find(x => x.day === dayNum);
    if (!d) return;
    setEditVals({
      title: d.title,
      breakfast: d.meals.breakfast,
      lunch: d.meals.lunch,
      dinner: d.meals.dinner,
      hotel: d.hotel,
    });
    setEditingDay(dayNum);
  };

  const saveDayEdit = async () => {
    if (!page || editingDay == null) return;
    setSavingDay(true);
    const content = page.content as TourPageContent;
    const newContent: TourPageContent = {
      ...content,
      days: content.days.map(d => d.day === editingDay
        ? {
            ...d,
            title: editVals.title.trim() || d.title,
            meals: {
              breakfast: editVals.breakfast.trim(),
              lunch:     editVals.lunch.trim(),
              dinner:    editVals.dinner.trim(),
            },
            hotel: editVals.hotel.trim(),
          }
        : d),
    };
    const { error: e } = await supabase.from("tour_pages")
      .update({ content: newContent, updated_at: new Date().toISOString() })
      .eq("id", page.id);
    if (!e) {
      setPage(prev => prev ? { ...prev, content: newContent } : prev);
      setEditingDay(null);
    } else {
      alert("儲存失敗：" + e.message);
    }
    setSavingDay(false);
  };

  // 局部更新 content 並寫回（費用包含／不含／注意事項／景點美照共用）
  const saveContentPatch = async (patch: Partial<TourPageContent>) => {
    if (!page) return;
    const newContent = { ...(page.content as TourPageContent), ...patch };
    const { error: e } = await supabase.from("tour_pages")
      .update({ content: newContent, updated_at: new Date().toISOString() })
      .eq("id", page.id);
    if (e) { alert("儲存失敗：" + e.message); throw new Error(e.message); }
    setPage(prev => prev ? { ...prev, content: newContent } : prev);
  };

  // 儲存航班（寫入 content.flights）
  const saveFlights = async (flights: TourPageFlightInfo[]) => {
    await saveContentPatch({ flights });
  };

  // 景點美照：改名稱／副標、新增、刪除、排序（照片本身用 PhotoSlot 換圖）
  const updateGallery = async (next: TourPageGallerySpot[]) => {
    await saveContentPatch({ gallery: next });
  };

  // 住宿一覽：一次儲存所有編輯過的飯店
  const saveHotels = async () => {
    if (!page) return;
    setSavingHotels(true);
    const c = page.content as TourPageContent;
    const newContent: TourPageContent = {
      ...c,
      days: c.days.map(d => d.day in hotelDraft ? { ...d, hotel: hotelDraft[d.day] } : d),
    };
    const { error: e } = await supabase.from("tour_pages")
      .update({ content: newContent, updated_at: new Date().toISOString() }).eq("id", page.id);
    if (!e) { setPage(prev => prev ? { ...prev, content: newContent } : prev); setHotelDraft({}); }
    else alert("儲存失敗：" + e.message);
    setSavingHotels(false);
  };

  const changeCategory = async (cat: string) => {
    if (!page) return;
    await supabase.from("tour_pages").update({ category: cat }).eq("id", page.id);
    setPage(prev => prev ? { ...prev, category: cat } : prev);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  const content = page?.content as TourPageContent | undefined;
  const posters = (page?.hero_posters || []) as TourPagePoster[];
  const hasPage = !!page && (posters.length > 0 || (content?.days?.length || 0) > 0);
  const MEAL_LABELS: Record<string, string> = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" };

  return (
    <div className="space-y-4">

      {/* ── 頁面版本切換 ───────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm px-3 py-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">頁面版本：</span>
        {pages.map(v => (
          <div key={v.id} className="flex items-center">
            <button onClick={() => switchVersion(v.id)} disabled={switching}
              className={`flex items-center gap-1.5 text-xs pl-3 pr-2 py-1.5 rounded-lg font-medium transition-colors ${
                v.id === activeId
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}>
              {v.status === "published" && <span title="已發布" className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              {v.version_label}
              {v.id === activeId && (
                <span onClick={e => { e.stopPropagation(); renameVersion(v.id); }} className="ml-0.5 opacity-70 hover:opacity-100" title="重新命名">
                  <Pencil className="w-3 h-3" />
                </span>
              )}
            </button>
            {pages.length > 1 && v.id === activeId && (
              <button onClick={() => deleteVersion(v.id)} className="ml-0.5 p-1 text-slate-300 hover:text-red-500 rounded" title="刪除此版本">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        <button onClick={addVersion}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
          <Sparkles className="w-3.5 h-3.5" /> 新增版本
        </button>
        {switching && <Loader2 className="w-4 h-4 animate-spin text-violet-500" />}
        <span className="ml-auto text-[11px] text-slate-400 hidden sm:block">同一團可建多個版本互相比較，發布哪個前台就顯示哪個</span>
      </div>

      {/* ── 素材輸入區 ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            AI 行程網頁生成器
          </h3>
          <span className="text-xs text-slate-400">
            綁定：{tour.name}（{new Date(tour.start_date).toLocaleDateString("zh-TW")} 出發 · NT${tour.selling_price.toLocaleString()}）
          </span>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          貼上行程素材（每日行程、景點、餐食、飯店、航班等任何文字資料），AI 會自動生成包含
          <span className="text-violet-600 dark:text-violet-400 font-medium"> 4 張特色海報、每日行程（每天 3 張配圖）、景點美照（每個景點 3 張）、餐食住宿、航班資訊 </span>
          的雜誌級行程網頁。日期與價格自動帶入本團資料。
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">所有照片皆可個別「上傳自己的照片」替換。</span>
        </p>

        {/* 從別家行程網址自動抓取 */}
        <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-900/10 p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-sky-700 dark:text-sky-300 shrink-0">🔗 貼上別家行程網址</span>
            <input
              className="flex-1 min-w-[180px] text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
              placeholder="例：喜鴻、攜程等行程頁網址 https://…"
              value={scrapeUrl}
              onChange={e => setScrapeUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !scraping && scrapeFromUrl()}
            />
            <button onClick={scrapeFromUrl} disabled={scraping || !scrapeUrl.trim()}
              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors shrink-0">
              {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {scraping ? "抓取中…" : "抓取行程"}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            AI 會自動萃取每日行程、餐食、飯店、景點、航班並填入下方素材框，
            <span className="text-sky-600 dark:text-sky-400 font-medium">並自動移除對方旅行社／平台的名稱與報價</span>。
            照片一律由系統重新搜尋實景照（不使用對方的圖，避免浮水印與版權）。動態載入的網站（如部分攜程頁）若抓不到，可改用複製貼上。
          </p>
          {scrapeErr && (
            <p className="flex items-center gap-1.5 text-xs text-red-500 mt-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {scrapeErr}
            </p>
          )}
        </div>

        {/* 上傳行程檔案（PDF / Word）→ 一鍵生成 */}
        <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10 p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 shrink-0">📄 上傳行程檔案</span>
            <button onClick={() => docFileRef.current?.click()} disabled={docParsing || generating}
              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors shrink-0">
              {docParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {docParsing ? "處理中…" : "選擇 PDF / Word 檔"}
            </button>
            <input ref={docFileRef} type="file" accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden"
              onChange={e => e.target.files?.[0] && handleDocFile(e.target.files[0])} />
            {docMsg && !docErr && (
              <span className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-300">
                {docParsing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {docMsg}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            上傳同業或自製的行程檔（PDF、Word .docx），系統會自動讀取行程內容並
            <span className="text-violet-600 dark:text-violet-400 font-medium">直接生成精美行程網頁</span>，
            不用手動貼文字。掃描版 PDF 也可以（AI 會逐頁辨識，較慢）。讀到的文字會同時填入下方素材框，生成前後都可修改再重新生成。
          </p>
          {docErr && (
            <p className="flex items-center gap-1.5 text-xs text-red-500 mt-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {docErr}
            </p>
          )}
        </div>

        <textarea
          className="w-full h-48 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y font-mono"
          placeholder={`範例：
Day1 台北 → 東京成田，午後淺草雷門、晴空塔，晚餐燒肉放題，宿：東京灣希爾頓
Day2 箱根一日遊，蘆之湖海賊船、大涌谷，溫泉飯店會席料理...
航班：BR198 1/15 TPE 09:00 → NRT 13:00
飯店：東京灣希爾頓 x2晚、箱根湯本溫泉飯店 x1晚
...（素材越詳細，生成越精準）`}
          value={rawInput}
          onChange={e => setRawInput(e.target.value)}
        />

        {/* 重新生成時可保留的區塊 */}
        {hasPage && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                🔒 保留區塊（勾選的部分不重新生成，維持現狀）
              </span>
              <div className="flex gap-2">
                <button onClick={() => setKeepSet(new Set(KEEP_SECTIONS.map(s => s.key)))} className="text-[11px] text-emerald-600 hover:underline">全選</button>
                <button onClick={() => setKeepSet(new Set())} className="text-[11px] text-slate-400 hover:underline">清除</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {KEEP_SECTIONS.map(s => (
                <button key={s.key} type="button"
                  onClick={() => setKeepSet(prev => {
                    const next = new Set(prev);
                    if (next.has(s.key)) next.delete(s.key); else next.add(s.key);
                    return next;
                  })}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    keepSet.has(s.key)
                      ? "bg-emerald-600 text-white"
                      : "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-emerald-400 hover:text-emerald-600"
                  }`}>
                  {keepSet.has(s.key) ? "🔒 " : ""}{s.label}
                </button>
              ))}
            </div>
            {keepSet.size > 0 && (
              <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-2">
                將保留 {keepSet.size} 個區塊，只重新生成其餘 {KEEP_SECTIONS.length - keepSet.size} 個區塊（省 AI 與圖片額度）
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => generate()}
            disabled={generating || (hasPage && keepSet.size === KEEP_SECTIONS.length)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-all shadow-sm">
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> AI 生成中（約 30-60 秒）…</>
              : hasPage
                ? <><RefreshCw className="w-4 h-4" /> 重新生成{keepSet.size > 0 ? `（保留 ${keepSet.size} 區塊）` : "行程網頁"}</>
                : <><Sparkles className="w-4 h-4" /> AI 生成行程網頁</>
            }
          </button>
          {hasPage && keepSet.size === KEEP_SECTIONS.length && (
            <span className="text-xs text-slate-400">已全部保留，沒有需要生成的區塊</span>
          )}
          {error && (
            <span className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </span>
          )}
        </div>
      </div>

      {/* ── 生成結果 ────────────────────────────────────────────────────────── */}
      {hasPage && page && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">

          {/* 狀態列 */}
          <div className="px-4 md:px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between flex-wrap gap-3 bg-slate-50/50 dark:bg-slate-700/30">
            <div className="flex items-center gap-3 flex-wrap">
              {page.status === "published" ? (
                <span className="flex items-center gap-1.5 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 已發布
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full font-medium">
                  <AlertCircle className="w-3.5 h-3.5" /> 草稿（前台不可見）
                </span>
              )}
              <select value={page.category} onChange={e => changeCategory(e.target.value)}
                className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-400">
                {TOUR_PAGE_CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShareOpen(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors">
                <Megaphone className="w-3.5 h-3.5" /> 揪團圖卡/短片
              </button>
              <a href={`/tours/${tour.id}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-cyan-400 hover:text-cyan-600 rounded-lg transition-colors">
                <Eye className="w-3.5 h-3.5" /> 預覽頁面 <ExternalLink className="w-3 h-3" />
              </a>
              {shortUrl && (
                <button onClick={copyShortUrl}
                  title={`複製行程頁短網址：${shortUrl}`}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors font-mono ${
                    shortCopied
                      ? "border-emerald-400 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20"
                      : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-violet-400 hover:text-violet-600"
                  }`}>
                  {shortCopied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
                  {shortCopied ? "已複製短網址" : shortUrl.replace(/^https?:\/\//, "")}
                </button>
              )}
              <button onClick={togglePublish} disabled={saving}
                className={`flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                  page.status === "published"
                    ? "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                }`}>
                {page.status === "published"
                  ? <><EyeOff className="w-3.5 h-3.5" /> 取消發布</>
                  : <><Globe className="w-3.5 h-3.5" /> 發布到前台</>
                }
              </button>
            </div>
          </div>

          {/* 海報預覽（可換圖/上傳） */}
          {posters.length > 0 && (
            <div className="p-4 md:p-5 border-b border-slate-100 dark:border-slate-700">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" /> 行程海報（{posters.length} 張）
                <span className="normal-case font-normal text-slate-300 dark:text-slate-500 tracking-normal">— 點海報可上傳或更換照片</span>
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {posters.map((p, i) => (
                  <button key={i} type="button"
                    onClick={() => openPicker({ kind: "poster", idx: i, label: `行程海報 ${i + 1}：${p.title}` }, `${tour.destination} ${p.title}`)}
                    className="relative aspect-[3/4] rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 group text-left">
                    {p.image ? (
                      <img src={p.image} alt={p.title} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500 to-blue-600" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                    <span className="absolute top-2 left-2 text-[10px] font-bold text-white bg-black/45 px-1.5 py-0.5 rounded-full">{i + 1}</span>
                    <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] px-2 py-1 bg-black/55 group-hover:bg-violet-600 text-white rounded-full backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100">
                      <RefreshCw className="w-2.5 h-2.5" /> 換圖
                    </span>
                    <div className="absolute bottom-0 left-0 right-0 p-3 pointer-events-none">
                      <div className="text-white font-bold text-sm leading-snug drop-shadow">{p.title}</div>
                      <div className="text-white/75 text-[10px] mt-0.5 leading-tight">{p.subtitle}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 內容摘要 */}
          {content && (
            <div className="p-4 md:p-5 space-y-4">
              {content.subtitle && (
                <div>
                  <span className="text-xs text-slate-400 block mb-0.5">副標語</span>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{content.subtitle}</p>
                </div>
              )}
              {content.intro && (
                <div>
                  <span className="text-xs text-slate-400 block mb-0.5">行程介紹</span>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">{content.intro}</p>
                </div>
              )}

              {/* 行程特色（可換圖/上傳） */}
              {content.highlights.length > 0 && (
                <div>
                  <span className="text-xs text-slate-400 block mb-1.5">
                    行程特色（{content.highlights.length}）
                    <span className="ml-2 text-slate-300 dark:text-slate-500">點照片可上傳或更換</span>
                  </span>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                    {content.highlights.map((h, i) => (
                      <div key={i} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50">
                        <PhotoSlot url={h.image} ratio="h-24" placeholder={h.icon}
                          onClick={() => openPicker({ kind: "highlight", idx: i, label: `行程特色：${h.title}` }, `${tour.destination} ${h.title}`)} />
                        <div className="px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 truncate">
                          {h.icon} {h.title}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 每日行程（含照片管理） */}
              {content.days.length > 0 && (
                <div>
                  <span className="text-xs text-slate-400 block mb-1.5">
                    每日行程（{content.days.length} 天）
                    <span className="ml-2 text-slate-300 dark:text-slate-500">點 ✏️ 修改文字、管理景點/餐食/住宿照片</span>
                  </span>
                  <div className="space-y-1.5">
                    {content.days.map(d => {
                      const dImgs = dayImagesOf(d);
                      const imgCount = dImgs.length;
                      const isEditing = editingDay === d.day;
                      const date = dayDateOf(tour.start_date, d.day);
                      const dmd = `${date.getMonth() + 1}/${date.getDate()}`;
                      const dayFlights = (content.flights || []).filter(f => mdKey(f.date) === dmd);
                      return (
                        <div key={d.day}>
                          <div className="flex items-center gap-2 text-xs group">
                            <span className="shrink-0 text-center font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 rounded-lg px-2 py-1 leading-tight">
                              <span className="block text-[13px]">{date.getMonth() + 1}/{date.getDate()}</span>
                              <span className="block text-[9px] font-normal text-violet-400">D{d.day}・{date.toLocaleDateString("zh-TW", { weekday: "short" })}</span>
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="text-slate-600 dark:text-slate-300 truncate block">{d.title}</span>
                              {dayFlights.length > 0 && (
                                <span className="text-[10px] text-sky-600 dark:text-sky-400 block truncate">
                                  ✈️ {dayFlights.map(f => `${f.flight_no} ${f.depart}-${f.arrive} ${f.from}→${f.to}`).join("　/　")}
                                </span>
                              )}
                            </div>
                            {imgCount > 0 && (
                              <span className="flex items-center gap-0.5 text-emerald-600 shrink-0">
                                <ImageIcon className="w-3 h-3" /> {imgCount}
                              </span>
                            )}
                            <button onClick={() => isEditing ? setEditingDay(null) : startEditDay(d.day)}
                              className={`shrink-0 p-1 rounded transition-colors ${
                                isEditing ? "text-violet-600 bg-violet-50 dark:bg-violet-900/30" : "text-slate-300 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30"
                              }`}
                              title={`編輯第 ${d.day} 天`}>
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>

                          {/* 單日編輯面板 */}
                          {isEditing && (
                            <div className="mt-2 mb-3 ml-0 sm:ml-14 p-3.5 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10 space-y-3">
                              <div>
                                <label className="text-[11px] text-slate-400 block mb-0.5">當日標題</label>
                                <input className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-400"
                                  value={editVals.title} onChange={e => setEditVals(v => ({ ...v, title: e.target.value }))} />
                              </div>

                              {/* 當日景點照片（3 張） */}
                              <div>
                                <label className="text-[11px] text-slate-400 block mb-1">當日景點照片（3 張，前台大圖拼貼）</label>
                                <div className="grid grid-cols-3 gap-2">
                                  {[0, 1, 2].map(slot => (
                                    <PhotoSlot key={slot} url={dImgs[slot]} ratio="aspect-[4/3]" placeholder={`照片 ${slot + 1}`}
                                      onClick={() => openPicker({ kind: "dayImage", dayNum: d.day, slot, label: `第${d.day}天 景點照片 ${slot + 1}` }, `${tour.destination} ${d.title}`)} />
                                  ))}
                                </div>
                              </div>

                              {/* 餐食（文字 + 照片） */}
                              <div className="grid grid-cols-3 gap-2">
                                {(["breakfast", "lunch", "dinner"] as const).map(key => (
                                  <div key={key}>
                                    <label className="text-[11px] text-slate-400 block mb-0.5">{MEAL_LABELS[key]}</label>
                                    <input className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 mb-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-400"
                                      placeholder="例：機上 / 飯店內用"
                                      value={editVals[key]} onChange={e => setEditVals(v => ({ ...v, [key]: e.target.value }))} />
                                    <PhotoSlot url={d.meal_images?.[key]} ratio="aspect-[4/3]" placeholder="餐點照片"
                                      onClick={() => openPicker({ kind: "meal", dayNum: d.day, mealKey: key, label: `第${d.day}天 ${MEAL_LABELS[key]}照片` }, `${editVals[key] || tour.destination} food`)} />
                                  </div>
                                ))}
                              </div>

                              {/* 住宿（文字 + 照片） */}
                              <div>
                                <label className="text-[11px] text-slate-400 block mb-0.5">住宿</label>
                                <input className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 mb-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-400"
                                  value={editVals.hotel} onChange={e => setEditVals(v => ({ ...v, hotel: e.target.value }))} />
                                <div className="w-1/2">
                                  <PhotoSlot url={d.hotel_image} ratio="aspect-[16/9]" placeholder="飯店照片"
                                    onClick={() => openPicker({ kind: "hotel", dayNum: d.day, label: `第${d.day}天 飯店照片` }, `${editVals.hotel || tour.destination} hotel`)} />
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pt-0.5">
                                <button onClick={saveDayEdit} disabled={savingDay}
                                  className="flex items-center gap-1 text-xs px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
                                  {savingDay ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                  儲存文字
                                </button>
                                <button onClick={() => setEditingDay(null)}
                                  className="flex items-center gap-1 text-xs px-3 py-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                                  <X className="w-3 h-3" /> 收合
                                </button>
                                <span className="text-[10px] text-slate-400">照片更換後即時生效，文字需按「儲存文字」</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 住宿一覽（每日飯店，可快速編輯）*/}
              {content.days.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      🏨 住宿一覽（每日飯店）
                      <span className="font-normal text-slate-300 dark:text-slate-500">— 在此選定/調整每天飯店，同業報價會用到</span>
                    </span>
                    {Object.keys(hotelDraft).length > 0 && (
                      <button onClick={saveHotels} disabled={savingHotels}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 transition-colors">
                        {savingHotels ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} 儲存住宿
                      </button>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-600 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
                    {content.days.map(d => {
                      const dt = dayDateOf(tour.start_date, d.day);
                      const val = d.day in hotelDraft ? hotelDraft[d.day] : (d.hotel || "");
                      return (
                        <div key={d.day} className="flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-slate-800">
                          <span className="shrink-0 w-24 text-[11px] font-semibold text-violet-600 dark:text-violet-400">
                            第{d.day}天 <span className="font-normal text-slate-400">{dt.getMonth() + 1}/{dt.getDate()}</span>
                          </span>
                          <input
                            className="flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            placeholder="飯店名稱（最後一天可填「溫暖的家」）"
                            value={val}
                            onChange={e => setHotelDraft(prev => ({ ...prev, [d.day]: e.target.value }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 景點美照（可展開逐張換圖/上傳） */}
              {(content.gallery?.length || 0) > 0 && (
                <div>
                  <button onClick={() => setGalleryOpen(v => !v)}
                    className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5 hover:text-violet-600">
                    景點美照（{content.gallery!.length} 個景點 × 3 張）
                    <span className="text-violet-500 underline">{galleryOpen ? "收合" : "展開管理照片"}</span>
                  </button>
                  {galleryOpen ? (
                    <div className="space-y-3">
                      {content.gallery!.map((g, gi) => (
                        <div key={gi} className="rounded-xl border border-slate-200 dark:border-slate-600 p-2.5">
                          <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{g.name}</div>
                          <div className="grid grid-cols-3 gap-2">
                            {[0, 1, 2].map(idx => (
                              <PhotoSlot key={idx} url={g.images[idx]} ratio="aspect-[4/3]" placeholder={`照片 ${idx + 1}`}
                                onClick={() => openPicker({ kind: "gallery", spotIdx: gi, imgIdx: idx, label: `景點美照：${g.name} ${idx + 1}` }, `${tour.destination} ${g.name}`)} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {content.gallery!.map((g, i) => (
                        <span key={i} className="text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" /> {g.name}（{g.images.length}）
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-xs text-slate-400 pt-2 border-t border-slate-50 dark:border-slate-700">
                <span>✈️ 航班 {content.flights.length} 筆</span>
                <span>🖼 景點美照 {content.gallery?.length || 0} 組</span>
                <span>✅ 費用包含 {content.includes.length} 項</span>
                <span>❌ 費用不含 {content.excludes.length} 項</span>
                <span>📌 注意事項 {content.notes.length} 項</span>
              </div>
            </div>
          )}

          {/* 航班資訊（單獨列出，可手填或航班號自動帶入）*/}
          <FlightEditor flights={content?.flights || []} onSave={saveFlights} />
        </div>
      )}

      {/* ── 換圖 / 上傳 picker 彈窗 ─────────────────────────────────────────── */}
      {picker && page && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPicker(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-violet-500" /> 更換照片 — {picker.label}
              </h3>
              <button onClick={() => setPicker(null)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 分頁：上傳 / 搜尋 */}
            <div className="px-5 pt-3 shrink-0 flex gap-1">
              <button onClick={() => setPickerMode("upload")}
                className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-t-lg font-medium transition-colors ${
                  pickerMode === "upload" ? "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-b-2 border-violet-600" : "text-slate-500 hover:text-violet-600"
                }`}>
                <Upload className="w-4 h-4" /> 上傳自己的照片
              </button>
              <button onClick={() => setPickerMode("search")}
                className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-t-lg font-medium transition-colors ${
                  pickerMode === "search" ? "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-b-2 border-violet-600" : "text-slate-500 hover:text-violet-600"
                }`}>
                <Search className="w-4 h-4" /> 搜尋圖庫
              </button>
              {scrapedImages.length > 0 && (
                <button onClick={() => setPickerMode("scraped")}
                  className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-t-lg font-medium transition-colors ${
                    pickerMode === "scraped" ? "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-b-2 border-violet-600" : "text-slate-500 hover:text-violet-600"
                  }`}>
                  🔗 來源網頁圖片 <span className="text-[10px] bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 px-1.5 rounded-full">{scrapedImages.length}</span>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {imgError && (
                <p className="flex items-center gap-1.5 text-xs text-red-500 mb-3">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {imgError}
                </p>
              )}

              {/* 上傳模式 */}
              {pickerMode === "upload" && (
                <div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadAndApply(f); e.target.value = ""; }} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading || !!applyingImg}
                    className="w-full flex flex-col items-center justify-center gap-3 py-14 rounded-2xl border-2 border-dashed border-violet-300 dark:border-violet-700 hover:border-violet-500 hover:bg-violet-50/50 dark:hover:bg-violet-900/10 transition-colors disabled:opacity-60">
                    {uploading || applyingImg ? (
                      <><Loader2 className="w-8 h-8 animate-spin text-violet-500" /><span className="text-sm text-slate-500">上傳中…</span></>
                    ) : (
                      <>
                        <div className="w-14 h-14 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                          <Upload className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">點此選擇照片上傳</div>
                          <div className="text-xs text-slate-400 mt-1">支援 JPG / PNG，會自動壓縮最佳化</div>
                        </div>
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-slate-400 mt-3 text-center">上傳後立即套用並儲存，前台同步更新。</p>
                </div>
              )}

              {/* 搜尋模式 */}
              {pickerMode === "search" && (
                <div>
                  <div className="flex gap-2 mb-4">
                    <input className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3.5 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="關鍵字搜尋（英文效果較好，例：guizhou waterfall）"
                      value={imgQuery} onChange={e => setImgQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !imgLoading && searchImages()} autoFocus />
                    <button onClick={searchImages} disabled={imgLoading || !imgQuery.trim()}
                      className="flex items-center gap-1.5 text-sm px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium disabled:opacity-50 transition-colors shrink-0">
                      {imgLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} 搜尋
                    </button>
                  </div>
                  {imgResults.length === 0 && !imgLoading && (
                    <div className="text-center py-10 text-slate-400 text-sm">
                      <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      輸入關鍵字搜尋圖庫，點選即可套用
                    </div>
                  )}
                  {imgLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>}
                  {imgResults.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {imgResults.map((img, i) => (
                        <button key={i} onClick={() => applyImageToTarget(img.url)} disabled={!!applyingImg}
                          className="relative aspect-[4/3] rounded-xl overflow-hidden border-2 border-transparent hover:border-violet-500 transition-all group disabled:opacity-60" title={img.alt}>
                          <img src={img.thumb} alt={img.alt} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                            {applyingImg === img.url ? (
                              <Loader2 className="w-5 h-5 animate-spin text-white" />
                            ) : (
                              <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-semibold bg-violet-600 px-3 py-1.5 rounded-full transition-opacity">套用這張</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 來源網頁圖片 */}
              {pickerMode === "scraped" && (
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
                    以下是從來源網頁抓到的照片。<span className="text-amber-600 dark:text-amber-400 font-medium">請挑選「沒有浮水印／旅行社品牌字樣」的照片</span>使用；點選後會自動轉存到自家空間。
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {scrapedImages.map((url, i) => (
                      <button key={i} onClick={() => applyScrapedImage(url)} disabled={!!applyingImg}
                        className="relative aspect-[4/3] rounded-xl overflow-hidden border-2 border-transparent hover:border-violet-500 transition-all group disabled:opacity-60">
                        <img src={url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }} />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                          {applyingImg === url ? (
                            <Loader2 className="w-5 h-5 animate-spin text-white" />
                          ) : (
                            <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-semibold bg-violet-600 px-3 py-1.5 rounded-full transition-opacity">套用這張</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 揪團圖卡/短片 */}
      <ShareKit
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        tour={tour}
        photos={Array.from(new Set([
          ...((page?.hero_posters || []) as TourPagePoster[]).map(p => p.image),
          ...((content?.days || []).flatMap(d => dayImagesOf(d))),
          ...((content?.gallery || []).flatMap(g => g.images)),
        ].filter(Boolean)))}
        highlights={content?.highlights || []}
        pageUrl={shortUrl || `https://1trip.com.tw/tours/${tour.id}`}
      />
    </div>
  );
}
