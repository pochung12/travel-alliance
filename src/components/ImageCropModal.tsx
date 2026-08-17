"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Crop, RotateCcw, X } from "lucide-react";

type Rect = { x: number; y: number; w: number; h: number };
type Drag = { mode: "move" | "nw" | "ne" | "sw" | "se"; startX: number; startY: number; start: Rect };

export default function ImageCropModal({ image, title = "裁切證件照片", onCancel, onConfirm }: {
  image: string; title?: string; onCancel: () => void; onConfirm: (cropped: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const rectRef = useRef<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  const dragRef = useRef<Drag | null>(null);
  const [rect, setRect] = useState<Rect>(rectRef.current);
  const [ready, setReady] = useState(false);

  const updateRect = (next: Rect) => {
    rectRef.current = next;
    setRect(next);
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.round(box.width));
    const height = Math.max(320, Math.round(box.height));
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const ox = (width - dw) / 2;
    const oy = (height - dh) / 2;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, ox, oy, dw, dh);
    const r = rectRef.current;
    const x = ox + r.x * dw, y = oy + r.y * dh, w = r.w * dw, h = r.h * dh;
    ctx.fillStyle = "rgba(2,6,23,.62)";
    ctx.fillRect(0, 0, width, y);
    ctx.fillRect(0, y + h, width, height - y - h);
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, width - x - w, h);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,.45)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(x + w * i / 3, y); ctx.lineTo(x + w * i / 3, y + h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + h * i / 3); ctx.lineTo(x + w, y + h * i / 3); ctx.stroke();
    }
    ctx.fillStyle = "#ffffff";
    [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(([hx,hy]) => {
      ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill();
    });
    canvas.dataset.geometry = JSON.stringify({ ox, oy, dw, dh });
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      updateRect({ x: .03, y: .03, w: .94, h: .94 });
      setReady(true);
      requestAnimationFrame(draw);
    };
    img.src = image;
  }, [image, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => { if (ready) draw(); }, [rect, ready, draw]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const g = JSON.parse(canvas.dataset.geometry || "{}") as { ox:number;oy:number;dw:number;dh:number };
    const b = canvas.getBoundingClientRect();
    return { x: ((e.clientX - b.left) - g.ox) / g.dw, y: ((e.clientY - b.top) - g.oy) / g.dh };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready) return;
    const p = point(e), r = rectRef.current, hit = .045;
    let mode: Drag["mode"] | null = null;
    if (Math.hypot(p.x-r.x,p.y-r.y)<hit) mode="nw";
    else if (Math.hypot(p.x-(r.x+r.w),p.y-r.y)<hit) mode="ne";
    else if (Math.hypot(p.x-r.x,p.y-(r.y+r.h))<hit) mode="sw";
    else if (Math.hypot(p.x-(r.x+r.w),p.y-(r.y+r.h))<hit) mode="se";
    else if (p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h) mode="move";
    if (!mode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode, startX:p.x, startY:p.y, start:{...r} };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current; if (!d) return;
    const p = point(e), dx=p.x-d.startX, dy=p.y-d.startY, min=.08;
    let {x,y,w,h}=d.start;
    if (d.mode==="move") { x=Math.max(0,Math.min(1-w,x+dx)); y=Math.max(0,Math.min(1-h,y+dy)); }
    if (d.mode.includes("w")) { const nx=Math.max(0,Math.min(x+w-min,x+dx)); w+=x-nx; x=nx; }
    if (d.mode.includes("e")) w=Math.max(min,Math.min(1-x,w+dx));
    if (d.mode.includes("n")) { const ny=Math.max(0,Math.min(y+h-min,y+dy)); h+=y-ny; y=ny; }
    if (d.mode.includes("s")) h=Math.max(min,Math.min(1-y,h+dy));
    updateRect({x,y,w,h});
  };

  const confirm = () => {
    const img = imageRef.current; if (!img) return;
    const r = rectRef.current;
    const sx=Math.round(r.x*img.naturalWidth), sy=Math.round(r.y*img.naturalHeight);
    const sw=Math.max(1,Math.round(r.w*img.naturalWidth)), sh=Math.max(1,Math.round(r.h*img.naturalHeight));
    const scale=Math.min(1,2400/Math.max(sw,sh));
    const out=document.createElement("canvas"); out.width=Math.round(sw*scale); out.height=Math.round(sh*scale);
    out.getContext("2d")!.drawImage(img,sx,sy,sw,sh,0,0,out.width,out.height);
    onConfirm(out.toDataURL("image/jpeg",.92));
  };

  return <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col" role="dialog" aria-modal="true">
    <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 border-b border-white/10 text-white">
      <div className="flex items-center gap-2 min-w-0"><Crop className="w-5 h-5 text-violet-400"/><div><p className="font-semibold text-sm truncate">{title}</p><p className="text-[11px] text-slate-400">拖曳框移動，拖曳四角調整範圍</p></div></div>
      <button onClick={onCancel} className="p-2 rounded-xl bg-white/10 hover:bg-white/20"><X className="w-5 h-5"/></button>
    </div>
    <div className="flex-1 min-h-0 p-2 sm:p-4"><canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={()=>dragRef.current=null} onPointerCancel={()=>dragRef.current=null}
      className="w-full h-full rounded-xl touch-none cursor-crosshair"/></div>
    <div className="shrink-0 flex gap-3 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-slate-900 border-t border-white/10">
      <button onClick={()=>updateRect({x:.03,y:.03,w:.94,h:.94})} className="flex-1 sm:flex-none inline-flex justify-center items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm"><RotateCcw className="w-4 h-4"/>重設</button>
      <button onClick={confirm} disabled={!ready} className="flex-[2] inline-flex justify-center items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-semibold text-sm"><Check className="w-4 h-4"/>套用裁切</button>
    </div>
  </div>;
}
