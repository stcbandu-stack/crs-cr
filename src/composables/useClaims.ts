import { createSignal, createMemo } from 'solid-js';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/store/ui';
import { authState } from '@/store/auth';
import type { Claim, ClaimType } from '@/lib/types';

// ============ Types ============

export interface ClaimFormInput {
  jobId: string;
  customerName: string;
  claimType: ClaimType;
  claimNote?: string;
  description: string;
  claimAmount: number;
  responsibleName?: string;
}

export interface EmployeeOption {
  id: string;
  display_name: string;
}

export interface EmployeeClaimSummary {
  name: string;
  count: number;
  totalAmount: number;
}

export interface ClaimTypeSummary {
  type: ClaimType;
  count: number;
  totalAmount: number;
}

// ============ State ============

const [claims, setClaims] = createSignal<Claim[]>([]);
const [employees, setEmployees] = createSignal<EmployeeOption[]>([]);
const [loading, setLoading] = createSignal(false);

// ============ Actions ============

const fetchClaims = async (): Promise<void> => {
  setLoading(true);
  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    showToast('โหลดรายการเคลมไม่สำเร็จ', 'error');
  } else {
    setClaims(data || []);
  }
  setLoading(false);
};

const fetchEmployees = async (): Promise<void> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .neq('role', 'admin')
    .order('display_name');

  if (!error) {
    setEmployees(data || []);
  }
};

const submitClaim = async (input: ClaimFormInput): Promise<boolean> => {
  const { error } = await supabase.from('claims').insert({
    job_id: input.jobId,
    customer_name: input.customerName,
    claim_type: input.claimType,
    claim_note: input.claimNote || null,
    description: input.description,
    claim_amount: input.claimAmount,
    responsible_name: input.responsibleName || null,
    reported_by: authState.profile?.display_name || null,
    status: 'open',
  });

  if (error) {
    console.error(error);
    showToast('บันทึกการแจ้งเคลมไม่สำเร็จ', 'error');
    return false;
  }

  showToast('บันทึกการแจ้งเคลมแล้ว');
  return true;
};

const resolveClaim = async (id: string, resolutionNote: string, responsibleName?: string): Promise<boolean> => {
  const { error } = await supabase
    .from('claims')
    .update({
      status: 'resolved',
      resolution_note: resolutionNote || null,
      resolved_at: new Date().toISOString(),
      ...(responsibleName ? { responsible_name: responsibleName } : {}),
    })
    .eq('id', id);

  if (error) {
    showToast('อัปเดตสถานะไม่สำเร็จ', 'error');
    return false;
  }

  await fetchClaims();
  showToast('ปิดเคสเรียบร้อย');
  return true;
};

const reopenClaim = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from('claims')
    .update({ status: 'open', resolved_at: null, resolution_note: null })
    .eq('id', id);

  if (error) {
    showToast('อัปเดตสถานะไม่สำเร็จ', 'error');
    return false;
  }

  await fetchClaims();
  return true;
};

// ============ Computed: Dashboard Aggregations ============

const totals = createMemo(() => {
  const all = claims();
  const open = all.filter((c) => c.status === 'open');
  return {
    count: all.length,
    totalAmount: all.reduce((sum, c) => sum + c.claim_amount, 0),
    openCount: open.length,
    openAmount: open.reduce((sum, c) => sum + c.claim_amount, 0),
  };
});

const byEmployee = createMemo((): EmployeeClaimSummary[] => {
  const map = new Map<string, EmployeeClaimSummary>();
  for (const c of claims()) {
    const key = c.responsible_name || 'ไม่ระบุ';
    const existing = map.get(key) || { name: key, count: 0, totalAmount: 0 };
    existing.count += 1;
    existing.totalAmount += c.claim_amount;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
});

const byType = createMemo((): ClaimTypeSummary[] => {
  const map = new Map<ClaimType, ClaimTypeSummary>();
  for (const c of claims()) {
    const existing = map.get(c.claim_type) || { type: c.claim_type, count: 0, totalAmount: 0 };
    existing.count += 1;
    existing.totalAmount += c.claim_amount;
    map.set(c.claim_type, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
});

// ============ Export Hook ============

export const useClaims = () => ({
  claims,
  employees,
  loading,
  fetchClaims,
  fetchEmployees,
  submitClaim,
  resolveClaim,
  reopenClaim,
  totals,
  byEmployee,
  byType,
});
