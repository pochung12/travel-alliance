import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Auth / Profile ──────────────────────────────────────────────────────────

export type UserRole = 'customer' | 'staff' | 'admin';

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type TourStatus = 'planning' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled';

/** 自訂人數/售價類別（存在 tours.custom_price_tiers JSONB 欄位） */
export interface CustomPriceTier {
  id: string;    // client-side generated UUID
  label: string; // 類別名稱，e.g. "單人加艙"
  pax: number;   // 人數
  price: number; // 售價 (NT$)
}

export interface Tour {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  pax: number;              // 總人數（= 各類加總，自動計算）
  pax_adult: number;        // 成人人數
  pax_tour_only: number;    // 只參團人數
  pax_child: number;        // 兒童人數
  pax_infant: number;       // 嬰兒人數
  selling_price: number;    // 成人售價 (NT$)
  price_tour_only: number;  // 只參團售價 (NT$)
  price_child: number;      // 兒童售價 (NT$)
  price_infant: number;     // 嬰兒售價 (NT$)
  custom_price_tiers?: CustomPriceTier[]; // 自訂類別（JSONB）
  deposit_per_person?: number;            // 每人訂金金額
  status: TourStatus;
  notes: string;
  created_at: string;
}

export const COST_CATEGORIES = [
  { key: 'flight',       label: '✈️ 交通（機票）' },
  { key: 'bus',          label: '🚌 交通（巴士）' },
  { key: 'hotel',        label: '🏨 住宿' },
  { key: 'meals',        label: '🍽️ 餐食' },
  { key: 'tickets',      label: '🎫 門票' },
  { key: 'tip',          label: '💰 導遊小費' },
  { key: 'insurance',    label: '🛡️ 保險' },
  { key: 'land_cost',    label: '🌏 地接社團費' },
  { key: 'misc',         label: '📦 雜費' },
] as const;

export type CostCategory = typeof COST_CATEGORIES[number]['key'];

export interface TourCost {
  id: string;
  tour_id: string;
  category: CostCategory;
  description: string;
  unit_price: number;
  quantity: number;
  notes: string;
}

export type CustomerGender = 'male' | 'female' | 'other';

export interface Customer {
  id: string;
  name: string;
  name_en: string;           // 英文姓名拼音
  phone: string;
  email: string;
  id_number: string;
  id_card_image: string;     // 身分證 base64 圖片
  passport: string;          // 護照號碼
  passport_expiry: string;   // 護照效期 (YYYY-MM-DD)
  passport_image: string;    // base64 圖片
  taibao_number: string;     // 台胞證號碼
  taibao_expiry: string;     // 台胞證效期 (YYYY-MM-DD)
  taibao_image: string;      // base64 圖片
  birthday: string;
  gender: CustomerGender;
  address: string;
  emergency_contact: string;
  emergency_phone: string;
  notes: string;
  meal_preference: string;   // 預設餐食偏好（comma-separated）
  created_at: string;
}

// 固定四類 + 自訂類別（存 custom_price_tiers 的 id）
export type ParticipantType = 'adult' | 'tour_only' | 'child' | 'infant' | (string & {});

export interface CustomerTour {
  id: string;
  customer_id: string;
  tour_id: string;
  status: 'registered' | 'confirmed' | 'cancelled';
  paid_amount: number;
  deposit_amount: number;    // 旅客訂金（手動分配）
  balance_amount: number;    // 旅客尾款（手動分配）
  participant_type: ParticipantType;  // 身份類型
  notes: string;
  room_number: string;
  meal_preference: string;   // comma-separated: "蛋奶素,不吃牛"
  tour?: Tour;
  customer?: Customer;
}

// ─── Tour Flights ─────────────────────────────────────────────────────────────
export interface TourFlight {
  id: string;
  tour_id: string;
  passenger_name: string;
  pnr: string;
  ticket_number: string;         // 去程票號
  ticket_number_return: string;  // 回程票號
  flight_number: string;
  flight_date: string;        // YYYY-MM-DD
  departure_time: string;     // HH:MM
  arrival_time: string;       // HH:MM
  departure_airport: string;
  departure_terminal: string;
  arrival_airport: string;
  arrival_terminal: string;
  special_meal: string;
  notes: string;
  created_at: string;
}

export type PaymentType = 'income' | 'expense';

export const INCOME_CATEGORIES = [
  { key: 'deposit',  label: '💰 客款訂金' },
  { key: 'balance',  label: '💵 客款尾款' },
  { key: 'other_in', label: '📥 其他收入' },
] as const;

export const EXPENSE_CATEGORIES = [
  { key: 'deposit',   label: '💰 訂金' },
  { key: 'balance',   label: '💵 尾款' },
  { key: 'flight',    label: '✈️ 機票款' },
  { key: 'bus',       label: '🚌 巴士款' },
  { key: 'hotel',     label: '🏨 住宿費' },
  { key: 'meals',     label: '🍽️ 餐食費' },
  { key: 'tickets',   label: '🎫 門票費' },
  { key: 'tip',       label: '💡 導遊小費' },
  { key: 'insurance', label: '🛡️ 保險費' },
  { key: 'land_cost', label: '🌏 地接費' },
  { key: 'misc',      label: '📦 雜費' },
] as const;

export interface TourPayment {
  id: string;
  tour_id: string;
  type: PaymentType;
  category: string;
  description: string;
  amount: number;
  payment_date: string;   // YYYY-MM-DD
  note: string;
  image: string;          // base64 screenshot evidence
  customer_ids: string[]; // 對應旅客 customer_id 陣列（多對多）
  is_payable?: boolean;   // 應付（未付）標記，僅支出使用
  created_at: string;
}
