"use client";
import { useEffect, useRef, useState } from "react";
import { supabase, VersionHotel } from "@/lib/supabase";
import {
  Image as ImageIcon, Upload, Loader2, X, BedDouble, Plus, Trash2,
  Search, ExternalLink, Save, Star, ChevronDown, ChevronRight,
} from "lucide-react";

interface Props { versionId: string; tourId: string }

function compressToBlob(file: File, maxPx = 1600, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; } else { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error("fail")), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("fail")); };
    img.src = url;
  });
}

const EMPTY_HOTEL: VersionHotel = { name: "", nights: "", stars: "", trip_url: "", ctrip_url: "", note: "" };

export default function VersionExtras({ versionId, tourId }: Props) {
  const [open, setOpen]       = useState(false);
  const [images, setImages]   = useState<string[]>([]);
  const [hotels, setHotels]   = useState<VersionHotel[]>([]);
  const [destination, setDestination] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingHotels, setSavingHotels] = useState(false);
  const [hotelsDirty, setHotelsDirty]   = useState(false);
  const [lookupIdx, setLookupIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 載入該版本的參考圖片 + 飯店表
  useEffect(() => {
    if (!versionId) return;
    supabase.from("tour_cost_versions").select("reference_images,hotels").eq("id", versionId).single()
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        setImages(Array.isArray(d?.reference_images) ? d.reference_images : []);
        setHotels(Array.isArray(d?.hotels) ? d.hotels : []);
        setHotelsDirty(false);
      });
    supabase.from("tours").select("destination").eq("id", tourId).single()
      .then(({ data }) => setDestination((data as { destination?: string })?.destination || ""));
  }, [versionId, tourId]);

  // ── 參考圖片 ──────────────────────────────────────────────────────────────────
  const saveImages = async (next: string[]) => {
    setImages(next);
    await supabase.from("tour_cost_versions").update({ reference_images: next }).eq("id", versionId);
  };
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const blob = await compressToBlob(file);
        const path = `cost-ref/${tourId}/${versionId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
        const { error } = await supabase.storage.from("tour-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (error) { alert("上傳失敗：" + error.message + "（請確認已執行 supabase_tour_photos_bucket.sql）"); break; }
        added.push(supabase.storage.from("tour-photos").getPublicUrl(path).data.publicUrl);
      }
      if (added.length) await saveImages([...images, ...added]);
    } finally { setUploading(false); }
  };

  // ── 飯店表 ────────────────────────────────────────────────────────────────────
  const updateHotel = (idx: number, patch: Partial<VersionHotel>) => {
    setHotels(prev => prev.map((h, i) => i === idx ? { ...h, ...patch } : h));
    setHotelsDirty(true);
  };
  const addHotel = () => { setHotels(prev => [...prev, { ...EMPTY_HOTEL }]); setHotelsDirty(true); };
  const removeHotel = (idx: number) => { setHotels(prev => prev.filter((_, i) => i !== idx)); setHotelsDirty(true); };
  const saveHotels = async () => {
    setSavingHotels(true);
    const { error } = await supabase.from("tour_cost_versions").update({ hotels }).eq("id", versionId);
    setSavingHotels(false);
    if (!error) setHotelsDirty(false); else alert("儲存失敗：" + error.message);
  };

  const lookupHotel = async (idx: number) => {
    const h = hotels[idx];
    if (!h?.name.trim()) { alert("請先填寫飯店名稱"); return; }
    setLookupIdx(idx);
    try {
      const res = await fetch("/api/hotel-lookup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: h.name.trim(), destination }),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "查詢失敗"); return; }
      updateHotel(idx, {
        trip_url: j.trip_url || h.trip_url,
        ctrip_url: j.ctrip_url || h.ctrip_url,
        stars: j.stars || h.stars,
        note: h.note || j.note || "",
      });
    } catch { alert("查詢失敗，請重試"); }
    finally { setLookupIdx(null); }
  };

  const inp = "w-full text-xs border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <div className="border-t border-slate-100 dark:border-slate-700">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <ImageIcon className="w-3.5 h-3.5 text-blue-500" /> 參考圖片
        {images.length > 0 && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full">{images.length}</span>}
        <BedDouble className="w-3.5 h-3.5 text-violet-500 ml-2" /> 飯店比較表
        {hotels.length > 0 && <span className="text-[10px] bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 px-1.5 py-0.5 rounded-full">{hotels.length}</span>}
        <span className="ml-auto text-[10px] text-slate-400">此版本專屬</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* ── 參考圖片 ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">參考圖片（可多張）</span>
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} 上傳圖片
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { handleUpload(e.target.files); e.target.value = ""; }} />
            </div>
            {images.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 dark:border-slate-600 rounded-lg">尚無參考圖片，點「上傳圖片」新增（飯店、菜單、報價單截圖等）</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {images.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 group">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </a>
                    <button onClick={() => saveImages(images.filter((_, ii) => ii !== i))}
                      className="absolute top-1 right-1 p-1 bg-black/55 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── 飯店比較表 ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">飯店比較表</span>
              <div className="flex items-center gap-2">
                {hotelsDirty && <span className="text-[11px] text-orange-500">● 未儲存</span>}
                <button onClick={saveHotels} disabled={savingHotels || !hotelsDirty}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 transition-colors">
                  {savingHotels ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} 儲存
                </button>
              </div>
            </div>

            {hotels.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 dark:border-slate-600 rounded-lg mb-2">尚無飯店，點下方「新增飯店」開始建立比較表</p>
            ) : (
              <div className="space-y-2">
                {hotels.map((h, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-600 p-2.5 bg-slate-50/50 dark:bg-slate-700/30">
                    <div className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-12 sm:col-span-5">
                        <label className="text-[10px] text-slate-400">飯店名稱</label>
                        <div className="flex gap-1.5">
                          <input className={inp} placeholder="例：貴陽萬麗酒店" value={h.name} onChange={e => updateHotel(i, { name: e.target.value })} />
                          <button onClick={() => lookupHotel(i)} disabled={lookupIdx === i}
                            className="shrink-0 flex items-center gap-1 text-[11px] px-2 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded disabled:opacity-50 transition-colors"
                            title="自動帶入星級與 Trip.com／攜程 連結">
                            {lookupIdx === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />} 自動帶入
                          </button>
                        </div>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <label className="text-[10px] text-slate-400">晚數</label>
                        <input className={inp} placeholder="2晚" value={h.nights} onChange={e => updateHotel(i, { nights: e.target.value })} />
                      </div>
                      <div className="col-span-5 sm:col-span-3">
                        <label className="text-[10px] text-slate-400">星級（AI 建議可改）</label>
                        <div className="relative">
                          <Star className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-amber-400" />
                          <input className={inp + " pl-6"} placeholder="5星級" value={h.stars} onChange={e => updateHotel(i, { stars: e.target.value })} />
                        </div>
                      </div>
                      <div className="col-span-3 sm:col-span-2 flex items-end justify-end h-full">
                        <button onClick={() => removeHotel(i)} className="p-1.5 text-slate-300 hover:text-white hover:bg-red-500 rounded-lg transition-colors" title="刪除">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="col-span-12 sm:col-span-8">
                        <label className="text-[10px] text-slate-400">備註</label>
                        <input className={inp} placeholder="房型、含餐、景觀等" value={h.note} onChange={e => updateHotel(i, { note: e.target.value })} />
                      </div>
                      <div className="col-span-12 sm:col-span-4 flex items-end gap-1.5">
                        {h.trip_url ? (
                          <a href={h.trip_url} target="_blank" rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 border border-sky-200 dark:border-sky-700 text-sky-600 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded transition-colors">
                            Trip.com <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : <span className="flex-1 text-center text-[10px] text-slate-300 py-1.5">無連結</span>}
                        {h.ctrip_url && (
                          <a href={h.ctrip_url} target="_blank" rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors">
                            攜程 <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button onClick={addHotel}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-violet-300 dark:border-violet-700 rounded-lg text-xs text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors font-medium">
              <Plus className="w-3.5 h-3.5" /> 新增飯店
            </button>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              「自動帶入」會用 AI 估星級並產生 Trip.com／攜程搜尋連結（點連結可看實際評分與房價）。星級為 AI 建議，可手動修改。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
