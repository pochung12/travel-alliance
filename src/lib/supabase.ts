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

export interface Tour {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  pax: number;
  selling_price: number;   // 每人售價 (NT$)
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
  created_at: string;
}

export interface CustomerTour {
  id: string;
  customer_id: string;
  tour_id: string;
  status: 'registered' | 'confirmed' | 'cancelled';
  paid_amount: number;
  notes: string;
  tour?: Tour;
  customer?: Customer;
}

export type PaymentType = 'income' | 'expense';

export const INCOME_CATEGORIES = [
  { key: 'deposit',  label: '💰 客款訂金' },
  { key: 'balance',  label: '💵 客款尾款' },
  { key: 'other_in', label: '📥 其他收入' },
] as const;

export const EXPENSE_CATEGORIES = [
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
  created_at: string;
}
