"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, Tour, TourStatus, Customer, CustomerTour, CustomPriceTier } from "@/lib/supabase";
import CostSpreadsheet from "@/components/CostSpreadsheet";
import PaymentsTab from "@/components/PaymentsTab";
import ItineraryTab from "@/components/ItineraryTab";
import FlightsTab from "@/components/FlightsTab";
import { ArrowLeft, Save, Trash2, UserPlus, X, Search, BedDouble, Pencil, UtensilsCrossed, SlidersHorizontal, GripVertical, Users, Printer, Plus } from "lucide-react";

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
];

const STATUS_COLOR: Record<string, string> = {
  planning:"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  confirmed:"bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  ongoing:"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  completed:"bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  cancelled:"bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const input = "w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400";

type BulkPreviewEntry = { name: string; existing: Customer | null; inTour: boolean; selected: boolean };

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [tour, setTour]               = useState<Tour | null>(null);
  const [form, setForm]               = useState<Partial<Tour>>({});
  const [participants, setParticipants] = useState<(CustomerTour & { customer: Customer })[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCids, setSelectedCids] = useState<Set<string>>(new Set());
  const [addSearch, setAddSearch]       = useState("");
  const [saving, setSaving]            = useState(false);
  const [activeTab, setActiveTab]      = useState<"info"|"costs"|"payments"|"participants"|"flights"|"itin_c"|"itin_t">("info");
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
  // 訂金/尾款 inline edit
  const [editingAmtId,   setEditingAmtId]   = useState<string|null>(null);
  const [editingAmtField, setEditingAmtField] = useState<"deposit_amount"|"balance_amount"|null>(null);
  const [amtInput,       setAmtInput]       = useState("");
  // 餐食 picker 固定定位
  const [mealPickerRect, setMealPickerRect] = useState<DOMRect | null>(null);
  // 身份類型 picker
  const [typePickerId,   setTypePickerId]   = useState<string|null>(null);
  const [typePickerRect, setTypePickerRect] = useState<DOMRect | null>(null);
  // 欄位設定
  const [partCols,      setPartCols]      = useState<PartCol[]>(PART_COLS_DEFAULT);
  const [showColSettings, setShowColSettings] = useState(false);
  const [dragColIdx,    setDragColIdx]    = useState<number | null>(null);
  // 旅客排序
  const [rowOrder,      setRowOrder]      = useState<string[]>([]);
  const [dragPartIdx,   setDragPartIdx]   = useState<number | null>(null);
  // 列印名單
  const [showPrintMenu,   setShowPrintMenu]   = useState(false);
  // 批量輸入旅客
  const [showBulkModal,   setShowBulkModal]   = useState(false);
  const [bulkText,        setBulkText]        = useState("");
  const [bulkSubmitting,  setBulkSubmitting]  = useState(false);
  const [bulkPreview,     setBulkPreview]     = useState<BulkPreviewEntry[]>([]);
  const [bulkParsed,      setBulkParsed]      = useState(false);

  const loadTour = async () => {
    const { data } = await supabase.from("tours").select("*").eq("id", id).single();
    if (!data) { router.push("/admin/groups"); return; }
    setTour(data);
    setForm(data);
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
      supabase.from("tour_payments").select("type,category,amount").eq("tour_id", id),
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
      price_tour_only: form.price_tour_only || 0,
      price_child:     form.price_child     || 0,
      price_infant:    form.price_infant    || 0,
      custom_price_tiers: form.custom_price_tiers || [],
      status: form.status, notes: form.notes,
    }).eq("id", id);

    if (error) {
      // 若 DB 尚未執行 migration（42703 = column not found），降級只存基本欄位
      if (error.code === "42703" || error.message?.includes("does not exist")) {
        const { error: e2 } = await supabase.from("tours").update({
          name: form.name, destination: form.destination,
          start_date: form.start_date, end_date: form.end_date,
          pax:          totalPax > 0 ? totalPax : (form.pax || 0),
          selling_price: form.selling_price || 0,
          status: form.status, notes: form.notes,
        }).eq("id", id);
        setSaving(false);
        if (e2) { alert("儲存失敗：" + e2.message); return; }
        alert("基本資料已儲存。\n\n⚠️ 各類別人數/售價需先在 Supabase SQL Editor 執行以下 SQL：\n\nALTER TABLE tours\n  ADD COLUMN IF NOT EXISTS price_tour_only NUMERIC(10,2) NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS price_child NUMERIC(10,2) NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS price_infant NUMERIC(10,2) NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS pax_adult INT NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS pax_tour_only INT NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS pax_child INT NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS pax_infant INT NOT NULL DEFAULT 0;\n\nALTER TABLE customer_tours\n  ADD COLUMN IF NOT EXISTS participant_type TEXT NOT NULL DEFAULT 'adult';");
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
    setParticipants(prev => prev.map(x => x.id === ctId ? { ...x, participant_type: type as "adult"|"tour_only"|"child"|"infant" } : x));
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
        {([["info","基本資料"],["costs","費用試算"],["payments","收付款"],["participants","旅客"],["flights","✈️ 機票"],["itin_c","旅客行程"],["itin_t","同業行程"]] as const).map(([tab, label]) => (
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
              <label className={lbl}>團名 *</label>
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
                  style={{ gridTemplateColumns: "5.5rem 1fr 0.75rem 1fr 5.5rem 1.5rem" }}>
                  <span>類別</span>
                  <span className="text-center">人數</span>
                  <span />
                  <span className="text-center">售價 (NT$)</span>
                  <span className="text-right">小計</span>
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
                      <input type="number" min="0"
                        className="w-full text-center border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={paxVal}
                        onChange={e => setForm({ ...form, [t.paxKey]: +e.target.value })} />
                      <span className="text-center text-slate-300 dark:text-slate-600 text-xs select-none">×</span>
                      <input type="number" min="0"
                        className="w-full text-right border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={priceVal}
                        onChange={e => setForm({ ...form, [t.priceKey]: +e.target.value })} />
                      <span className={`text-right text-xs font-medium tabular-nums ${
                        sub > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600"
                      }`}>
                        {sub > 0 ? `NT$${sub.toLocaleString()}` : "—"}
                      </span>
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
                  return (
                    <div key={ct.id}
                      className="grid items-center px-3 py-2 border-t border-slate-100 dark:border-slate-700/50 gap-x-2"
                      style={{ gridTemplateColumns: "5.5rem 1fr 0.75rem 1fr 5.5rem 1.5rem" }}>
                      <input
                        type="text"
                        placeholder="類別名稱"
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={ct.label}
                        onChange={e => updateCustomTier({ label: e.target.value })}
                      />
                      <input type="number" min="0"
                        className="w-full text-center border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={ct.pax}
                        onChange={e => updateCustomTier({ pax: +e.target.value })} />
                      <span className="text-center text-slate-300 dark:text-slate-600 text-xs select-none">×</span>
                      <input type="number" min="0"
                        className="w-full text-right border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={ct.price}
                        onChange={e => updateCustomTier({ price: +e.target.value })} />
                      <span className={`text-right text-xs font-medium tabular-nums ${
                        sub > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600"
                      }`}>
                        {sub > 0 ? `NT$${sub.toLocaleString()}` : "—"}
                      </span>
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
        />
      )}

      {/* ── Tab: Participants ── */}
      {activeTab === "participants" && (() => {
        const ROOM_PALETTES = [
          { bar:"bg-blue-500",   bg:"bg-blue-50 dark:bg-blue-900/20",   badge:"bg-blue-500 text-white",   header:"text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60"   },
          { bar:"bg-emerald-500",bg:"bg-emerald-50 dark:bg-emerald-900/20",badge:"bg-emerald-500 text-white",header:"text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60"},
          { bar:"bg-violet-500", bg:"bg-violet-50 dark:bg-violet-900/20", badge:"bg-violet-500 text-white", header:"text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800/60" },
          { bar:"bg-amber-500",  bg:"bg-amber-50 dark:bg-amber-900/20",   badge:"bg-amber-500 text-white",  header:"text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60"   },
          { bar:"bg-rose-500",   bg:"bg-rose-50 dark:bg-rose-900/20",     badge:"bg-rose-500 text-white",   header:"text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60"     },
          { bar:"bg-cyan-500",   bg:"bg-cyan-50 dark:bg-cyan-900/20",     badge:"bg-cyan-500 text-white",   header:"text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/60"     },
          { bar:"bg-pink-500",   bg:"bg-pink-50 dark:bg-pink-900/20",     badge:"bg-pink-500 text-white",   header:"text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800/60"     },
          { bar:"bg-teal-500",   bg:"bg-teal-50 dark:bg-teal-900/20",     badge:"bg-teal-500 text-white",   header:"text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60"     },
        ];

        // Room palette（依房號上色）
        const roomNums = Array.from(new Set(participants.map(p=>p.room_number).filter(Boolean))) as string[];
        const paletteMap = new Map(roomNums.map((r,i)=>[r, ROOM_PALETTES[i%ROOM_PALETTES.length]]));

        // 自訂順序列表
        const orderedParts = (() => {
          if (rowOrder.length === 0) return participants;
          const mapped = rowOrder
            .map(pid => participants.find(p => p.id === pid))
            .filter((p): p is (CustomerTour & { customer: Customer }) => !!p);
          const extra = participants.filter(p => !rowOrder.includes(p.id));
          return [...mapped, ...extra];
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
                    <span className="hidden sm:inline">欄位</span>
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
                    <span className="hidden sm:inline">按房號排序</span>
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
                    <span className="hidden sm:inline">列印名單</span>
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
                <button onClick={() => setShowBulkModal(true)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                  <Users className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">批量輸入</span>
                </button>
                <button onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 text-xs px-2.5 sm:px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <UserPlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">加入旅客</span>
                  <span className="sm:hidden">加入</span>
                </button>
              </div>
            </div>

            {/* ── Payment totals summary bar ── */}
            {(() => {
              const allocDeposit = participants.reduce((s,p)=>s+(p.deposit_amount||0),0);
              const allocBalance = participants.reduce((s,p)=>s+(p.balance_amount||0),0);
              const remDeposit = payTotals.deposit - allocDeposit;
              const remBalance = payTotals.balance - allocBalance;
              if (payTotals.deposit === 0 && payTotals.balance === 0) return null;
              return (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label:"訂金", received: payTotals.deposit, alloc: allocDeposit, rem: remDeposit, color:"emerald" },
                    { label:"尾款", received: payTotals.balance,  alloc: allocBalance, rem: remBalance, color:"blue" },
                  ].map(({ label, received, alloc, rem, color }) => received > 0 && (
                    <div key={label} className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3`}>
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
              if (rows.length === 0) return null;
              const totalAmt = rows.reduce((s, t) => s + t.count * t.price, 0);
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
            ) : (
              <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
              <div className="space-y-1.5 min-w-[540px] md:min-w-0">
                {orderedParts.map((p, idx) => {
                  const palette = p.room_number ? paletteMap.get(p.room_number) ?? ROOM_PALETTES[0] : null;
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
                      className={`flex items-center bg-white dark:bg-slate-800 rounded-xl border shadow-sm transition-all select-none ${
                        dragPartIdx === idx
                          ? "opacity-40 border-blue-400 dark:border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800"
                          : "border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600"
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
                        <div className="w-28 flex-shrink-0">
                          <Link href={`/admin/crm/${p.customer_id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline text-sm">
                            {p.customer.name}
                          </Link>
                        </div>
                        {/* participant type badge */}
                        {(() => {
                          const pType = PARTICIPANT_TYPES.find(t => t.key === (p.participant_type || "adult")) || PARTICIPANT_TYPES[0];
                          const isOpen = typePickerId === p.id;
                          return (
                            <div className="w-20 flex-shrink-0 flex items-center">
                              <button
                                onClick={(e) => {
                                  if (isOpen) { setTypePickerId(null); setTypePickerRect(null); }
                                  else { setTypePickerId(p.id); setTypePickerRect(e.currentTarget.getBoundingClientRect()); }
                                }}
                                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-all font-medium ${pType.badge}`}>
                                <span>{pType.icon}</span>
                                <span>{pType.label}</span>
                              </button>
                            </div>
                          );
                        })()}
                        {/* dynamic columns */}
                        {partCols.filter(c => c.visible).map(col => {
                          if (col.key === "phone") return (
                            <div key="phone" className="flex-1 text-sm text-slate-500 dark:text-slate-400 truncate min-w-0 max-w-[120px]">
                              {p.customer.phone || "—"}
                            </div>
                          );
                          if (col.key === "email") return (
                            <div key="email" className="flex-1 text-sm text-slate-500 dark:text-slate-400 truncate min-w-0 max-w-[160px]">
                              {p.customer.email || "—"}
                            </div>
                          );
                          if (col.key === "passport") return (
                            <div key="passport" className="w-28 flex-shrink-0 text-xs text-slate-500 dark:text-slate-400 truncate font-mono">
                              {p.customer.passport || <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </div>
                          );
                          if (col.key === "passport_expiry") {
                            const expired = p.customer.passport_expiry && new Date(p.customer.passport_expiry) < new Date();
                            return (
                              <div key="passport_expiry" className={`w-24 flex-shrink-0 text-xs font-mono ${
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
                            <div key="taibao_number" className="w-28 flex-shrink-0 text-xs text-slate-500 dark:text-slate-400 truncate font-mono">
                              {p.customer.taibao_number || <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </div>
                          );
                          if (col.key === "taibao_expiry") {
                            const expired = p.customer.taibao_expiry && new Date(p.customer.taibao_expiry) < new Date();
                            return (
                              <div key="taibao_expiry" className={`w-24 flex-shrink-0 text-xs font-mono ${
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
                            const field = col.key as "deposit_amount" | "balance_amount";
                            const label = field === "deposit_amount" ? "訂金" : "尾款";
                            const val   = p[field] || 0;
                            const isEdit = editingAmtId === p.id && editingAmtField === field;
                            return (
                              <div key={col.key} className="w-24 flex-shrink-0 flex items-center justify-end">
                                {isEdit ? (
                                  <input autoFocus type="text" inputMode="numeric"
                                    className="w-20 text-xs border border-blue-400 rounded-lg px-2 py-1 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    value={amtInput}
                                    onChange={e => setAmtInput(e.target.value)}
                                    onBlur={() => saveAmount(p.id, field, amtInput)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") saveAmount(p.id, field, amtInput);
                                      if (e.key === "Escape") { setEditingAmtId(null); setEditingAmtField(null); }
                                    }}
                                    placeholder="0" />
                                ) : (
                                  <button
                                    onClick={() => { setEditingAmtId(p.id); setEditingAmtField(field); setAmtInput(val ? String(val) : ""); }}
                                    className={`group/amt text-xs px-2 py-1 rounded-lg transition-all text-right ${
                                      val > 0
                                        ? "text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                                        : "text-slate-300 dark:text-slate-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                    }`}
                                    title={`點擊編輯${label}`}>
                                    {val > 0 ? `NT$${val.toLocaleString()}` : <span className="group-hover/amt:text-blue-400">{label}</span>}
                                  </button>
                                )}
                              </div>
                            );
                          }
                          if (col.key === "meal_preference") {
                            const meals = (p.meal_preference || "").split(",").map(s => s.trim()).filter(Boolean);
                            const isOpen = mealPickerId === p.id;
                            return (
                              <div key="meal" className="w-28 flex-shrink-0 flex items-center">
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
                              <div key="room" className="w-28 flex-shrink-0 flex justify-end pr-1">
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

      {/* ── Type picker (fixed) ── */}
      {typePickerId && typePickerRect && (() => {
        const spaceBelow = window.innerHeight - typePickerRect.bottom;
        const openUp = spaceBelow < 200;
        const dropStyle: React.CSSProperties = {
          position: "fixed",
          left: typePickerRect.left,
          zIndex: 9999,
          ...(openUp
            ? { bottom: window.innerHeight - typePickerRect.top + 4 }
            : { top: typePickerRect.bottom + 4 }),
        };
        const curType = participants.find(x => x.id === typePickerId)?.participant_type || "adult";
        return (
          <>
            <div className="fixed inset-0" style={{ zIndex: 9998 }}
              onClick={() => { setTypePickerId(null); setTypePickerRect(null); }} />
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-2 min-w-[120px]"
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
                  </button>
                );
              })}
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
