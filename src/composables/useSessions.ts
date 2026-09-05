import { createSignal } from 'solid-js';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/store/ui';

// Admin device monitor — read-only view of who's logged in where.
// user_sessions.user_id FKs to auth.users (not public.profiles), so
// PostgREST can't embed the join; fetch both and match client-side.

export interface AccountSessions {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  devices: { id: string; deviceName: string; lastActive: string }[];
}

const [accounts, setAccounts] = createSignal<AccountSessions[]>([]);
const [loading, setLoading] = createSignal(false);

const fetchSessions = async (): Promise<void> => {
  setLoading(true);

  const [profilesRes, sessionsRes] = await Promise.all([
    supabase.from('profiles').select('id, display_name, email, role').order('display_name'),
    supabase.from('user_sessions').select('id, user_id, device_name, last_active'),
  ]);

  if (profilesRes.error || sessionsRes.error) {
    console.error(profilesRes.error || sessionsRes.error);
    showToast('โหลดข้อมูลอุปกรณ์ที่ล็อกอินไม่สำเร็จ', 'error');
    setLoading(false);
    return;
  }

  const sessionsByUser = new Map<string, AccountSessions['devices']>();
  for (const s of sessionsRes.data || []) {
    const list = sessionsByUser.get(s.user_id) || [];
    list.push({ id: s.id, deviceName: s.device_name || 'ไม่ทราบอุปกรณ์', lastActive: s.last_active });
    sessionsByUser.set(s.user_id, list);
  }

  const result: AccountSessions[] = (profilesRes.data || []).map((p) => ({
    userId: p.id,
    displayName: p.display_name || p.email || '-',
    email: p.email || '-',
    role: p.role || 'user',
    devices: (sessionsByUser.get(p.id) || []).sort((a, b) => b.lastActive.localeCompare(a.lastActive)),
  }));

  // บัญชีที่กำลังใช้งานอยู่ขึ้นก่อน จะได้ไม่ต้องไล่หาในลิสต์ยาวๆ
  result.sort((a, b) => b.devices.length - a.devices.length || a.displayName.localeCompare(b.displayName, 'th'));

  setAccounts(result);
  setLoading(false);
};

export const useSessions = () => ({ accounts, loading, fetchSessions });
