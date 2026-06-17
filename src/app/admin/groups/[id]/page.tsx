"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, Tour, TourStatus, Customer, CustomerTour, CustomPriceTier } from "@/lib/supabase";
import CostSpreadsheet from "@/components/CostSpreadsheet";
import PaymentsTab from "@/components/PaymentsTab";
import ItineraryTab from "@/components/ItineraryTab";
import FlightsTab from "@/components/FlightsTab";
import TourPageTab from "@/components/TourPageTab";
import TourNameGenerator from "@/components/TourNameGenerator";
import { ArrowLeft, Save, Trash2, UserPlus, X, Search, BedDouble, Pencil, UtensilsCrossed, SlidersHorizontal, GripVertical, Users, Printer, Plus, Link2, Copy, ExternalLink, CheckCheck, Loader2, ChevronDown, Eye, EyeOff } from "lucide-react";

// ─── Meal options ──────────────────────────────────────────────────────────────
const MEAL_OPTIONS = [
  { key: "蛋奶素", color: "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300 border-lime-200 dark:border-lime-700" },
  { key: "全素",   color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-700" },
  { key: "不吃羊", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-700" },
  { key: "不吃牛", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-700" },
  { key: "不吃豬", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-700" },
];
import Link from "next/link";

// ─── Participant column config ─────────────────────────────────────────────────
type PartCol = { key: string; label: string; visible: boolean };
const PART_COLS_DEFAULT: PartCol[] = [
  { key: "phone",            label: "電話",      visible: true  },
  { key: "email",            label: "Email",     visible: false },
  { key: "passport",         label: "護照號碼",   visible: false },
  { key: "passport_expiry",  label: "護照效期",   visible: false },
  { key: "taibao_number",    label: "台胞證號碼", visible: false },
  { key: "taibao_expiry",    label: "台胞證效期", visible: false },
  { key: "deposit_amount",   label: "訂金",      visible: true  },
  { key: "balance_amount",   label: "尾款",      visible: true  },
  { key: "meal_preference",  label: "餐食偏好",   visible: true  },
  { key: "room_number",      label: "房號",      visible: true  },
];

// ─── Participant type config ───────────────────────────────────────────────────
const PARTICIPANT_TYPES = [
  { key: "adult",     label: "成人",   icon: "👤",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-700" },
  { key: "tour_only", label: "只參團", icon: "🧳",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 border border-teal-200 dark:border-teal-700" },
  { key: "child",     label: "兒童",   icon: "🧒",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-700" },
  { key: "infant",    label: "嬰兒",   icon: "👶",
    badge: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300 border border-pink-200 dark:border-pink-700" },
] as const;

// ─── Price tier table ─────────────────────────────────────────────────────────
const PRICE_TIERS: {
  key: string; label: string; icon: string;
  paxKey:   keyof Tour;
  priceKey: keyof Tour;
}[] = [
  { key:"adult",     label:"成人",   icon:"👤", paxKey:"pax_adult",     priceKey:"selling_price"   },
  { key:"tour_only", label:"只參團", icon:"🧳", paxKey:"pax_tour_only", priceKey:"price_tour_only" },
  { key:"child",     label:"兒童",   icon:"🧒", paxKey:"pax_child",     priceKey:"price_child"     },
  { key:"infant",    label:"嬰兒",   icon:"👶", paxKey:"pax_infant",    priceKey:"price_infant"    },
];

const STATUS_OPTIONS: { value: TourStatus; label: string }[] = [
  { value: "planning",  label: "規劃中" },
  { value: "confirmed", label: "已確認" },
  { value: "ongoing",   label: "進行中" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
  { value: "settled",   label: "已結團" },
];

const STATUS_COLOR: Record<string, string> = {
  planning:"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  confirmed:"bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  ongoing:"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  completed:"bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  cancelled:"bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  settled:"bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

const input = "w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400";

type BulkPreviewEntry = { name: string; existing: Customer | null; inTour: boolean; selected: boolean };

const COL_WIDTHS_DEFAULT: Record<string, number> = {
  name: 112, type_badge: 80,
  phone: 120, email: 160, passport: 112, passport_expiry: 96,
  taibao_number: 112, taibao_expiry: 96,
  deposit_amount: 110, balance_amount: 110,
  meal_preference: 112, room_number: 112,
};

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [tour, setTour]               = useState<Tour | null>(null);
  const [form, setForm]               = useState<Partial<Tour>>({});
  const [surchargeMode, setSurchargeMode] = useState<"percent" | "amount">("percent");
  const [participants, setParticipants] = useState<(CustomerTour & { customer: Customer })[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCids, setSelectedCids] = useState<Set<string>>(new Set());
  const [addSearch, setAddSearch]       = useState("");
  const [saving, setSaving]            = useState(false);
  const [activeTab, setActiveTab]      = useState<"info"|"costs"|"payments"|"participants"|"flights"|"itin_c"|"itin_t"|"webpage">("info");
  const [editingRoomId, setEditingRoomId] = useState<string|null>(null);
  const [roomInput,     setRoomInput]     = useState("");
  const [mealPickerId,  setMealPickerId]  = useState<string|null>(null);
  // CRM 標籤（用於加入旅客 Modal）
  const [custLabels,       setCustLabels]       = useState<Record<string, { id: string; name: string; color: string }[]>>({});
  const [allCrmLabels,     setAllCrmLabels]     = useState<{ id: string; name: string; color: string }[]>([]);
  const [modalFilterLabel, setModalFilterLabel] = useState<string|null>(null);
  const [modalSort,        setModalSort]        = useState<"name"|"labels">("name");
  // 收付款總計（從 tour_payments 載入，用於顯示聯動）
  const [payTotals, setPayTotals] = useState<{ deposit: number; balance: number }>({ deposit: 0, balance: 0 });
  // 財務三卡片用的費用試算 / 已付支出
  const [financials, setFinancials] = useState<{ costsTotal: number; expensePaid: number }>({ costsTotal: 0, expensePaid: 0 });
  // 完整收付款紀錄（含 customer_ids，用於旅客 tab 自動計算訂金/尾款）
  const [tourPayments, setTourPayments] = useState<{ id: string; type: string; category: string; amount: number; customer_ids: string[] }[]>([]);
  // 訂金/尾款 inline edit
  const [editingAmtId,   setEditingAmtId]   = useState<string|null>(null);
  const [editingAmtField, setEditingAmtField] = useState<"deposit_amount"|"balance_amount"|null>(null);
  const [amtInput,       setAmtInput]       = useState("");
  // 餐食 picker 固定定位
  const [mealPickerRect, setMealPickerRect] = useState<DOMRect | null>(null);
  // 身份類型 picker
  const [typePickerId,   setTypePickerId]   = useState<string|null>(null);
  const [typePickerRect, setTypePickerRect] = useState<DOMRect | null>(null);
  // 旅客搜尋
  const [partSearch,    setPartSearch]    = useState("");
  // 欄位設定
  const [partCols,      setPartCols]      = useState<PartCol[]>(PART_COLS_DEFAULT);
  const [showColSettings, setShowColSettings] = useState(false);
  const [dragColIdx,    setDragColIdx]    = useState<number | null>(null);
  // 旅客排序
  const [rowOrder,      setRowOrder]      = useState<string[]>([]);
  const [dragPartIdx,   setDragPartIdx]   = useState<number | null>(null);
  // 列印名單
  const [showPrintMenu,   setShowPrintMenu]   = useState(false);
  // 欄位寬度（可拖曳調整）
  const [colWidths, setColWidths] = useState<Record<string, number>>(COL_WIDTHS_DEFAULT);
  const resizeDrag = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const startResize = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startW = colWidths[key] ?? 112;
    resizeDrag.current = { key, startX: e.clientX, startW };
    const onMove = (ev: MouseEvent) => {
      if (!resizeDrag.current) return;
      const w = Math.max(60, resizeDrag.current.startW + ev.clientX - resizeDrag.current.startX);
      setColWidths(p => ({ ...p, [resizeDrag.current!.key]: w }));
    };
    const onUp = () => {
      resizeDrag.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [colWidths]);

  // 批量輸入旅客
  const [showBulkModal,   setShowBulkModal]   = useState(false);
  const [bulkText,        setBulkText]        = useState("");
  const [bulkSubmitting,  setBulkSubmitting]  = useState(false);
  const [bulkPreview,     setBulkPreview]     = useState<BulkPreviewEntry[]>([]);
  const [bulkParsed,      setBulkParsed]      = useState(false);
  // 線上報名表連結
  const [showRegisterModal,  setShowRegisterModal]  = useState(false);
  const [registerLinkCopied, setRegisterLinkCopied] = useState(false);
  const [shortUrl,           setShortUrl]           = useState<string | null>(null);
  const [shortLoading,       setShortLoading]       = useState(false);
  const [shortCopied,        setShortCopied]        = useState(false);
  // 文章綁定
  const [articleOpen,        setArticleOpen]        = useState(false);
  const [allBlogPosts,       setAllBlogPosts]       = useState<{ id: string; title: string; cover_image: string; category: string; published_at: string | null }[]>([]);
  const [linkedPostIds,      setLinkedPostIds]      = useState<string[]>([]);
  const [articleLoading,     setArticleLoading]     = useState(false);
  const [articleSaving,      setArticleSaving]      = useState(false);

  const loadTour = async () => {
    const { data } = await supabase.from("tours").select("*").eq("id", id).single();
    if (!data) { router.push("/admin/groups"); return; }
    setTour(data);
    setForm(data);
    setSurchargeMode((data.card_surcharge_amount || 0) > 0 ? "amount" : "percent");
  };

  const loadParticipants = async () => {
    const { data } = await supabase
      .from("customer_tours")
      .select("*, customer:customers(*)")
      .eq("tour_id", id);
    const loaded = (data || []) as (CustomerTour & { customer: Customer })[];
    setParticipants(loaded);
    // 從 localStorage 恢復自訂排序
    const saved = localStorage.getItem(`ta_part_order_${id}`);
    if (saved) {
      try {
        const arr: string[] = JSON.parse(saved);
        const merged = [
          ...arr.filter(oid => loaded.find(p => p.id === oid)),
          ...loaded.filter(p => !arr.includes(p.id)).map(p => p.id),
        ];
        setRowOrder(merged);
        localStorage.setItem(`ta_part_order_${id}`, JSON.stringify(merged));
      } catch { setRowOrder(loaded.map(p => p.id)); }
    } else {
      setRowOrder(loaded.map(p => p.id));
    }
  };

  const loadPayTotals = async () => {
    const [{ data: pays }, { data: costs }] = await Promise.all([
      supabase.from("tour_payments").select("id,type,category,amount,customer_ids").eq("tour_id", id),
      supabase.from("tour_costs").select("unit_price,quantity").eq("tour_id", id),
    ]);
    let deposit = 0, balance = 0, expensePaid = 0;
    (pays || []).forEach((r: { type: string; category: string; amount: number }) => {
      if (r.type === "income") {
        if (r.category === "deposit") deposit += r.amount;
        else if (r.category === "balance") balance += r.amount;
      } else {
        expensePaid += r.amount;
      }
    });
    const costsTotal = (costs || []).reduce(
      (s: number, r: { unit_price: number; quantity: number }) => s + (r.unit_price * r.quantity), 0
    );
    setPayTotals({ deposit, balance });
    setFinancials({ costsTotal, expensePaid });
    setTourPayments((pays || []) as { id: string; type: string; category: string; amount: number; customer_ids: string[] }[]);
  };

  // 從 localStorage 載入欄位設定
  useEffect(() => {
    const saved = localStorage.getItem("ta_part_cols");
    if (saved) {
      try {
        const parsed: PartCol[] = JSON.parse(saved);
        const merged = PART_COLS_DEFAULT.map(def => {
          const found = parsed.find(p => p.key === def.key);
          return found !== undefined ? { ...def, visible: found.visible } : def;
        });
        const ordered: PartCol[] = [
          ...parsed.filter(p => merged.find(m => m.key === p.key)).map(p => merged.find(m => m.key === p.key)!),
          ...merged.filter(m => !parsed.find(p => p.key === m.key)),
        ];
        setPartCols(ordered);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    loadTour();
    loadParticipants();
    loadPayTotals();
    // 旅客清單 + CRM 標籤 並行載入
    Promise.all([
      supabase.from("customers").select("id,name,phone,email,meal_preference").order("name"),
      supabase.from("crm_labels").select("*"),
      supabase.from("customer_labels").select("customer_id,label_id"),
    ]).then(([{ data: custs }, { data: labels }, { data: cl }]) => {
      setAllCustomers((custs || []) as Customer[]);
      const labelList = (labels || []) as { id: string; name: string; color: string }[];
      setAllCrmLabels(labelList);
      const map: Record<string, { id: string; name: string; color: string }[]> = {};
      (cl || []).forEach((row: { customer_id: string; label_id: string }) => {
        const label = labelList.find(l => l.id === row.label_id);
        if (label) {
          if (!map[row.customer_id]) map[row.customer_id] = [];
          map[row.customer_id].push(label);
        }
      });
      setCustLabels(map);
    });
  }, [id]);

  const saveTour = async () => {
    setSaving(true);
    const paxAdult    = form.pax_adult     || 0;
    const paxTourOnly = form.pax_tour_only || 0;
    const paxChild    = form.pax_child     || 0;
    const paxInfant   = form.pax_infant    || 0;
    const customPax   = (form.custom_price_tiers || []).reduce((s, ct) => s + ct.pax, 0);
    const totalPax    = paxAdult + paxTourOnly + paxChild + paxInfant + customPax;

    // 嘗試含新欄位的完整儲存
    const { error } = await supabase.from("tours").update({
      name: form.name, destination: form.destination,
      start_date: form.start_date, end_date: form.end_date,
      pax:             totalPax > 0 ? totalPax : (form.pax || 0),
      pax_adult:       paxAdult,
      pax_tour_only:   paxTourOnly,
      pax_child:       paxChild,
      pax_infant:      paxInfant,
      selling_price:   form.selling_price   || 0,
      original_price:  form.original_price  || 0,
      price_type:      form.price_type      || "",
      card_surcharge_percent: form.card_surcharge_percent || 0,
      card_surcharge_amount:  form.card_surcharge_amount  || 0,
      price_tour_only: form.price_tour_only || 0,
      price_child:     form.price_child     || 0,
      price_infant:    form.price_infant    || 0,
      custom_price_tiers: form.custom_price_tiers || [],
      deposit_per_person: form.deposit_per_person || 0,
      tip_per_day:  form.tip_per_day || 0,
      tip_included: !!form.tip_included,
      status: form.status, notes: form.notes,
    }).eq("id", id);

    if (error) {
      // 若 DB 尚未執行 migration（欄位不存在），降級改存已知欄位
      const isMissingCol = error.code === "42703"
        || error.message?.includes("does not exist")
        || error.message?.includes("schema cache")
        || error.message?.includes("Could not find");
      if (isMissingCol) {
        // 先嘗試含舊有自訂欄位（不含 deposit_per_person）的中間版本
        const { error: e2 } = await supabase.from("tours").update({
          name: form.name, destination: form.destination,
          start_date: form.start_date, end_date: form.end_date,
          pax:             totalPax > 0 ? totalPax : (form.pax || 0),
          pax_adult:       paxAdult,
          pax_tour_only:   paxTourOnly,
          pax_child:       paxChild,
          pax_infant:      paxInfant,
          selling_price:   form.selling_price   || 0,
          price_tour_only: form.price_tour_only || 0,
          price_child:     form.price_child     || 0,
          price_infant:    form.price_infant    || 0,
          custom_price_tiers: form.custom_price_tiers || [],
          status: form.status, notes: form.notes,
        }).eq("id", id);
        setSaving(false);
        if (e2) { alert("儲存失敗：" + e2.message); return; }
        alert("基本資料已儲存（部分新欄位尚未建立）。\n\n請在 Supabase SQL Editor 執行：\n\nALTER TABLE tours\n  ADD COLUMN IF NOT EXISTS deposit_per_person NUMERIC(10,2) NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS tip_per_day NUMERIC(10,2) NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS tip_included BOOLEAN NOT NULL DEFAULT false,\n  ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2) NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS price_type TEXT NOT NULL DEFAULT '',\n  ADD COLUMN IF NOT EXISTS card_surcharge_percent NUMERIC(6,2) NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS card_surcharge_amount NUMERIC(10,2) NOT NULL DEFAULT 0;");
        await loadTour();
        return;
      }
      setSaving(false);
      alert("儲存失敗：" + error.message);
      return;
    }
    setSaving(false);
    await loadTour();
  };

  const deleteTour = async () => {
    if (!confirm(`確定刪除「${tour?.name}」？此操作無法復原。`)) return;
    await supabase.from("tours").delete().eq("id", id);
    router.push("/admin/groups");
  };

  const toggleCid = (cid: string) => {
    const next = new Set(selectedCids);
    if (next.has(cid)) next.delete(cid); else next.add(cid);
    setSelectedCids(next);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setSelectedCids(new Set());
    setAddSearch("");
    setModalFilterLabel(null);
    setModalSort("name");
  };

  const addParticipants = async () => {
    if (selectedCids.size === 0) return;
    const rows = Array.from(selectedCids).map(cid => {
      const cust = allCustomers.find(c => c.id === cid);
      return {
        customer_id: cid,
        tour_id: id,
        status: "registered",
        paid_amount: 0,
        notes: "",
        participant_type: "adult",
        meal_preference: cust?.meal_preference || "",
      };
    });
    const { error } = await supabase.from("customer_tours").insert(rows);
    if (error) {
      alert("加入失敗：" + error.message);
      return;
    }
    closeAddModal();
    loadParticipants();
  };

  const removeParticipant = async (ctId: string) => {
    if (!confirm("移除此旅客？")) return;
    await supabase.from("customer_tours").delete().eq("id", ctId);
    loadParticipants();
  };

  const saveRoomNumber = async (ctId: string, room: string) => {
    setEditingRoomId(null);
    await supabase.from("customer_tours").update({ room_number: room.trim() }).eq("id", ctId);
    setParticipants(prev => prev.map(p => p.id===ctId ? {...p, room_number: room.trim()} : p));
  };

  const saveAmount = async (ctId: string, field: "deposit_amount" | "balance_amount", val: string) => {
    const num = parseInt(val.replace(/[^0-9]/g, ""), 10) || 0;
    await supabase.from("customer_tours").update({ [field]: num }).eq("id", ctId);
    setParticipants(prev => prev.map(p => p.id === ctId ? { ...p, [field]: num } : p));
    setEditingAmtId(null); setEditingAmtField(null); setAmtInput("");
  };

  const toggleMeal = async (ctId: string, option: string) => {
    const p = participants.find(x => x.id === ctId);
    if (!p) return;
    const current = (p.meal_preference || "").split(",").map(s => s.trim()).filter(Boolean);
    const next = current.includes(option)
      ? current.filter(m => m !== option)
      : [...current, option];
    const val = next.join(",");
    await supabase.from("customer_tours").update({ meal_preference: val }).eq("id", ctId);
    setParticipants(prev => prev.map(x => x.id===ctId ? {...x, meal_preference: val} : x));
  };

  const changeParticipantType = async (ctId: string, type: string) => {
    await supabase.from("customer_tours").update({ participant_type: type }).eq("id", ctId);
    setParticipants(prev => prev.map(x => x.id === ctId ? { ...x, participant_type: type } : x));
    setTypePickerId(null);
    setTypePickerRect(null);
  };

  const savePartCols = (cols: PartCol[]) => {
    setPartCols(cols);
    localStorage.setItem("ta_part_cols", JSON.stringify(cols));
  };

  const savePartOrder = (order: string[]) => {
    setRowOrder(order);
    localStorage.setItem(`ta_part_order_${id}`, JSON.stringify(order));
  };

  const closeBulkModal = () => {
    setShowBulkModal(false);
    setBulkText("");
    setBulkPreview([]);
    setBulkParsed(false);
  };

  const parseBulkNames = () => {
    const names = bulkText
      .split(/[\n,，、]/)
      .map(n => n.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const preview: BulkPreviewEntry[] = [];
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      const existing = allCustomers.find(c => c.name === name) || null;
      const inTour = existing ? participants.some(p => p.customer_id === existing.id) : false;
      preview.push({ name, existing, inTour, selected: !inTour });
    }
    setBulkPreview(preview);
    setBulkParsed(true);
  };

  const submitBulk = async () => {
    const toAdd = bulkPreview.filter(e => e.selected && !e.inTour);
    if (toAdd.length === 0) return;
    setBulkSubmitting(true);

    // 1. 新建 CRM 裡不存在的旅客
    const toCreate = toAdd.filter(e => !e.existing);
    let createdCustomers: Customer[] = [];
    if (toCreate.length > 0) {
      const newRecords = toCreate.map(e => ({
        name: e.name, phone: "", email: "",
        id_number: "", passport: "", passport_expiry: null,
        taibao_number: "", taibao_expiry: null,
        birthday: null, gender: "other" as const,
        address: "", emergency_contact: "", emergency_phone: "",
        notes: "", meal_preference: "",
        id_card_image: "", passport_image: "", taibao_image: "", name_en: "",
      }));
      const { data, error } = await supabase.from("customers").insert(newRecords).select();
      if (error) { alert("建立旅客失敗：" + error.message); setBulkSubmitting(false); return; }
      createdCustomers = (data || []) as Customer[];
    }

    // 2. 合併全部旅客 ID（已存在 + 新建）
    const allToAddIds = [
      ...toAdd.filter(e => e.existing).map(e => e.existing!.id),
      ...createdCustomers.map(c => c.id),
    ];

    // 3. 加入 customer_tours
    const rows = allToAddIds.map(cid => ({
      customer_id: cid,
      tour_id: id,
      status: "registered",
      paid_amount: 0,
      notes: "",
      participant_type: "adult",
      meal_preference: "",
    }));
    const { error: ctError } = await supabase.from("customer_tours").insert(rows);
    if (ctError) { alert("加入出團失敗：" + ctError.message); setBulkSubmitting(false); return; }

    setBulkSubmitting(false);
    closeBulkModal();
    // 重新載入旅客列表 + 更新所有旅客清單（含剛建立的新旅客）
    await loadParticipants();
    const { data: newCusts } = await supabase
      .from("customers").select("id,name,phone,email,meal_preference").order("name");
    setAllCustomers((newCusts || []) as Customer[]);
  };

  if (!tour) return (
    <div className="flex justify-center items-center h-64">
      <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const unjoined = allCustomers.filter(c => !participants.find(p => p.customer_id === c.id));

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5 max-w-5xl">
      {/* Back + title */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <Link href="/admin/groups" className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100 truncate">{tour.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {tour.destination && <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{tour.destination}</span>}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOR[tour.status]}`}>
                {STATUS_OPTIONS.find(s => s.value === tour.status)?.label}
              </span>
            </div>
          </div>
        </div>
        <button onClick={deleteTour} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors shrink-0 ml-2">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs — scrollable on mobile */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 gap-0.5 overflow-x-auto scrollbar-none">
        {([["info","基本資料"],["costs","費用試算"],["payments","收付款"],["participants","旅客"],["flights","✈️ 機票"],["itin_c","旅客行程"],["itin_t","同業行程"],["webpage","🌐 行程網頁"]] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 md:px-4 py-2.5 text-xs md:text-sm font-medium border-b-2 whitespace-nowrap transition-colors shrink-0 ${
              activeTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {label}
            {tab === "participants" && participants.length > 0 && (
              <span className="ml-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-full">
                {participants.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Info ── */}
      {activeTab === "info" && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 md:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className={lbl}>團名 *</label>
                <TourNameGenerator
                  currentName={form.name || ""}
                  destination={form.destination || ""}
                  days={
                    form.start_date && form.end_date
                      ? Math.round((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000) + 1
                      : 0
                  }
                  onPick={n => setForm({ ...form, name: n })}
                />
              </div>
              <input className={input} value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>目的地</label>
              <input className={input} value={form.destination || ""} onChange={e => setForm({...form, destination: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>狀態</label>
              <select className={input} value={form.status} onChange={e => setForm({...form, status: e.target.value as TourStatus})}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>出發日</label>
              <input type="date" className={input} value={form.start_date || ""} onChange={e => setForm({...form, start_date: e.target.value})} />
            </div>
            <div>
              <label className={lbl}>回程日</label>
              <input type="date" className={input} value={form.end_date || ""} onChange={e => setForm({...form, end_date: e.target.value})} />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <label className={lbl}>各類別人數與售價</label>
              <div className="mt-1 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* header */}
                <div className="grid items-center bg-slate-50 dark:bg-slate-700/40 px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide gap-x-2"
                  style={{ gridTemplateColumns: "5.5rem 1fr 0.75rem 1fr 5.5rem 1.5rem 1.5rem" }}>
                  <span>類別</span>
                  <span className="text-center">人數</span>
                  <span />
                  <span className="text-center">售價 (NT$)</span>
                  <span className="text-right">小計</span>
                  <span className="text-center" title="在前台隱藏">前台</span>
                  <span />
                </div>
                {/* fixed tier rows */}
                {PRICE_TIERS.map(t => {
                  const paxVal   = (form[t.paxKey]   as number) || 0;
                  const priceVal = (form[t.priceKey] as number) || 0;
                  const sub      = paxVal * priceVal;
                  return (
                    <div key={t.key}
                      className="grid items-center px-3 py-2 border-t border-slate-100 dark:border-slate-700/50 gap-x-2"
                      style={{ gridTemplateColumns: "5.5rem 1fr 0.75rem 1fr 5.5rem 1.5rem" }}>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.icon} {t.label}</span>
                      <input type="number" min="0" placeholder="0"
                        className="w-full text-center border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={paxVal || ""}
                        onChange={e => setForm({ ...form, [t.paxKey]: +e.target.value })} />
                      <span className="text-center text-slate-300 dark:text-slate-600 text-xs select-none">×</span>
                      <input type="number" min="0" placeholder="0"
                        className="w-full text-right border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={priceVal || ""}
                        onChange={e => setForm({ ...form, [t.priceKey]: +e.target.value })} />
                      <span className={`text-right text-xs font-medium tabular-nums ${
                        sub > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600"
                      }`}>
                        {sub > 0 ? `NT$${sub.toLocaleString()}` : "—"}
                      </span>
                      <span />
                      <span />
                    </div>
                  );
                })}
                {/* custom tier rows */}
                {(form.custom_price_tiers || []).map((ct, idx) => {
                  const sub = ct.pax * ct.price;
                  const updateCustomTier = (patch: Partial<CustomPriceTier>) => {
                    const tiers = [...(form.custom_price_tiers || [])];
                    tiers[idx] = { ...tiers[idx], ...patch };
                    setForm({ ...form, custom_price_tiers: tiers });
                  };
                  const removeCustomTier = () => {
                    const tiers = (form.custom_price_tiers || []).filter((_, i) => i !== idx);
                    setForm({ ...form, custom_price_tiers: tiers });
                  };
                  const autoHidden = ["領隊", "優待"].some(k => (ct.label || "").includes(k));
                  const isHidden = autoHidden || !!ct.hidden;
                  return (
                    <div key={ct.id}
                      className="grid items-center px-3 py-2 border-t border-slate-100 dark:border-slate-700/50 gap-x-2"
                      style={{ gridTemplateColumns: "5.5rem 1fr 0.75rem 1fr 5.5rem 1.5rem 1.5rem" }}>
                      <input
                        type="text"
                        placeholder="類別名稱"
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={ct.label}
                        onChange={e => updateCustomTier({ label: e.target.value })}
                      />
                      <input type="number" min="0" placeholder="0"
                        className="w-full text-center border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={ct.pax || ""}
                        onChange={e => updateCustomTier({ pax: +e.target.value })} />
                      <span className="text-center text-slate-300 dark:text-slate-600 text-xs select-none">×</span>
                      <input type="number" min="0" placeholder="0"
                        className="w-full text-right border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={ct.price || ""}
                        onChange={e => updateCustomTier({ price: +e.target.value })} />
                      <span className={`text-right text-xs font-medium tabular-nums ${
                        sub > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600"
                      }`}>
                        {sub > 0 ? `NT$${sub.toLocaleString()}` : "—"}
                      </span>
                      <button
                        onClick={() => { if (!autoHidden) updateCustomTier({ hidden: !ct.hidden }); }}
                        className={`flex items-center justify-center w-5 h-5 rounded-full transition-colors ${
                          autoHidden
                            ? "text-rose-400 cursor-not-allowed"
                            : isHidden
                              ? "text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/40"
                              : "text-slate-300 dark:text-slate-600 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                        }`}
                        title={
                          autoHidden
                            ? "「領隊」「優待」類別一律在前台隱藏"
                            : isHidden
                              ? "目前在前台隱藏，點擊改為顯示"
                              : "在前台隱藏此類別價格"
                        }
                      >
                        {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={removeCustomTier}
                        className="flex items-center justify-center w-5 h-5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/40 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
                        title="刪除此類別"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
                {/* add custom tier button */}
                <div className="border-t border-dashed border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => {
                      const newTier: CustomPriceTier = {
                        id: crypto.randomUUID(),
                        label: "",
                        pax: 0,
                        price: 0,
                      };
                      setForm({ ...form, custom_price_tiers: [...(form.custom_price_tiers || []), newTier] });
                    }}
                    className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    新增類別
                  </button>
                </div>
                {/* total row */}
                {(() => {
                  const fixedPax = PRICE_TIERS.reduce((s, t) => s + ((form[t.paxKey] as number) || 0), 0);
                  const fixedRev = PRICE_TIERS.reduce((s, t) =>
                    s + ((form[t.paxKey] as number) || 0) * ((form[t.priceKey] as number) || 0), 0);
                  const customPax = (form.custom_price_tiers || []).reduce((s, ct) => s + ct.pax, 0);
                  const customRev = (form.custom_price_tiers || []).reduce((s, ct) => s + ct.pax * ct.price, 0);
                  const totalPax = fixedPax + customPax;
                  const totalRev = fixedRev + customRev;
                  return (
                    <div className="grid items-center px-3 py-2.5 bg-slate-50 dark:bg-slate-700/30 border-t border-slate-200 dark:border-slate-700 gap-x-2"
                      style={{ gridTemplateColumns: "5.5rem 1fr 0.75rem 1fr 5.5rem 1.5rem" }}>
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">合計</span>
                      <span className="text-center text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">{totalPax} 人</span>
                      <span /><span />
                      <span className={`text-right text-sm font-bold tabular-nums ${
                        totalRev > 0 ? "text-blue-600 dark:text-blue-400" : "text-slate-300 dark:text-slate-600"
                      }`}>
                        {totalRev > 0 ? `NT$${totalRev.toLocaleString()}` : "—"}
                      </span>
                      <span />
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="col-span-2">
              <label className={lbl}>團費原價（行銷劃線價）</label>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <div className="relative w-44">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">NT$</span>
                  <input type="number" min="0"
                    className="w-full pl-9 pr-3 border border-slate-200 dark:border-slate-600 rounded-lg py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right"
                    placeholder="例：45800"
                    value={form.original_price || ""}
                    onChange={e => setForm({ ...form, original_price: +e.target.value })} />
                </div>
                {(() => {
                  const orig = form.original_price || 0;
                  const now  = form.selling_price || 0;
                  if (orig > 0 && orig <= now) {
                    return <span className="text-xs text-orange-500">原價需大於成人售價（現價 NT${now.toLocaleString()}）才會顯示折扣</span>;
                  }
                  if (orig > now && now > 0) {
                    const off = Math.round((now / orig) * 100) / 10;
                    return (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">
                        前台顯示：<span className="line-through text-slate-400">NT${orig.toLocaleString()}</span> →
                        <span className="font-semibold"> NT${now.toLocaleString()}</span>
                        ・省 NT${(orig - now).toLocaleString()}（約 {off.toFixed(1).replace(/\.0$/, "")} 折）
                      </span>
                    );
                  }
                  return <span className="text-xs text-slate-400 dark:text-slate-500">填 0 或留空則不顯示折扣；現價以「成人售價」為準</span>;
                })()}
              </div>
            </div>
            <div className="col-span-2">
              <label className={lbl}>團費標示（前台價格旁顯示）</label>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 p-0.5 rounded-lg">
                  {([["", "不標示"], ["cash", "💵 現金價"], ["card", "💳 刷卡價"]] as const).map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => setForm({ ...form, price_type: val })}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        (form.price_type || "") === val
                          ? (val === "cash" ? "bg-emerald-600 text-white shadow-sm" : val === "card" ? "bg-sky-600 text-white shadow-sm" : "bg-white dark:bg-slate-600 text-slate-700 dark:text-white shadow-sm")
                          : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {(form.price_type === "cash") ? "前台價格旁顯示「現金價」標籤"
                    : (form.price_type === "card") ? "前台價格旁顯示「刷卡價」標籤"
                    : "前台不顯示現金/刷卡標示"}
                </span>
              </div>
            </div>
            <div className="col-span-2">
              <label className={lbl}>刷卡加價（以團費為現金價，前台另顯示刷卡價）</label>
              <div className="mt-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 加價方式 */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 p-0.5 rounded-lg">
                    <button type="button"
                      onClick={() => { setSurchargeMode("percent"); setForm({ ...form, card_surcharge_amount: 0 }); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${surchargeMode === "percent" ? "bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm" : "text-slate-500"}`}>
                      ％ 百分比
                    </button>
                    <button type="button"
                      onClick={() => { setSurchargeMode("amount"); setForm({ ...form, card_surcharge_percent: 0 }); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${surchargeMode === "amount" ? "bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm" : "text-slate-500"}`}>
                      NT$ 固定金額
                    </button>
                  </div>
                  {surchargeMode === "percent" ? (
                    <div className="relative w-28">
                      <input type="number" min="0" step="0.1"
                        className="w-full pr-7 pl-3 border border-slate-200 dark:border-slate-600 rounded-lg py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right"
                        placeholder="2"
                        value={form.card_surcharge_percent || ""}
                        onChange={e => setForm({ ...form, card_surcharge_percent: +e.target.value, card_surcharge_amount: 0 })} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">%</span>
                    </div>
                  ) : (
                    <div className="relative w-36">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">NT$</span>
                      <input type="number" min="0"
                        className="w-full pl-9 pr-3 border border-slate-200 dark:border-slate-600 rounded-lg py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right"
                        placeholder="例：900"
                        value={form.card_surcharge_amount || ""}
                        onChange={e => setForm({ ...form, card_surcharge_amount: +e.target.value, card_surcharge_percent: 0 })} />
                    </div>
                  )}
                  {/* 建議 2% 一鍵套用 */}
                  <button type="button"
                    onClick={() => { setSurchargeMode("percent"); setForm({ ...form, card_surcharge_percent: 2, card_surcharge_amount: 0 }); }}
                    className="text-xs px-2.5 py-1.5 border border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                    💡 建議 +2%
                  </button>
                </div>
                {(() => {
                  const cash = form.selling_price || 0;
                  const amt  = form.card_surcharge_amount || 0;
                  const pct  = form.card_surcharge_percent || 0;
                  const fee  = amt > 0 ? amt : (pct > 0 ? Math.round(cash * pct / 100) : 0);
                  if (fee <= 0 || cash <= 0) {
                    return <p className="text-xs text-slate-400 dark:text-slate-500">填 0 則前台不顯示刷卡價；建議刷卡加收 2% 手續費</p>;
                  }
                  const card = cash + fee;
                  const pctShow = amt > 0 ? ((fee / cash) * 100).toFixed(1).replace(/\.0$/, "") : pct;
                  return (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      前台顯示：現金價 <span className="font-semibold">NT${cash.toLocaleString()}</span> ・ 刷卡價 <span className="font-semibold">NT${card.toLocaleString()}</span>（+{pctShow}%，手續費 NT${fee.toLocaleString()}）
                    </p>
                  );
                })()}
              </div>
            </div>
            <div className="col-span-2">
              <label className={lbl}>訂金金額（每人）</label>
              <div className="flex items-center gap-2 mt-1">
                <div className="relative w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">NT$</span>
                  <input type="number" min="0" placeholder="0"
                    className="w-full pl-9 pr-3 border border-slate-200 dark:border-slate-600 rounded-lg py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right"
                    value={form.deposit_per_person || ""}
                    onChange={e => setForm({ ...form, deposit_per_person: +e.target.value })} />
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">不含招待／領隊等售價為 0 的名額</span>
              </div>
              {(() => {
                const freePax  = (form.custom_price_tiers || []).filter(ct => ct.price === 0).reduce((s, ct) => s + ct.pax, 0);
                const fixedPax = PRICE_TIERS.reduce((s, t) => s + ((form[t.paxKey] as number) || 0), 0);
                const customPax= (form.custom_price_tiers || []).reduce((s, ct) => s + ct.pax, 0);
                const totalPax = fixedPax + customPax;
                const payingPax = totalPax - freePax;
                const dep = form.deposit_per_person || 0;
                if (!dep || totalPax === 0) return null;
                return (
                  <p className="mt-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                    總應收訂金：NT${(dep * payingPax).toLocaleString()}（{dep.toLocaleString()} × {payingPax} 人）
                  </p>
                );
              })()}
            </div>
            <div className="col-span-2">
              <label className={lbl}>司機/導遊/領隊小費</label>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <div className="relative w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">NT$</span>
                  <input type="number" min="0" placeholder="0"
                    className="w-full pl-9 pr-12 border border-slate-200 dark:border-slate-600 rounded-lg py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right"
                    value={form.tip_per_day || ""}
                    onChange={e => setForm({ ...form, tip_per_day: +e.target.value })} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">/天</span>
                </div>
                {/* 前台標示切換 */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 p-0.5 rounded-lg">
                  <button type="button"
                    onClick={() => setForm({ ...form, tip_included: true })}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      form.tip_included
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}>
                    含於團費
                  </button>
                  <button type="button"
                    onClick={() => setForm({ ...form, tip_included: false })}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      !form.tip_included
                        ? "bg-orange-500 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}>
                    不含（另支付）
                  </button>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {(form.tip_per_day || 0) > 0
                    ? `前台將顯示：小費 NT$${(form.tip_per_day || 0).toLocaleString()}/天・${form.tip_included ? "已含於團費" : "未含，另行支付"}`
                    : "填 0 則前台不顯示小費資訊"}
                </span>
              </div>
            </div>
            <div className="col-span-2">
              <label className={lbl}>備註</label>
              <textarea className={input + " h-20 resize-none"} value={form.notes || ""}
                onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={saveTour} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors">
              <Save className="w-4 h-4" />
              {saving ? "儲存中…" : "儲存資料"}
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Costs ── */}
      {activeTab === "costs" && (
        <CostSpreadsheet
          tourId={id}
          pax={tour.pax}
          revenue={
            (tour.pax_adult     || 0) * (tour.selling_price   || 0) +
            (tour.pax_tour_only || 0) * (tour.price_tour_only || 0) +
            (tour.pax_child     || 0) * (tour.price_child     || 0) +
            (tour.pax_infant    || 0) * (tour.price_infant    || 0) +
            (tour.custom_price_tiers || []).reduce((s, ct) => s + ct.pax * ct.price, 0)
          }
        />
      )}

      {/* ── Tab: Payments ── */}
      {activeTab === "payments" && (
        <PaymentsTab
          tourId={id}
          pax={tour.pax}
          revenue={
            (tour.pax_adult     || 0) * (tour.selling_price   || 0) +
            (tour.pax_tour_only || 0) * (tour.price_tour_only || 0) +
            (tour.pax_child     || 0) * (tour.price_child     || 0) +
            (tour.pax_infant    || 0) * (tour.price_infant    || 0) +
            (tour.custom_price_tiers || []).reduce((s, ct) => s + ct.pax * ct.price, 0)
          }
          participants={participants}
          onChanged={loadPayTotals}
          onPaymentCustsChanged={(payId, newIds) => {
            // 直接更新 tourPayments state，不需重新 fetch DB
            setTourPayments(prev =>
              prev.map(p => p.id === payId ? { ...p, customer_ids: newIds } : p)
            );
          }}
        />
      )}

      {/* ── Tab: Participants ── */}
      {activeTab === "participants" && (() => {
        const ROOM_PALETTES = [
          { bar:"bg-blue-500",   bg:"bg-blue-50 dark:bg-blue-900/20",   badge:"bg-blue-500 text-white",   header:"text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60",   outer:"border-blue-300 dark:border-blue-600",   groupBg:"bg-blue-50 dark:bg-blue-900/20"   },
          { bar:"bg-emerald-500",bg:"bg-emerald-50 dark:bg-emerald-900/20",badge:"bg-emerald-500 text-white",header:"text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",outer:"border-emerald-300 dark:border-emerald-600",groupBg:"bg-emerald-50 dark:bg-emerald-900/20"},
          { bar:"bg-violet-500", bg:"bg-violet-50 dark:bg-violet-900/20", badge:"bg-violet-500 text-white", header:"text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800/60", outer:"border-violet-300 dark:border-violet-600", groupBg:"bg-violet-50 dark:bg-violet-900/20" },
          { bar:"bg-amber-500",  bg:"bg-amber-50 dark:bg-amber-900/20",   badge:"bg-amber-500 text-white",  header:"text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60",   outer:"border-amber-300 dark:border-amber-600",  groupBg:"bg-amber-50 dark:bg-amber-900/20"   },
          { bar:"bg-rose-500",   bg:"bg-rose-50 dark:bg-rose-900/20",     badge:"bg-rose-500 text-white",   header:"text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60",     outer:"border-rose-300 dark:border-rose-600",    groupBg:"bg-rose-50 dark:bg-rose-900/20"     },
          { bar:"bg-cyan-500",   bg:"bg-cyan-50 dark:bg-cyan-900/20",     badge:"bg-cyan-500 text-white",   header:"text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/60",     outer:"border-cyan-300 dark:border-cyan-600",    groupBg:"bg-cyan-50 dark:bg-cyan-900/20"     },
          { bar:"bg-pink-500",   bg:"bg-pink-50 dark:bg-pink-900/20",     badge:"bg-pink-500 text-white",   header:"text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800/60",     outer:"border-pink-300 dark:border-pink-600",    groupBg:"bg-pink-50 dark:bg-pink-900/20"     },
          { bar:"bg-teal-500",   bg:"bg-teal-50 dark:bg-teal-900/20",     badge:"bg-teal-500 text-white",   header:"text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60",     outer:"border-teal-300 dark:border-teal-600",    groupBg:"bg-teal-50 dark:bg-teal-900/20"     },
        ];

        // Room palette（依房號上色）
        const roomNums = Array.from(new Set(participants.map(p=>p.room_number).filter(Boolean))) as string[];
        const paletteMap = new Map(roomNums.map((r,i)=>[r, ROOM_PALETTES[i%ROOM_PALETTES.length]]));

        // 自訂順序列表
        const orderedParts = (() => {
          const base = (() => {
            if (rowOrder.length === 0) return participants;
            const mapped = rowOrder
              .map(pid => participants.find(p => p.id === pid))
              .filter((p): p is (CustomerTour & { customer: Customer }) => !!p);
            const extra = participants.filter(p => !rowOrder.includes(p.id));
            return [...mapped, ...extra];
          })();
          if (!partSearch.trim()) return base;
          const q = partSearch.trim().toLowerCase();
          return base.filter(p =>
            p.customer.name.toLowerCase().includes(q) ||
            (p.customer.name_en || "").toLowerCase().includes(q) ||
            (p.customer.phone || "").includes(q)
          );
        })();

        return (
          <div className="space-y-4">
            {/* header */}
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">報名旅客</h3>
                <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">{participants.length} 人</span>
                {roomNums.length>0 && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <BedDouble className="w-3 h-3" /> {roomNums.length} 間房
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* 旅客搜尋框 */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={partSearch}
                    onChange={e => setPartSearch(e.target.value)}
                    placeholder="搜尋姓名、電話…"
                    className="pl-7 pr-7 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-400 w-36 sm:w-44 transition-all"
                  />
                  {partSearch && (
                    <button
                      onClick={() => setPartSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {/* 欄位設定 */}
                <div className="relative">
                  <button
                    onClick={() => setShowColSettings(s => !s)}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                      showColSettings
                        ? "bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200"
                        : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                    }`}>
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>欄位</span>
                  </button>
                  {showColSettings && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowColSettings(false)} />
                      <div className="absolute right-0 top-full mt-2 z-20 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-3 min-w-[180px]">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-2 pb-2">顯示欄位 · 拖曳排序</p>
                        {partCols.map((col, idx) => (
                          <div key={col.key}
                            draggable
                            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragColIdx(idx); }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                              if (dragColIdx === null || dragColIdx === idx) return;
                              const next = [...partCols];
                              const [removed] = next.splice(dragColIdx, 1);
                              next.splice(idx, 0, removed);
                              savePartCols(next);
                              setDragColIdx(null);
                            }}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                              dragColIdx === idx
                                ? "bg-blue-50 dark:bg-blue-900/30"
                                : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                            }`}>
                            <GripVertical className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 cursor-grab flex-shrink-0" />
                            <input type="checkbox" checked={col.visible}
                              onChange={() => {
                                const next = partCols.map((c, i) => i === idx ? { ...c, visible: !c.visible } : c);
                                savePartCols(next);
                              }}
                              className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0" />
                            <span className="text-xs text-slate-700 dark:text-slate-300">{col.label}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {/* 按房號排序 */}
                {roomNums.length > 0 && (
                  <button
                    onClick={() => {
                      const sorted = [...orderedParts].sort((a, b) => {
                        const ra = a.room_number || "";
                        const rb = b.room_number || "";
                        if (!ra && !rb) return 0;
                        if (!ra) return 1;
                        if (!rb) return -1;
                        return ra.localeCompare(rb, undefined, { numeric: true });
                      });
                      savePartOrder(sorted.map(p => p.id));
                    }}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                    <BedDouble className="w-3.5 h-3.5" />
                    <span>排房號</span>
                  </button>
                )}
                {/* 列印名單 */}
                <div className="relative">
                  <button
                    onClick={() => setShowPrintMenu(s => !s)}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                      showPrintMenu
                        ? "bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200"
                        : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                    }`}>
                    <Printer className="w-3.5 h-3.5" />
                    <span>列印</span>
                  </button>
                  {showPrintMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowPrintMenu(false)} />
                      <div className="absolute right-0 top-full mt-2 z-20 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-1.5 min-w-[150px]">
                        {[
                          { layout: "full",     label: "完整名單",   desc: "A4 橫式，14欄" },
                          { layout: "payment",  label: "收付款狀態", desc: "A4 直式，金額" },
                          { layout: "boarding", label: "登機名單",   desc: "A4 橫式，精簡" },
                          { layout: "hotel",    label: "飯店名單",   desc: "A4 橫式，欄位可選" },
                        ].map(({ layout, label, desc }) => (
                          <button
                            key={layout}
                            onClick={() => {
                              const orderParam = rowOrder.length > 0
                                ? encodeURIComponent(JSON.stringify(rowOrder))
                                : encodeURIComponent(JSON.stringify(orderedParts.map(p => p.id)));
                              window.open(`/admin/groups/${id}/print?layout=${layout}&order=${orderParam}`, "_blank");
                              setShowPrintMenu(false);
                            }}
                            className="flex flex-col w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">{desc}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button onClick={() => setShowRegisterModal(true)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors">
                  <Link2 className="w-3.5 h-3.5" />
                  <span>報名連結</span>
                </button>
                <button onClick={() => setShowBulkModal(true)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                  <Users className="w-3.5 h-3.5" />
                  <span>批量</span>
                </button>
                <button onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>加入旅客</span>
                </button>
              </div>
            </div>

            {/* ── Payment totals summary bar ── */}
            {(() => {
              // 輔助：計算某位旅客在某類別的分配金額（收付款紀錄中有勾選此旅客者平分）
              const getLinkedAmt = (customerId: string, category: "deposit" | "balance") =>
                tourPayments
                  .filter(p => p.type === "income" && p.category === category && (p.customer_ids || []).includes(customerId))
                  .reduce((s, p) => s + Math.round(p.amount / Math.max(1, (p.customer_ids || []).length)), 0);

              // 已分配 = 各旅客已關聯金額加總（優先用收付款勾選；若無則用手動填寫金額）
              const allocDeposit = participants.reduce((s, p) => {
                const linked = getLinkedAmt(p.customer_id, "deposit");
                return s + (linked > 0 ? linked : (p.deposit_amount || 0));
              }, 0);
              const allocBalance = participants.reduce((s, p) => {
                const linked = getLinkedAmt(p.customer_id, "balance");
                return s + (linked > 0 ? linked : (p.balance_amount || 0));
              }, 0);
              const remDeposit = payTotals.deposit - allocDeposit;
              const remBalance = payTotals.balance - allocBalance;
              // 總應收訂金：訂金金額 × (總人數 - 招待/領隊等免費人數)
              const freePax = (tour.custom_price_tiers || []).filter(ct => ct.price === 0).reduce((s, ct) => s + ct.pax, 0);
              const payingPax = (tour.pax || 0) - freePax;
              const depositPerPerson = tour.deposit_per_person || 0;
              const totalExpected = depositPerPerson > 0
                ? depositPerPerson * payingPax
                : 0;
              // 總應收尾款：各類別售價合計 - 已收訂金
              const totalRevenue =
                (tour.pax_adult     || 0) * (tour.selling_price   || 0) +
                (tour.pax_tour_only || 0) * (tour.price_tour_only || 0) +
                (tour.pax_child     || 0) * (tour.price_child     || 0) +
                (tour.pax_infant    || 0) * (tour.price_infant    || 0) +
                (tour.custom_price_tiers || []).reduce((s, ct) => s + ct.pax * ct.price, 0);
              const totalExpectedBalance = Math.max(0, totalRevenue - payTotals.deposit);
              if (payTotals.deposit === 0 && payTotals.balance === 0) return null;
              return (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label:"訂金", totalExp: totalExpected,        received: payTotals.deposit, alloc: allocDeposit, rem: remDeposit, color:"emerald" },
                    { label:"尾款", totalExp: totalExpectedBalance,  received: payTotals.balance, alloc: allocBalance, rem: remBalance, color:"blue"    },
                  ].map(({ label, totalExp, received, alloc, rem, color }) => received > 0 && (
                    <div key={label} className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3`}>
                      {/* 總應收 */}
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">總應收{label}</span>
                        {totalExp > 0
                          ? <span className="text-xs font-bold text-slate-500 dark:text-slate-400">NT${totalExp.toLocaleString()}</span>
                          : <span className="text-[10px] text-slate-300 dark:text-slate-600 italic">{label === "訂金" ? "請先設定訂金金額" : "—"}</span>
                        }
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}（收付款合計）</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">NT${received.toLocaleString()}</span>
                      </div>
                      {/* progress bar */}
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden mb-2">
                        <div className={`h-full rounded-full bg-${color}-500 transition-all`}
                          style={{ width: received > 0 ? `${Math.min(100, alloc/received*100)}%` : "0%" }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
                        <span>已分配 <strong className={`text-${color}-600 dark:text-${color}-400`}>NT${alloc.toLocaleString()}</strong></span>
                        <span className={rem !== 0 ? "text-amber-500 font-semibold" : ""}>
                          {rem > 0 ? `未分配 NT$${rem.toLocaleString()}` : rem < 0 ? `超出 NT$${Math.abs(rem).toLocaleString()}` : "✓ 全部分配"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* ── 收款統計 ── */}
            {participants.length > 0 && (() => {
              const getLinkedAmt = (customerId: string, category: "deposit" | "balance") =>
                tourPayments
                  .filter(pay => pay.type === "income" && pay.category === category && (pay.customer_ids || []).includes(customerId))
                  .reduce((s, pay) => s + Math.round(pay.amount / Math.max(1, (pay.customer_ids || []).length)), 0);

              const depositPaid   = participants.filter(p => {
                const linked = getLinkedAmt(p.customer_id, "deposit");
                return (linked > 0 ? linked : (p.deposit_amount || 0)) > 0;
              });
              const balancePaid   = participants.filter(p => {
                const linked = getLinkedAmt(p.customer_id, "balance");
                return (linked > 0 ? linked : (p.balance_amount || 0)) > 0;
              });
              const depositUnpaid = participants.length - depositPaid.length;
              const balanceUnpaid = participants.length - balancePaid.length;

              return (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      💳 收款統計
                    </span>
                    <span className="text-xs text-slate-400">{participants.length} 人</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* 訂金 */}
                    <div className="rounded-lg border border-slate-100 dark:border-slate-700 px-3 py-2.5">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">訂金</div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span className="text-xs text-slate-600 dark:text-slate-300">已收</span>
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{depositPaid.length} 人</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          <span className="text-xs text-slate-600 dark:text-slate-300">未收</span>
                          <span className={`text-sm font-bold ${depositUnpaid > 0 ? "text-amber-500 dark:text-amber-400" : "text-slate-300 dark:text-slate-600"}`}>
                            {depositUnpaid} 人
                          </span>
                        </div>
                      </div>
                      {depositPaid.length > 0 && (
                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${Math.round(depositPaid.length / participants.length * 100)}%` }} />
                        </div>
                      )}
                      {depositUnpaid > 0 && (
                        <div className="mt-1.5 text-[10px] text-slate-400 leading-relaxed">
                          {participants.filter(p => {
                            const linked = getLinkedAmt(p.customer_id, "deposit");
                            return (linked > 0 ? linked : (p.deposit_amount || 0)) === 0;
                          }).map(p => p.customer.name).join("、")}
                        </div>
                      )}
                    </div>
                    {/* 尾款 */}
                    <div className="rounded-lg border border-slate-100 dark:border-slate-700 px-3 py-2.5">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">尾款</div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                          <span className="text-xs text-slate-600 dark:text-slate-300">已收</span>
                          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{balancePaid.length} 人</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          <span className="text-xs text-slate-600 dark:text-slate-300">未收</span>
                          <span className={`text-sm font-bold ${balanceUnpaid > 0 ? "text-amber-500 dark:text-amber-400" : "text-slate-300 dark:text-slate-600"}`}>
                            {balanceUnpaid} 人
                          </span>
                        </div>
                      </div>
                      {balancePaid.length > 0 && (
                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500 transition-all"
                            style={{ width: `${Math.round(balancePaid.length / participants.length * 100)}%` }} />
                        </div>
                      )}
                      {balanceUnpaid > 0 && (
                        <div className="mt-1.5 text-[10px] text-slate-400 leading-relaxed">
                          {participants.filter(p => {
                            const linked = getLinkedAmt(p.customer_id, "balance");
                            return (linked > 0 ? linked : (p.balance_amount || 0)) === 0;
                          }).map(p => p.customer.name).join("、")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Type statistics ── */}
            {participants.length > 0 && (() => {
              const priceMap: Record<string, number> = {
                adult:     tour.selling_price   || 0,
                tour_only: tour.price_tour_only || 0,
                child:     tour.price_child     || 0,
                infant:    tour.price_infant    || 0,
              };
              const rows = PARTICIPANT_TYPES.map(t => ({
                ...t,
                count: participants.filter(p => (p.participant_type || "adult") === t.key).length,
                price: priceMap[t.key],
              })).filter(t => t.count > 0);
              // 自訂類別：以實際分配到該 tier 的旅客人數計算
              const customTiers = (tour.custom_price_tiers || []).map(ct => ({
                ...ct,
                assignedCount: participants.filter(p => p.participant_type === ct.id).length,
              })).filter(ct => ct.pax > 0 || ct.assignedCount > 0);
              // 合計以『基本資料→各類別人數與售價』的設定值為準（同費用試算/收付款公式）
              const totalAmt =
                (tour.pax_adult     || 0) * (tour.selling_price   || 0) +
                (tour.pax_tour_only || 0) * (tour.price_tour_only || 0) +
                (tour.pax_child     || 0) * (tour.price_child     || 0) +
                (tour.pax_infant    || 0) * (tour.price_infant    || 0) +
                (tour.custom_price_tiers || []).reduce((s, ct) => s + ct.pax * ct.price, 0);
              if (rows.length === 0 && customTiers.length === 0) return null;
              return (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">身份統計</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      合計 <span className="text-blue-600 dark:text-blue-400">NT${totalAmt.toLocaleString()}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rows.map(t => (
                      <div key={t.key}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${t.badge}`}>
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                        <span className="opacity-70">·</span>
                        <span>{t.count} 人</span>
                        {t.price > 0 && (
                          <>
                            <span className="opacity-50">×</span>
                            <span>NT${t.price.toLocaleString()}</span>
                            <span className="opacity-50">=</span>
                            <span className="font-bold">NT${(t.count * t.price).toLocaleString()}</span>
                          </>
                        )}
                      </div>
                    ))}
                    {customTiers.map(ct => (
                      <div key={ct.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-200 dark:border-violet-700">
                        <span>✦</span>
                        <span>{ct.label || "自訂"}</span>
                        <span className="opacity-70">·</span>
                        <span>{ct.assignedCount} 人</span>
                        {ct.assignedCount !== ct.pax && (
                          <span className="opacity-50 text-[9px]">/ 預設 {ct.pax}</span>
                        )}
                        {ct.price > 0 && (
                          <>
                            <span className="opacity-50">×</span>
                            <span>NT${ct.price.toLocaleString()}</span>
                            <span className="opacity-50">=</span>
                            <span className="font-bold">NT${(ct.assignedCount * ct.price).toLocaleString()}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Meal statistics ── */}
            {participants.length > 0 && (() => {
              const normalCount = participants.filter(p => !(p.meal_preference || "").trim()).length;
              const mealStats = MEAL_OPTIONS.map(opt => ({
                key: opt.key,
                color: opt.color,
                count: participants.filter(p =>
                  (p.meal_preference || "").split(",").map(s => s.trim()).filter(Boolean).includes(opt.key)
                ).length,
                // 名單（hover 用）
                names: participants
                  .filter(p => (p.meal_preference || "").split(",").map(s => s.trim()).filter(Boolean).includes(opt.key))
                  .map(p => p.customer.name),
              })).filter(m => m.count > 0);

              const normalNames = participants
                .filter(p => !(p.meal_preference || "").trim())
                .map(p => p.customer.name);

              return (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      🍽️ 餐食統計
                    </span>
                    <span className="text-xs text-slate-400">{participants.length} 人</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* 正常餐 */}
                    {normalCount > 0 && (
                      <div title={normalNames.join("、")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-default
                          bg-slate-100 text-slate-600 border border-slate-200
                          dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600
                          hover:ring-2 hover:ring-slate-300 dark:hover:ring-slate-500 transition-all">
                        🍽️ 正常餐
                        <span className="font-bold">{normalCount} 人</span>
                      </div>
                    )}
                    {/* Special meals */}
                    {mealStats.map(m => (
                      <div key={m.key} title={m.names.join("、")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-default
                          hover:ring-2 hover:ring-offset-1 transition-all ${m.color}`}>
                        {m.key}
                        <span className="font-bold">{m.count} 人</span>
                      </div>
                    ))}
                    {/* 如果全部正常餐 */}
                    {mealStats.length === 0 && normalCount === participants.length && (
                      <span className="text-xs text-slate-400 py-1.5">全部正常餐 ✓</span>
                    )}
                  </div>
                  {/* 名單細節（展開顯示每類旅客名字）*/}
                  {mealStats.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-50 dark:border-slate-700/60 space-y-1.5">
                      {mealStats.map(m => (
                        <div key={m.key} className="flex items-start gap-2 text-xs">
                          <span className={`shrink-0 px-1.5 py-0.5 rounded font-semibold border ${m.color}`}>{m.key}</span>
                          <span className="text-slate-500 dark:text-slate-400 leading-relaxed">{m.names.join("、")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {participants.length===0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 py-12 text-center text-slate-400 text-sm">
                還沒有旅客報名此團
              </div>
            ) : orderedParts.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 py-10 text-center text-slate-400 text-sm">
                <Search className="w-6 h-6 mx-auto mb-2 text-slate-200 dark:text-slate-600" />
                沒有符合「{partSearch}」的旅客
                <button onClick={() => setPartSearch("")} className="block mx-auto mt-2 text-xs text-blue-500 hover:underline">清除搜尋</button>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
              {/* ── 欄位標題列（可拖曳調整寬度）── */}
              <div className="flex items-center bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 mb-2 min-w-[540px] md:min-w-0 select-none">
                {/* drag handle 佔位 */}
                <div className="w-6 flex-shrink-0" />
                {/* color bar 佔位 */}
                <div className="w-1 flex-shrink-0" />
                {/* seq# 佔位 */}
                <div className="w-5 flex-shrink-0" />
                {/* 欄位名稱 */}
                <div className="flex items-center gap-0 px-2 flex-1 min-w-0">
                  {/* 姓名 */}
                  <div style={{width: colWidths.name}} className="relative flex-shrink-0 text-[10px] font-semibold text-slate-400 uppercase tracking-wide pr-3">
                    姓名
                    <div onMouseDown={e => startResize("name", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center group">
                      <div className="w-0.5 h-3 bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-400 rounded-full transition-colors" />
                    </div>
                  </div>
                  {/* 身份 */}
                  <div style={{width: colWidths.type_badge}} className="relative flex-shrink-0 text-[10px] font-semibold text-slate-400 uppercase tracking-wide pr-3">
                    身份
                    <div onMouseDown={e => startResize("type_badge", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center group">
                      <div className="w-0.5 h-3 bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-400 rounded-full transition-colors" />
                    </div>
                  </div>
                  {/* 動態欄位 */}
                  {partCols.filter(c => c.visible).map(col => (
                    <div key={col.key}
                      style={{width: colWidths[col.key] ?? 110}}
                      className="relative flex-shrink-0 text-[10px] font-semibold text-slate-400 uppercase tracking-wide pr-3">
                      {col.label}
                      <div onMouseDown={e => startResize(col.key, e)}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center group">
                        <div className="w-0.5 h-3 bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-400 rounded-full transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
                {/* reset 按鈕 */}
                <button
                  onClick={() => setColWidths(COL_WIDTHS_DEFAULT)}
                  title="重設欄位寬度"
                  className="ml-1 text-[9px] text-slate-300 dark:text-slate-600 hover:text-blue-400 transition-colors flex-shrink-0">
                  ↺
                </button>
              </div>
              {/* 依房號分組渲染 */}
              {(() => {
                // 計算相鄰同房號的分組
                type RoomGroup = { roomNum: string | null; parts: typeof orderedParts };
                const roomGroups: RoomGroup[] = [];
                orderedParts.forEach(p => {
                  const rn = p.room_number || null;
                  const last = roomGroups[roomGroups.length - 1];
                  if (last && last.roomNum === rn) last.parts.push(p);
                  else roomGroups.push({ roomNum: rn, parts: [p] });
                });
                return (
                  <div className="space-y-2.5 min-w-[540px] md:min-w-0">
                    {roomGroups.map(group => {
                      const grpPalette = group.roomNum ? paletteMap.get(group.roomNum) ?? ROOM_PALETTES[0] : null;
                      const inner = (
                        <div className={grpPalette ? "space-y-0" : "space-y-1.5"}>
                          {group.parts.map(p => {
                            const idx = orderedParts.findIndex(op => op.id === p.id);
                            const palette = grpPalette;
                            return (
                    <div key={p.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragPartIdx(idx); }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragPartIdx === null || dragPartIdx === idx) return;
                        const ids = orderedParts.map(x => x.id);
                        const [moved] = ids.splice(dragPartIdx, 1);
                        ids.splice(idx, 0, moved);
                        savePartOrder(ids);
                        setDragPartIdx(null);
                      }}
                      onDragEnd={() => setDragPartIdx(null)}
                      className={`flex items-center bg-white dark:bg-slate-800 border-b last:border-b-0 border-slate-100 dark:border-slate-700/60 transition-all select-none ${
                        grpPalette
                          ? (dragPartIdx === idx ? "opacity-40" : "")
                          : `rounded-xl border shadow-sm ${dragPartIdx === idx
                              ? "opacity-40 border-blue-400 dark:border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800"
                              : "border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600"}`
                      }`}>
                      {/* drag handle */}
                      <div className="pl-2 pr-1 self-stretch flex items-center text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 cursor-grab active:cursor-grabbing flex-shrink-0">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      {/* colored left bar */}
                      <div className={`w-1 self-stretch flex-shrink-0 ${palette ? palette.bar : "bg-transparent"}`} />
                      {/* seq number */}
                      <div className="w-5 flex-shrink-0 text-center text-[10px] text-slate-300 dark:text-slate-600 font-mono">{idx+1}</div>
                      {/* main content */}
                      <div className="flex-1 flex items-center gap-0 min-w-0 px-2 py-3">
                        {/* name */}
                        <div style={{width: colWidths.name}} className="flex-shrink-0">
                          <Link href={`/admin/crm/${p.customer_id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline text-sm">
                            {p.customer.name}
                          </Link>
                        </div>
                        {/* participant type badge */}
                        {(() => {
                          const pTypeKey = p.participant_type || "adult";
                          const fixedType = PARTICIPANT_TYPES.find(t => t.key === pTypeKey);
                          const customTier = !fixedType
                            ? (tour.custom_price_tiers || []).find(ct => ct.id === pTypeKey)
                            : undefined;
                          const isOpen = typePickerId === p.id;
                          return (
                            <div style={{width: colWidths.type_badge}} className="flex-shrink-0 flex items-center">
                              <button
                                onClick={(e) => {
                                  if (isOpen) { setTypePickerId(null); setTypePickerRect(null); }
                                  else { setTypePickerId(p.id); setTypePickerRect(e.currentTarget.getBoundingClientRect()); }
                                }}
                                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-all font-medium ${
                                  fixedType
                                    ? fixedType.badge
                                    : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-700"
                                }`}>
                                <span>{fixedType ? fixedType.icon : "✦"}</span>
                                <span className="truncate max-w-[44px]">{fixedType ? fixedType.label : (customTier?.label || "自訂")}</span>
                              </button>
                            </div>
                          );
                        })()}
                        {/* dynamic columns */}
                        {partCols.filter(c => c.visible).map(col => {
                          if (col.key === "phone") return (
                            <div key="phone" style={{width: colWidths.phone}} className="flex-shrink-0 text-sm text-slate-500 dark:text-slate-400 truncate">
                              {p.customer.phone || "—"}
                            </div>
                          );
                          if (col.key === "email") return (
                            <div key="email" style={{width: colWidths.email}} className="flex-shrink-0 text-sm text-slate-500 dark:text-slate-400 truncate">
                              {p.customer.email || "—"}
                            </div>
                          );
                          if (col.key === "passport") return (
                            <div key="passport" style={{width: colWidths.passport}} className="flex-shrink-0 text-xs text-slate-500 dark:text-slate-400 truncate font-mono">
                              {p.customer.passport || <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </div>
                          );
                          if (col.key === "passport_expiry") {
                            const expired = p.customer.passport_expiry && new Date(p.customer.passport_expiry) < new Date();
                            return (
                              <div key="passport_expiry" style={{width: colWidths.passport_expiry}} className={`flex-shrink-0 text-xs font-mono ${
                                !p.customer.passport_expiry ? "text-slate-300 dark:text-slate-600" :
                                expired ? "text-red-500 dark:text-red-400 font-semibold" :
                                "text-slate-500 dark:text-slate-400"
                              }`}>
                                {p.customer.passport_expiry || "—"}
                                {expired && <span className="ml-1 text-[9px] bg-red-100 dark:bg-red-900/40 text-red-500 px-1 rounded">已到期</span>}
                              </div>
                            );
                          }
                          if (col.key === "taibao_number") return (
                            <div key="taibao_number" style={{width: colWidths.taibao_number}} className="flex-shrink-0 text-xs text-slate-500 dark:text-slate-400 truncate font-mono">
                              {p.customer.taibao_number || <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </div>
                          );
                          if (col.key === "taibao_expiry") {
                            const expired = p.customer.taibao_expiry && new Date(p.customer.taibao_expiry) < new Date();
                            return (
                              <div key="taibao_expiry" style={{width: colWidths.taibao_expiry}} className={`flex-shrink-0 text-xs font-mono ${
                                !p.customer.taibao_expiry ? "text-slate-300 dark:text-slate-600" :
                                expired ? "text-red-500 dark:text-red-400 font-semibold" :
                                "text-slate-500 dark:text-slate-400"
                              }`}>
                                {p.customer.taibao_expiry || "—"}
                                {expired && <span className="ml-1 text-[9px] bg-red-100 dark:bg-red-900/40 text-red-500 px-1 rounded">已到期</span>}
                              </div>
                            );
                          }
                          if (col.key === "deposit_amount" || col.key === "balance_amount") {
                            const field    = col.key as "deposit_amount" | "balance_amount";
                            const category = field === "deposit_amount" ? "deposit" : "balance";
                            const label    = field === "deposit_amount" ? "訂金" : "尾款";
                            // 優先：收付款紀錄中有勾選此旅客的款項，依人數平分
                            const linkedAmt = tourPayments
                              .filter(pay => pay.type === "income" && pay.category === category && (pay.customer_ids || []).includes(p.customer_id))
                              .reduce((s, pay) => s + Math.round(pay.amount / Math.max(1, (pay.customer_ids || []).length)), 0);
                            const manualVal = p[field] || 0;
                            const isLinked  = linkedAmt > 0;
                            const isEdit    = !isLinked && editingAmtId === p.id && editingAmtField === field;
                            // 應付金額提示（依身份類別售價）
                            const pTypeKey = p.participant_type || "adult";
                            const expectedPrice = (() => {
                              if (pTypeKey === "adult")     return tour.selling_price   || 0;
                              if (pTypeKey === "tour_only") return tour.price_tour_only || 0;
                              if (pTypeKey === "child")     return tour.price_child     || 0;
                              if (pTypeKey === "infant")    return tour.price_infant    || 0;
                              return (tour.custom_price_tiers || []).find(ct => ct.id === pTypeKey)?.price || 0;
                            })();
                            // 尾款：應收 = 總價 - 已繳訂金
                            const hintAmt = (() => {
                              if (field === "deposit_amount") return expectedPrice;
                              // 計算已繳訂金
                              const depositLinked = tourPayments
                                .filter(pay => pay.type === "income" && pay.category === "deposit" && (pay.customer_ids || []).includes(p.customer_id))
                                .reduce((s, pay) => s + Math.round(pay.amount / Math.max(1, (pay.customer_ids || []).length)), 0);
                              const depositManual = p.deposit_amount || 0;
                              const depositPaid = depositLinked > 0 ? depositLinked : depositManual;
                              return Math.max(0, expectedPrice - depositPaid);
                            })();
                            // 空白且有應付金額時顯示紅色警示
                            const showHint = !isLinked && manualVal === 0 && hintAmt > 0;
                            return (
                              <div key={col.key} style={{width: colWidths[col.key] ?? 110}} className="flex-shrink-0 flex items-center justify-end">
                                {isEdit ? (
                                  <input autoFocus type="text" inputMode="numeric"
                                    className="w-full text-xs border border-blue-400 rounded-lg px-2 py-1 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    value={amtInput}
                                    onChange={e => setAmtInput(e.target.value)}
                                    onBlur={() => saveAmount(p.id, field, amtInput)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") saveAmount(p.id, field, amtInput);
                                      if (e.key === "Escape") { setEditingAmtId(null); setEditingAmtField(null); }
                                    }}
                                    placeholder="0" />
                                ) : isLinked ? (
                                  <span
                                    title={`從收付款紀錄自動計算`}
                                    className="text-xs px-2 py-1 rounded-lg text-blue-700 dark:text-blue-300 font-semibold bg-blue-50 dark:bg-blue-900/20">
                                    NT${linkedAmt.toLocaleString()}
                                  </span>
                                ) : showHint ? (
                                  // 未收警示（紅色，點擊可填入）
                                  <button
                                    onClick={() => { setEditingAmtId(p.id); setEditingAmtField(field); setAmtInput(String(hintAmt)); }}
                                    title={`尚未收款，點擊填入金額`}
                                    className="text-xs px-2 py-1 rounded-lg border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 font-semibold bg-red-50 dark:bg-red-900/20 tabular-nums whitespace-nowrap">
                                    未收{label} {hintAmt.toLocaleString()}元
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => { setEditingAmtId(p.id); setEditingAmtField(field); setAmtInput(manualVal ? String(manualVal) : ""); }}
                                    className={`group/amt text-xs px-2 py-1 rounded-lg transition-all text-right ${
                                      manualVal > 0
                                        ? "text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                                        : "text-slate-300 dark:text-slate-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                    }`}
                                    title={`點擊編輯${label}`}>
                                    {manualVal > 0 ? `NT$${manualVal.toLocaleString()}` : <span className="group-hover/amt:text-blue-400">{label}</span>}
                                  </button>
                                )}
                              </div>
                            );
                          }
                          if (col.key === "meal_preference") {
                            const meals = (p.meal_preference || "").split(",").map(s => s.trim()).filter(Boolean);
                            const isOpen = mealPickerId === p.id;
                            return (
                              <div key="meal" style={{width: colWidths.meal_preference}} className="flex-shrink-0 flex items-center">
                                <button
                                  onClick={(e) => {
                                    if (isOpen) { setMealPickerId(null); setMealPickerRect(null); }
                                    else { setMealPickerId(p.id); setMealPickerRect(e.currentTarget.getBoundingClientRect()); }
                                  }}
                                  className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-all ${
                                    meals.length > 0
                                      ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-medium"
                                      : "text-slate-400 dark:text-slate-500 border-dashed border-slate-200 dark:border-slate-600 hover:border-amber-400 hover:text-amber-500"
                                  }`}>
                                  <UtensilsCrossed className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate max-w-[70px]">{meals.length > 0 ? meals.join("·") : "正常餐"}</span>
                                </button>
                              </div>
                            );
                          }
                          if (col.key === "room_number") {
                            return (
                              <div key="room" style={{width: colWidths.room_number}} className="flex-shrink-0 flex justify-end pr-1">
                                {editingRoomId === p.id ? (
                                  <input autoFocus
                                    className="w-20 text-xs border border-blue-400 rounded-lg px-2 py-1 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    value={roomInput}
                                    onChange={e => setRoomInput(e.target.value)}
                                    onBlur={() => saveRoomNumber(p.id, roomInput)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") saveRoomNumber(p.id, roomInput);
                                      if (e.key === "Escape") setEditingRoomId(null);
                                    }}
                                    placeholder="房號…" />
                                ) : (
                                  <div className="flex flex-col gap-0.5 items-start">
                                    <button
                                      onClick={() => { setEditingRoomId(p.id); setRoomInput(p.room_number || ""); }}
                                      className={`group/room flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all ${
                                        p.room_number && palette
                                          ? `${palette.badge} font-medium shadow-sm hover:opacity-80`
                                          : "text-slate-400 dark:text-slate-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-dashed border-slate-200 dark:border-slate-600 hover:border-blue-400"
                                      }`}>
                                      {p.room_number ? (
                                        <>{p.room_number} <Pencil className="w-2.5 h-2.5 opacity-70" /></>
                                      ) : (
                                        <><BedDouble className="w-3 h-3" /> 分配房號</>
                                      )}
                                    </button>
                                    {/* 同住偏好 hint（從報名表自動帶入） */}
                                    {(p.notes || "").includes("同住偏好：") && (
                                      <span title={p.notes || ""} className="text-[9px] text-teal-500 dark:text-teal-400 px-1.5 py-0.5 bg-teal-50 dark:bg-teal-900/20 rounded border border-teal-100 dark:border-teal-800/40 truncate max-w-[100px] cursor-default">
                                        {(p.notes || "").replace(/.*同住偏好：/, "→ ")}
                                      </span>
                                    )}
                                    {(p.notes || "").includes("單人房") && (
                                      <span className="text-[9px] text-violet-500 dark:text-violet-400 px-1.5 py-0.5 bg-violet-50 dark:bg-violet-900/20 rounded border border-violet-100 dark:border-violet-800/40 cursor-default">
                                        單人房需求
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })}
                        {/* remove */}
                        <button onClick={() => removeParticipant(p.id)}
                          className="ml-auto p-1 text-slate-200 dark:text-slate-600 hover:text-red-500 transition-colors rounded flex-shrink-0">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                            );
                          })}
                        </div>
                      );
                      // 有房號：用彩色外框包住
                      if (grpPalette && group.roomNum) {
                        return (
                          <div key={group.roomNum}
                            className={`rounded-xl border-2 ${grpPalette.outer} overflow-hidden shadow-sm`}>
                            {/* 房號標題列 */}
                            <div className={`flex items-center gap-2 px-3 py-1.5 ${grpPalette.groupBg} border-b ${grpPalette.outer}`}>
                              <BedDouble className="w-3.5 h-3.5 flex-shrink-0" style={{color: "inherit"}} />
                              <span className="text-xs font-bold">{group.roomNum}</span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">{group.parts.length} 人</span>
                            </div>
                            {inner}
                          </div>
                        );
                      }
                      // 無房號：直接渲染（加 space-y-1.5）
                      return (
                        <div key="no-room" className="space-y-1.5">
                          {inner.props.children}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Tab: Flights ── */}
      {activeTab === "flights" && <FlightsTab tourId={id} />}

      {/* ── Tab: Customer Itinerary ── */}
      {activeTab === "itin_c" && (
        <ItineraryTab tourId={id} variant="customer" />
      )}

      {/* ── Tab: Trade Itinerary ── */}
      {activeTab === "itin_t" && (
        <ItineraryTab tourId={id} variant="trade" />
      )}

      {/* ── Tab: AI Tour Webpage ── */}
      {activeTab === "webpage" && tour && (
        <TourPageTab tour={tour} />
      )}

      {/* ── Type picker (fixed) ── */}
      {typePickerId && typePickerRect && (() => {
        const spaceBelow = window.innerHeight - typePickerRect.bottom;
        const openUp = spaceBelow < 260;
        const dropStyle: React.CSSProperties = {
          position: "fixed",
          left: typePickerRect.left,
          zIndex: 9999,
          ...(openUp
            ? { bottom: window.innerHeight - typePickerRect.top + 4 }
            : { top: typePickerRect.bottom + 4 }),
        };
        const curType = participants.find(x => x.id === typePickerId)?.participant_type || "adult";
        const customTiers = (tour.custom_price_tiers || []);
        return (
          <>
            <div className="fixed inset-0" style={{ zIndex: 9998 }}
              onClick={() => { setTypePickerId(null); setTypePickerRect(null); }} />
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-2 min-w-[140px]"
              style={dropStyle}>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 px-2 py-1 uppercase tracking-wide">身份類型</p>
              {PARTICIPANT_TYPES.map(t => {
                const active = curType === t.key;
                return (
                  <button key={t.key}
                    onClick={() => changeParticipantType(typePickerId!, t.key)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      active ? t.badge : "hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300"
                    }`}>
                    <span>{t.icon}</span>
                    {active ? "✓" : "○"} {t.label}
                    {(() => {
                      const priceByKey: Record<string, number> = {
                        adult:     tour.selling_price   || 0,
                        tour_only: tour.price_tour_only || 0,
                        child:     tour.price_child     || 0,
                        infant:    tour.price_infant    || 0,
                      };
                      const p = priceByKey[t.key] || 0;
                      return p > 0 ? <span className="ml-auto text-[9px] opacity-50">NT${p.toLocaleString()}</span> : null;
                    })()}
                  </button>
                );
              })}
              {customTiers.length > 0 && (
                <>
                  <div className="my-1.5 border-t border-slate-100 dark:border-slate-700" />
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 px-2 py-1 uppercase tracking-wide">自訂類別</p>
                  {customTiers.map(ct => {
                    const active = curType === ct.id;
                    return (
                      <button key={ct.id}
                        onClick={() => changeParticipantType(typePickerId!, ct.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                          active
                            ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-200 dark:border-violet-700"
                            : "hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300"
                        }`}>
                        <span>✦</span>
                        {active ? "✓" : "○"} {ct.label || "自訂"}
                        {ct.price > 0 && <span className="ml-auto text-[9px] opacity-50">NT${ct.price.toLocaleString()}</span>}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </>
        );
      })()}

      {/* ── Meal picker (fixed, avoids overflow-hidden clipping) ── */}
      {mealPickerId && mealPickerRect && (() => {
        const mp = participants.find(x => x.id === mealPickerId);
        if (!mp) return null;
        const meals = (mp.meal_preference || "").split(",").map(s => s.trim()).filter(Boolean);
        const spaceBelow = window.innerHeight - mealPickerRect.bottom;
        const openUp = spaceBelow < 210;
        const dropStyle: React.CSSProperties = {
          position: "fixed",
          left: mealPickerRect.left,
          zIndex: 9999,
          ...(openUp
            ? { bottom: window.innerHeight - mealPickerRect.top + 4 }
            : { top: mealPickerRect.bottom + 4 }),
        };
        return (
          <>
            <div className="fixed inset-0" style={{ zIndex: 9998 }}
              onClick={() => { setMealPickerId(null); setMealPickerRect(null); }} />
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-2 min-w-[130px]"
              style={dropStyle}>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 px-2 py-1 uppercase tracking-wide">餐食偏好</p>
              {MEAL_OPTIONS.map(opt => {
                const active = meals.includes(opt.key);
                return (
                  <button key={opt.key}
                    onClick={() => toggleMeal(mealPickerId!, opt.key)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      active ? opt.color + " border" : "hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300"
                    }`}>
                    {active ? "✓" : "○"} {opt.key}
                  </button>
                );
              })}
              <div className="border-t border-slate-100 dark:border-slate-700 mt-1 pt-1">
                <button
                  onClick={async () => {
                    await supabase.from("customer_tours").update({ meal_preference: "" }).eq("id", mealPickerId!);
                    setParticipants(prev => prev.map(x => x.id === mealPickerId ? { ...x, meal_preference: "" } : x));
                    setMealPickerId(null);
                    setMealPickerRect(null);
                  }}
                  className="w-full text-xs text-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 py-1">
                  重設為正常餐
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── 線上報名表連結 Modal ── */}
      {showRegisterModal && (() => {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const regUrl  = `${origin}/join/${id}`;

        const genShortUrl = async () => {
          setShortLoading(true);
          try {
            const res = await fetch("/api/shorten", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tourId: id }),
            });
            const json = await res.json();
            if (json.shortUrl) setShortUrl(json.shortUrl);
            else alert(json.error || "產生失敗");
          } finally {
            setShortLoading(false);
          }
        };

        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-5 text-white flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Link2 className="w-5 h-5" />
                    <h2 className="font-bold text-lg">線上報名表連結</h2>
                  </div>
                  <button onClick={() => { setShowRegisterModal(false); setArticleOpen(false); }}
                    className="text-white/70 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-violet-200 text-sm mt-1.5">將連結分享給客人，讓客人自行填寫報名資料</p>
              </div>

              {/* Tour info */}
              <div className="px-6 pt-5 pb-2 flex-shrink-0">
                <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-4 space-y-1">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{tour?.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    📍 {tour?.destination}&nbsp;·&nbsp;{tour?.start_date} → {tour?.end_date}
                  </p>
                </div>
              </div>

              <div className="px-6 pb-6 space-y-4 mt-3 overflow-y-auto flex-1">

                {/* ── 短網址 區塊（主推） ── */}
                <div className="rounded-2xl border-2 border-violet-200 dark:border-violet-700 overflow-hidden">
                  <div className="flex items-center justify-between bg-violet-50 dark:bg-violet-900/20 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wide">⚡ 短網址</span>
                      <span className="text-[10px] bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full font-medium">推薦</span>
                    </div>
                    {shortUrl && (
                      <button onClick={() => window.open(shortUrl, "_blank")}
                        className="text-[10px] text-violet-500 hover:text-violet-700 flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> 預覽
                      </button>
                    )}
                  </div>

                  {shortUrl ? (
                    <div className="px-4 py-3 space-y-2.5">
                      <div className="flex items-center gap-2 bg-white dark:bg-slate-700 border border-violet-200 dark:border-violet-700 rounded-xl px-3 py-2.5">
                        <span className="flex-1 text-sm font-mono font-semibold text-violet-700 dark:text-violet-300 select-all break-all">
                          {shortUrl}
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(shortUrl);
                          setShortCopied(true);
                          setTimeout(() => setShortCopied(false), 2000);
                        }}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                          shortCopied
                            ? "bg-emerald-500 text-white"
                            : "bg-violet-600 hover:bg-violet-700 text-white"
                        }`}
                      >
                        {shortCopied
                          ? <><CheckCheck className="w-4 h-4" /> 已複製！</>
                          : <><Copy className="w-4 h-4" /> 複製短網址</>
                        }
                      </button>
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-center">
                      <p className="text-xs text-slate-400 mb-3">點擊產生專屬短網址（由 is.gd 提供），方便傳給客人</p>
                      <button
                        onClick={genShortUrl}
                        disabled={shortLoading}
                        className="flex items-center justify-center gap-2 mx-auto px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-all"
                      >
                        {shortLoading
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> 產生中…</>
                          : <><Link2 className="w-4 h-4" /> 產生短網址</>
                        }
                      </button>
                    </div>
                  )}
                </div>

                {/* ── 完整網址（折疊） ── */}
                <details className="group">
                  <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1.5 list-none select-none">
                    <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                    完整網址
                  </summary>
                  <div className="mt-2.5 space-y-2">
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-3">
                      <span className="flex-1 text-[11px] text-slate-500 dark:text-slate-400 break-all select-all font-mono">
                        {regUrl}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(regUrl);
                          setRegisterLinkCopied(true);
                          setTimeout(() => setRegisterLinkCopied(false), 2000);
                        }}
                        className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all ${
                          registerLinkCopied
                            ? "bg-emerald-500 text-white"
                            : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {registerLinkCopied ? <><CheckCheck className="w-3.5 h-3.5" /> 已複製</> : <><Copy className="w-3.5 h-3.5" /> 複製</>}
                      </button>
                      <button onClick={() => window.open(regUrl, "_blank")}
                        className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" /> 預覽
                      </button>
                    </div>
                  </div>
                </details>

                {/* ── 📰 文章設定 ── */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden">
                  <button
                    type="button"
                    onClick={async () => {
                      const next = !articleOpen;
                      setArticleOpen(next);
                      if (next && allBlogPosts.length === 0) {
                        setArticleLoading(true);
                        try {
                          const res = await fetch(`/api/tour-blog-links?tourId=${id}`);
                          const json = await res.json();
                          setAllBlogPosts(json.posts || []);
                          setLinkedPostIds(json.linkedIds || []);
                        } finally { setArticleLoading(false); }
                      }
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">📰</span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">報名表顯示文章</span>
                      {linkedPostIds.length > 0 && (
                        <span className="text-[10px] bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full font-medium">
                          已選 {linkedPostIds.length} 篇
                        </span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${articleOpen ? "rotate-180" : ""}`} />
                  </button>

                  {articleOpen && (
                    <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-4 space-y-3">
                      {articleLoading ? (
                        <div className="flex items-center justify-center gap-2 py-4 text-slate-400 text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" /> 載入文章中…
                        </div>
                      ) : allBlogPosts.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">尚無已發布文章</p>
                      ) : (
                        <>
                          <p className="text-xs text-slate-400">勾選要在報名表顯示的文章（依勾選順序排列）</p>
                          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                            {allBlogPosts.map(post => {
                              const checked = linkedPostIds.includes(post.id);
                              return (
                                <label key={post.id}
                                  className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                                    checked
                                      ? "border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20"
                                      : "border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setLinkedPostIds(prev =>
                                        prev.includes(post.id)
                                          ? prev.filter(x => x !== post.id)
                                          : [...prev, post.id]
                                      );
                                    }}
                                    className="w-4 h-4 rounded accent-rose-500 flex-shrink-0"
                                  />
                                  {/* 縮圖 */}
                                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 flex-shrink-0">
                                    {post.cover_image ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={post.cover_image} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">📷</div>
                                    )}
                                  </div>
                                  {/* 標題 */}
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs font-medium leading-snug line-clamp-2 ${checked ? "text-rose-700 dark:text-rose-300" : "text-slate-700 dark:text-slate-200"}`}>
                                      {post.title}
                                    </p>
                                    {post.category && (
                                      <span className="text-[10px] text-slate-400">{post.category}</span>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            disabled={articleSaving}
                            onClick={async () => {
                              setArticleSaving(true);
                              try {
                                await fetch("/api/tour-blog-links", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ tourId: id, postIds: linkedPostIds }),
                                });
                              } finally { setArticleSaving(false); }
                            }}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white transition-all"
                          >
                            {articleSaving
                              ? <><Loader2 className="w-4 h-4 animate-spin" /> 儲存中…</>
                              : <><CheckCheck className="w-4 h-4" /> 儲存文章設定（{linkedPostIds.length} 篇）</>
                            }
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-xs text-slate-400 text-center">客人填寫後，資料會自動出現在旅客清單中</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bulk input modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b dark:border-slate-700 flex items-center justify-between flex-shrink-0">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" /> 批量輸入旅客名字
              </h2>
              <button onClick={closeBulkModal} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              {!bulkParsed ? (
                <>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    每行一位旅客姓名，或用逗號、頓號分隔。<br />
                    新旅客會自動建立並加入 CRM。
                  </p>
                  <textarea
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                    rows={8}
                    placeholder={"王小明\n李大華\n張美玲\n..."}
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    autoFocus
                  />
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    共 {bulkPreview.length} 位 ·{" "}
                    <span className="text-emerald-600 dark:text-emerald-400">{bulkPreview.filter(e => e.existing && !e.inTour).length} 已在 CRM</span>
                    {" · "}
                    <span className="text-blue-600 dark:text-blue-400">{bulkPreview.filter(e => !e.existing).length} 新旅客</span>
                    {bulkPreview.filter(e => e.inTour).length > 0 && (
                      <> · <span className="text-amber-500">{bulkPreview.filter(e => e.inTour).length} 已在此團</span></>
                    )}
                  </p>
                  <div className="space-y-1 max-h-80 overflow-y-auto -mx-1 px-1">
                    {bulkPreview.map((entry, i) => (
                      <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        entry.inTour
                          ? "bg-amber-50 dark:bg-amber-900/20 opacity-60"
                          : "hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer"
                      }`}
                        onClick={() => {
                          if (entry.inTour) return;
                          const next = [...bulkPreview];
                          next[i] = { ...next[i], selected: !next[i].selected };
                          setBulkPreview(next);
                        }}>
                        <input type="checkbox"
                          checked={entry.selected}
                          disabled={entry.inTour}
                          onChange={() => {}}
                          className="w-4 h-4 accent-blue-600 flex-shrink-0 pointer-events-none" />
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 flex-1">{entry.name}</span>
                        {entry.inTour ? (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex-shrink-0">已在此團</span>
                        ) : entry.existing ? (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 flex-shrink-0">已在 CRM</span>
                        ) : (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 flex-shrink-0">新旅客</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t dark:border-slate-700 flex justify-end gap-3 flex-shrink-0">
              {bulkParsed ? (
                <>
                  <button onClick={() => { setBulkParsed(false); setBulkPreview([]); }}
                    className="text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 px-4 py-2 rounded-lg">← 上一步</button>
                  <button
                    onClick={submitBulk}
                    disabled={bulkSubmitting || bulkPreview.filter(e => e.selected && !e.inTour).length === 0}
                    className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                    {bulkSubmitting ? "處理中…" : `加入 ${bulkPreview.filter(e => e.selected && !e.inTour).length} 位旅客`}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={closeBulkModal}
                    className="text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 px-4 py-2 rounded-lg">取消</button>
                  <button onClick={parseBulkNames} disabled={!bulkText.trim()}
                    className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                    預覽 →
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add participant modal */}
      {showAddModal && (() => {
        // 篩選：搜尋 + 標籤
        const afterSearch = unjoined.filter(c =>
          (!addSearch || c.name.includes(addSearch) || (c.phone || "").includes(addSearch)) &&
          (!modalFilterLabel || (custLabels[c.id] || []).some(lb => lb.id === modalFilterLabel))
        );
        // 排序
        const modalFiltered = [...afterSearch].sort((a, b) => {
          if (modalSort === "labels") {
            const la = (custLabels[a.id] || []).length;
            const lb = (custLabels[b.id] || []).length;
            return lb - la || a.name.localeCompare(b.name, "zh-TW");
          }
          return a.name.localeCompare(b.name, "zh-TW");
        });
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="px-5 py-4 border-b dark:border-slate-700 flex items-center justify-between flex-shrink-0">
                <h2 className="font-bold text-slate-800 dark:text-slate-100">加入旅客</h2>
                <button onClick={closeAddModal} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
                {unjoined.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">所有旅客都已加入此團</p>
                ) : (
                  <>
                    {/* 搜尋 */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        className="pl-9 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="搜尋姓名或電話…"
                        value={addSearch}
                        onChange={e => setAddSearch(e.target.value)}
                        autoFocus
                      />
                    </div>

                    {/* 標籤篩選 */}
                    {allCrmLabels.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setModalFilterLabel(null)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            !modalFilterLabel
                              ? "bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-800"
                              : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600"
                          }`}>全部</button>
                        {allCrmLabels.map(lb => (
                          <button key={lb.id}
                            onClick={() => setModalFilterLabel(modalFilterLabel === lb.id ? null : lb.id)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium text-white transition-all ${
                              modalFilterLabel === lb.id ? "ring-2 ring-offset-1 ring-white/60" : "opacity-70 hover:opacity-100"
                            }`}
                            style={{ backgroundColor: lb.color }}>
                            {lb.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 排序 + 計數列 */}
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <span>排序：</span>
                        <button
                          onClick={() => setModalSort("name")}
                          className={`px-2 py-0.5 rounded transition-colors ${modalSort === "name" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-medium" : "hover:text-slate-700"}`}>
                          姓名
                        </button>
                        <button
                          onClick={() => setModalSort("labels")}
                          className={`px-2 py-0.5 rounded transition-colors ${modalSort === "labels" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-medium" : "hover:text-slate-700"}`}>
                          標籤多→少
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedCids.size > 0
                          ? <span className="font-medium text-blue-600">已選 {selectedCids.size} 位</span>
                          : <span>共 {modalFiltered.length} 位</span>}
                        <button onClick={() => setSelectedCids(new Set(modalFiltered.map(c => c.id as string)))}
                          className="hover:text-blue-600 hover:underline">全選</button>
                        <button onClick={() => setSelectedCids(new Set())}
                          className="hover:text-slate-700 hover:underline">清除</button>
                      </div>
                    </div>

                    {/* 旅客清單 */}
                    {modalFiltered.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-4">找不到符合的旅客</p>
                    ) : (
                      <div className="max-h-72 overflow-y-auto -mx-1 space-y-0.5">
                        {modalFiltered.map(c => (
                          <label key={c.id}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors">
                            <input type="checkbox"
                              checked={selectedCids.has(c.id)}
                              onChange={() => toggleCid(c.id)}
                              className="w-4 h-4 accent-blue-600 flex-shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
                                {(custLabels[c.id] || []).map(lb => (
                                  <span key={lb.id}
                                    className="inline-flex items-center px-1.5 py-px rounded text-[10px] font-medium text-white whitespace-nowrap"
                                    style={{ backgroundColor: lb.color }}>
                                    {lb.name}
                                  </span>
                                ))}
                              </div>
                              {c.phone && <div className="text-xs text-slate-400 dark:text-slate-500">{c.phone}</div>}
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t dark:border-slate-700 flex justify-end gap-3 flex-shrink-0">
                <button onClick={closeAddModal}
                  className="text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 px-4 py-2 rounded-lg">取消</button>
                <button onClick={addParticipants} disabled={selectedCids.size === 0}
                  className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                  {selectedCids.size > 0 ? `加入 ${selectedCids.size} 位旅客` : "加入旅客"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const lbl = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";
