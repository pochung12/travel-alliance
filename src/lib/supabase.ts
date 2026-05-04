import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type TourStatus = 'planning' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled';

export interface Tour {
  id: string; name: string; destination: string;
  start_date: string; end_date: string; pax: number;
  selling_price: number; status: TourStatus; notes: string; created_at: string;
}

export const COST_CATEGORIES = [
  { key: 'flight',    label: '✈️ 交通（機票）' },
  { key: 'bus',       label: '🚌 交通（巴士）' },
  { key: 'hotel',     label: '🏨 住宿' },
  { key: 'meals',     label: '🍽️ 餐食' },
  { key: 'tickets',   label: '🎫 門票' },
  { key: 'tip',       label: '💰 導遊小費' },
  { key: 'insurance', label: '🛡️ 保險' },
  { key: 'land_cost', label: '🌏 地接社團費' },
  { key: 'misc',      label: '📦 雜費' },
] as const;

export type CostCategory = typeof COST_CATEGORIES[number]['key'];

export interface TourCost {
  id: string; tour_id: string; category: CostCategory;
  description: string; unit_price: number; quantity: number; notes: string;
}

export type CustomerGender = 'male' | 'female' | 'other';

export interface Customer {
  id: string; name: string; phone: string; email: string;
  id_number: string; passport: string; birthday: string;
  gender: CustomerGender; address: string;
  emergency_contact: string; emergency_phone: string;
  notes: string; created_at: string;
}

export interface CustomerTour {
  id: string; customer_id: string; tour_id: string;
  status: 'registered' | 'confirmed' | 'cancelled';
  paid_amount: number; notes: string; tour?: Tour; customer?: Customer;
}
