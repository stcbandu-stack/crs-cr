// ============ Database Types ============

export interface Profile {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'manager' | 'viewer';
  display_name: string;
  created_at?: string;
}

export interface UserSession {
  id: string;
  user_id: string;
  device_id: string;
  device_name: string;
  last_active: string;
  created_at?: string;
}

export interface ProviderInfo {
  id: string;
  org_name: string;
  address: string;
  phone: string;
  tax_id: string;
  logo_url?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  created_at?: string;
}

export interface Service {
  id: string;
  service_name: string;
  unit_price: number;
  created_at?: string;
}

export interface OrderItem {
  service: Service | { service_name: string; unit_price: number };
  customName?: string;
  w: number;
  h: number;
  unit: 'cm' | 'm';
  qty: number;
  base_price: number;
  price: number;
  total: number;
  note?: string;
}

export interface JobOrder {
  id?: string;
  job_id: string;
  customer_name: string;
  branch?: string;
  event_name?: string;
  event_date?: string;
  items: OrderItem[];
  total_price: number;
  created_by: string;
  status: JobStatus;
  created_at?: string;
  updated_at?: string;
}

export type JobStatus = 
  | 'waiting_approval'
  | 'received'
  | 'queueing'
  | 'printing'
  | 'completed'
  | 'cancelled';

export interface Material {
  id: string;
  name: string;
  category: string;
  type: 'roll' | 'piece' | 'pack';
  brand?: string;
  supplier?: string;
  details?: string;
  width: number;
  remaining_qty: number;
  total_in?: number;
  total_out?: number;
  min_alert: number;
  unit: string;
  cost_per_unit: number;
  image_url?: string;
  is_deleted: boolean;
  created_at?: string;
}

export interface MaterialLog {
  id: string;
  material_id: string;
  action_type: 'CREATE' | 'IN' | 'OUT' | 'DELETE';
  qty_change: number;
  width_used?: number;
  length_used?: number;
  current_qty_snapshot: number;
  note?: string;
  action_by: string;
  action_date: string;
  created_at?: string;
}

// ============ UI Types ============

export interface Toast {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export interface ConfirmModal {
  isOpen: boolean;
  message: string;
  onConfirm: (() => Promise<void>) | null;
}

export interface StatusOption {
  label: string;
  class: string;
}

export type StatusOptions = Record<JobStatus, StatusOption>;

// ============ Constants ============

export const STATUS_OPTIONS: StatusOptions = {
  'waiting_approval': { label: 'รออนุมัติ', class: 'bg-gray-200 text-gray-700' },
  'received': { label: 'เข้าสู่ระบบแล้ว', class: 'bg-blue-100 text-blue-700' },
  'queueing': { label: 'รอคิวปริ้น', class: 'bg-yellow-100 text-yellow-700' },
  'printing': { label: 'กำลังปริ้น', class: 'bg-purple-100 text-purple-700' },
  'completed': { label: 'เสร็จแล้ว', class: 'bg-green-100 text-green-700' },
  'cancelled': { label: 'ยกเลิก', class: 'bg-red-100 text-red-700' },
};

export const MATERIAL_CATEGORIES = ['ไวนิล', 'สติกเกอร์', 'หมึกพิมพ์', 'อุปกรณ์ประกอบ', 'อื่นๆ'];

export const MATERIAL_TYPES = [
  { id: 'roll', label: 'ม้วน (คำนวณ ตร.ม.)' },
  { id: 'piece', label: 'ชิ้น (ตัดใช้เป็นชิ้น)' },
  { id: 'pack', label: 'หน่วย/แพ็ค (เบิกทั้งหน่วย)' },
] as const;

export const CONFIG = {
  ITEMS_PER_PAGE: 50,
  SESSION_CHECK_INTERVAL: 60000,
  TOAST_DURATION: 3000,
  MAX_DEVICES: 2,
  DEVICE_ID_KEY: 'device_id',
  LOGS_PER_PAGE: 50,
  DEFAULT_UNIT: 'ชิ้น',
  ROLL_UNIT: 'ตร.ม.',
};

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  'admin': ['manage_stock', 'change_status', 'manage_users', 'manage_prices', 'delete_data'],
  'user': ['manage_stock', 'change_status'],
  'manager': ['manage_stock', 'change_status', 'approve_order'],
  'viewer': [],
};
