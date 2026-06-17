"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Tour } from "@/lib/supabase";
import {
  X, Download, Loader2, Image as ImageIcon, Video, Copy, CheckCircle2, Megaphone,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  tour: Tour;
  photos: string[];
  highlights: { title: string; desc?: string }[];
  pageUrl: string;
}

const W = 1080, H = 1350;

function proxied(url: string) {
  return url.startsWith("/") ? url : `/api/img-proxy?url=${encodeURIComponent(url)}`;
}
function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load fail"));
    img.src = proxied(url);
  });
}
function coverDraw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height, r = w / h;
  let sw: number, sh: number, sx: number, sy: number;
  if (ir > r) { sh = img.height; sw = sh * r; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / r; sx = 0; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []; let cur = "";
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
}
function getDays(s: string, e: string) {
  return Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1;
}

const SANS = `bold 1px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif`;
const STYLES = [
  { key: "classic", name: "經典", accent: "#f0b429", ink: "#fff" },
  { key: "bold",    name: "強打", accent: "#ff7a45", ink: "#fff" },
  { key: "fresh",   name: "清新", accent: "#22d3ee", ink: "#fff" },
];

export default function ShareKit({ open, onClose, tour, photos, highlights, pageUrl }: Props) {
  const [tab, setTab] = useState<"image" | "video">("image");
  const [cards, setCards] = useState<string[]>([]);   // dataURL per style
  const [busy, setBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [making, setMaking] = useState(false);
  const [vProgress, setVProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const vCanvas = useRef<HTMLCanvasElement>(null);

  const cleanPhotos = photos.filter(Boolean);
  const days = getDays(tour.start_date, tour.end_date);
  const cash = tour.selling_price || 0;
  const orig = (tour.original_price ?? 0) > cash ? (tour.original_price as number) : 0;

  const shareText =
    `🌸【揪團】${tour.name}\n` +
    `📍 ${tour.destination}　📅 ${fmtDate(tour.start_date)} ・ ${days}天${days - 1}夜\n` +
    `💰 每人 NT$${cash.toLocaleString()} 起${orig ? `（原價 NT$${orig.toLocaleString()}）` : ""}\n` +
    (highlights[0]?.title ? `✨ ${highlights.slice(0, 3).map(h => h.title).join("、")}\n` : "") +
    `\n名額有限，一起出發 👉 ${pageUrl}`;

  // ── 畫一張行銷卡 ──────────────────────────────────────────────────────────────
  const drawCard = useCallback((ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, accent: string) => {
    ctx.clearRect(0, 0, W, H);
    if (img) coverDraw(ctx, img, 0, 0, W, H);
    else { ctx.fillStyle = "#0e7490"; ctx.fillRect(0, 0, W, H); }
    // 漸層
    let g = ctx.createLinearGradient(0, H * 0.32, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.55, "rgba(0,0,0,.45)"); g.addColorStop(1, "rgba(0,0,0,.9)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, "rgba(0,0,0,.5)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 240);

    // 頂部品牌列
    ctx.font = SANS.replace("1px", "34px"); ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.textBaseline = "top";
    ctx.fillText("暖心旅行社 ✈ 旅遊大聯盟", 60, 56);
    // 揪團徽章
    ctx.font = SANS.replace("1px", "30px");
    const bt = "限額揪團中"; const bw = ctx.measureText(bt).width + 44;
    ctx.fillStyle = accent; roundRect(ctx, W - 60 - bw, 52, bw, 56, 28); ctx.fill();
    ctx.fillStyle = "#1a1a1a"; ctx.fillText(bt, W - 60 - bw + 22, 64);

    // 底部內容
    let y = H - 80;
    // CTA
    ctx.font = SANS.replace("1px", "30px").replace("bold", "600"); ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("立即報名 ➜ 1trip.com.tw", 64, y); y -= 56;
    // 特色
    ctx.font = SANS.replace("1px", "32px").replace("bold", "500"); ctx.fillStyle = "rgba(255,255,255,.92)";
    for (const h of highlights.slice(0, 2).reverse()) {
      const line = "・" + h.title;
      ctx.fillText(line, 64, y); y -= 48;
    }
    if (highlights.length) y -= 8;
    // 價格
    ctx.textBaseline = "alphabetic";
    ctx.font = SANS.replace("1px", "92px"); ctx.fillStyle = accent;
    const priceStr = `NT$${cash.toLocaleString()}`;
    ctx.fillText(priceStr, 60, y);
    const pw = ctx.measureText(priceStr).width;
    ctx.font = SANS.replace("1px", "34px").replace("bold", "500"); ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillText(" 起 / 人", 60 + pw + 6, y);
    if (orig) {
      ctx.font = SANS.replace("1px", "36px").replace("bold", "500"); ctx.fillStyle = "rgba(255,255,255,.6)";
      const os = `原價 NT$${orig.toLocaleString()}`;
      ctx.fillText(os, 64, y - 70);
      const ow = ctx.measureText(os).width;
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(64, y - 82); ctx.lineTo(64 + ow, y - 82); ctx.stroke();
    }
    y -= (orig ? 150 : 110);
    // 行程資訊
    ctx.font = SANS.replace("1px", "36px").replace("bold", "500"); ctx.fillStyle = accent;
    ctx.fillText(`${tour.destination}　${days}天${days - 1}夜　${fmtDate(tour.start_date)} 出發`, 64, y);
    y -= 22;
    // 標題（serif 風格，往上排）
    ctx.font = `900 76px "Noto Serif TC","PingFang TC",serif`; ctx.fillStyle = "#fff";
    const lines = wrapText(ctx, tour.name, W - 120);
    for (const ln of lines.reverse()) { y -= 90; ctx.fillText(ln, 60, y + 76); }
  }, [tour, highlights, cash, orig, days]);

  // 生成三張卡
  const genCards = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const imgs: (HTMLImageElement | null)[] = [];
      for (let i = 0; i < STYLES.length; i++) {
        const url = cleanPhotos[i % Math.max(cleanPhotos.length, 1)];
        try { imgs.push(url ? await loadImg(url) : null); } catch { imgs.push(null); }
      }
      const out: string[] = [];
      for (let i = 0; i < STYLES.length; i++) {
        const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d")!;
        drawCard(ctx, imgs[i], STYLES[i].accent);
        out.push(cv.toDataURL("image/jpeg", 0.92));
      }
      setCards(out);
    } catch { setErr("產生圖片失敗，請重試"); }
    finally { setBusy(false); }
  }, [cleanPhotos, drawCard]);

  useEffect(() => { if (open && tab === "image" && cards.length === 0) genCards(); }, [open, tab, cards.length, genCards]);
  useEffect(() => { if (!open) { setCards([]); setVideoUrl(""); setVProgress(0); } }, [open]);

  // ── 生成短影片（照片輪播 + 文字，WebM）─────────────────────────────────────────
  const makeVideo = async () => {
    setMaking(true); setErr(""); setVideoUrl(""); setVProgress(0);
    try {
      const pick = cleanPhotos.slice(0, 5);
      if (pick.length === 0) { setErr("沒有可用的照片"); setMaking(false); return; }
      const imgs = (await Promise.allSettled(pick.map(loadImg)))
        .filter(r => r.status === "fulfilled").map(r => (r as PromiseFulfilledResult<HTMLImageElement>).value);
      if (imgs.length === 0) { setErr("照片載入失敗"); setMaking(false); return; }

      const cv = vCanvas.current!; cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d")!;
      const mimes = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
      const mime = mimes.find(m => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
      if (!mime) { setErr("此瀏覽器不支援影片錄製，請改用 Chrome"); setMaking(false); return; }
      const stream = cv.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise<void>(res => { rec.onstop = () => res(); });
      rec.start();

      const perScene = 3000, fade = 600, total = imgs.length * perScene;
      const drawScene = (img: HTMLImageElement, p: number, alpha = 1) => {
        const zoom = 1.06 + 0.12 * p;
        const w = W * zoom, h = H * zoom;
        ctx.globalAlpha = alpha;
        coverDraw(ctx, img, (W - w) / 2, (H - h) / 2, w, h);
        ctx.globalAlpha = 1;
      };
      const overlay = () => {
        let g = ctx.createLinearGradient(0, H * 0.5, 0, H);
        g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.88)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        g = ctx.createLinearGradient(0, 0, 0, 180);
        g.addColorStop(0, "rgba(0,0,0,.45)"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, 180);
        ctx.textBaseline = "top"; ctx.font = SANS.replace("1px", "34px"); ctx.fillStyle = "rgba(255,255,255,.95)";
        ctx.fillText("暖心旅行社 ✈ 限額揪團中", 60, 56);
        ctx.textBaseline = "alphabetic";
        ctx.font = `900 70px "Noto Serif TC","PingFang TC",serif`; ctx.fillStyle = "#fff";
        const lines = wrapText(ctx, tour.name, W - 120).slice(0, 2);
        let yy = H - 230 - (lines.length - 1) * 82;
        for (const ln of lines) { ctx.fillText(ln, 60, yy); yy += 82; }
        ctx.font = SANS.replace("1px", "34px").replace("bold", "500"); ctx.fillStyle = "#f0b429";
        ctx.fillText(`${tour.destination}　${days}天${days - 1}夜　${fmtDate(tour.start_date)} 出發`, 60, H - 150);
        ctx.font = SANS.replace("1px", "60px"); ctx.fillStyle = "#f0b429";
        ctx.fillText(`NT$${cash.toLocaleString()} 起`, 60, H - 80);
      };

      const start = performance.now();
      await new Promise<void>(resolve => {
        const frame = (now: number) => {
          const t = now - start;
          if (t >= total) { resolve(); return; }
          const si = Math.min(imgs.length - 1, Math.floor(t / perScene));
          const st = t - si * perScene;
          const p = st / perScene;
          if (si > 0 && st < fade) { drawScene(imgs[si - 1], 1, 1); drawScene(imgs[si], p, st / fade); }
          else drawScene(imgs[si], p, 1);
          overlay();
          setVProgress(Math.round((t / total) * 100));
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      rec.stop();
      await done;
      const blob = new Blob(chunks, { type: mime });
      setVideoUrl(URL.createObjectURL(blob));
      setVProgress(100);
    } catch {
      setErr("影片生成失敗，請重試");
    } finally { setMaking(false); }
  };

  const copyText = async () => {
    try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };
  const dl = (url: string, name: string) => {
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Megaphone className="w-5 h-5 text-orange-500" /> 揪團分享工具</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pt-3 flex gap-1 shrink-0">
          <button onClick={() => setTab("image")} className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-t-lg font-medium ${tab === "image" ? "bg-orange-50 text-orange-700 border-b-2 border-orange-500" : "text-slate-500"}`}><ImageIcon className="w-4 h-4" /> 行銷圖片</button>
          <button onClick={() => setTab("video")} className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-t-lg font-medium ${tab === "video" ? "bg-orange-50 text-orange-700 border-b-2 border-orange-500" : "text-slate-500"}`}><Video className="w-4 h-4" /> 短影片</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {err && <p className="text-xs text-red-500">{err}</p>}

          {tab === "image" && (
            <>
              {busy && cards.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400"><Loader2 className="w-7 h-7 animate-spin text-orange-500" /><span className="text-sm">產生行銷圖中…</span></div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {cards.map((src, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                        <img src={src} alt={STYLES[i].name} className="w-full" />
                      </div>
                      <button onClick={() => dl(src, `${tour.name}-${STYLES[i].name}.jpg`)}
                        className="w-full flex items-center justify-center gap-1 text-xs py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors">
                        <Download className="w-3.5 h-3.5" /> {STYLES[i].name}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "video" && (
            <div className="space-y-3">
              <canvas ref={vCanvas} className="hidden" />
              {!videoUrl ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/40">
                  {making ? (
                    <>
                      <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                      <span className="text-sm text-slate-600">生成短影片中… {vProgress}%</span>
                      <div className="w-48 h-1.5 bg-orange-100 rounded-full overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${vProgress}%` }} /></div>
                    </>
                  ) : (
                    <>
                      <Video className="w-10 h-10 text-orange-400" />
                      <button onClick={makeVideo} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">生成 15 秒短影片</button>
                      <p className="text-[11px] text-slate-400 text-center max-w-xs">用行程照片做成輪播短片（含行程資訊與價格）。生成需數秒，請勿切換分頁。</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <video src={videoUrl} controls className="w-full rounded-xl border border-slate-200" />
                  <div className="flex gap-2">
                    <button onClick={() => dl(videoUrl, `${tour.name}-揪團短片.webm`)} className="flex-1 flex items-center justify-center gap-1.5 text-sm py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"><Download className="w-4 h-4" /> 下載影片</button>
                    <button onClick={makeVideo} className="text-sm px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">重新生成</button>
                  </div>
                  <p className="text-[11px] text-slate-400">影片為 WebM 格式；若 LINE 無法直接預覽，可先下載再上傳，或用手機相簿轉存。</p>
                </div>
              )}
            </div>
          )}

          {/* LINE 文案 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-500">LINE 揪團文案</span>
              <button onClick={copyText} className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium">
                {copied ? <><CheckCircle2 className="w-3.5 h-3.5" /> 已複製</> : <><Copy className="w-3.5 h-3.5" /> 複製文案</>}
              </button>
            </div>
            <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">{shareText}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
