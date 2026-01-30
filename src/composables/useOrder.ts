import { createSignal, createMemo, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { supabase } from '@/lib/supabase';
import { showToast, openConfirm } from '@/store/ui';
import { authState } from '@/store/auth';
import type { JobOrder, OrderItem, Service, Customer, JobStatus } from '@/lib/types';
import { STATUS_OPTIONS, CONFIG } from '@/lib/types';
import { generateJobIdPrefix } from '@/lib/utils';

// ============ State ============
interface OrderFormState {
  customerType: 'general' | 'corporate';
  selectedCustomer: Customer | null;
  customerName: string;
  branch: string;
  eventName: string;
  eventDate: string;
  items: OrderItem[];
  creatorName: string;
}

interface OrderState {
  form: OrderFormState;
  jobHistory: JobOrder[];
  searchQuery: string;
  statusFilter: string;
  currentPage: number;
  showPreview: boolean;
  isHistoryView: boolean;
  generatedJobId: string;
}

const getDefaultForm = (): OrderFormState => ({
  customerType: 'general',
  selectedCustomer: null,
  customerName: '',
  branch: '',
  eventName: '',
  eventDate: '',
  items: [],
  creatorName: '',
});

const [state, setState] = createStore<OrderState>({
  form: getDefaultForm(),
  jobHistory: [],
  searchQuery: '',
  statusFilter: '',
  currentPage: 1,
  showPreview: false,
  isHistoryView: false,
  generatedJobId: '',
});

// ============ Computed Properties ============

const grandTotal = createMemo(() => state.form.items.reduce((sum, item) => sum + item.total, 0));

const filteredHistory = createMemo(() =>
  state.jobHistory.filter((j) => {
    const q = state.searchQuery.toLowerCase();
    return (
      (j.job_id.toLowerCase().includes(q) || (j.customer_name && j.customer_name.toLowerCase().includes(q))) &&
      (!state.statusFilter || j.status === state.statusFilter)
    );
  })
);

const totalPages = createMemo(() => Math.ceil(filteredHistory().length / CONFIG.ITEMS_PER_PAGE) || 1);

const paginatedHistory = createMemo(() => {
  const start = (state.currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
  return filteredHistory().slice(start, start + CONFIG.ITEMS_PER_PAGE);
});

// Reset pagination when filters change
createEffect(() => {
  state.searchQuery;
  state.statusFilter;
  setState('currentPage', 1);
});

// ============ Order Item Actions ============

const createEmptyItem = (services: Service[]): OrderItem => {
  const defaultService = services[0] || { service_name: '', unit_price: 0 };
  return {
    service: defaultService,
    customName: '',
    w: 0,
    h: 0,
    unit: 'cm',
    qty: 1,
    base_price: defaultService.unit_price || 0,
    price: 0,
    total: 0,
    note: '',
  };
};

const addItem = (services: Service[]): void => {
  if (state.form.items.length >= 30) {
    showToast('Limit 30 items', 'error');
    return;
  }
  const newItem = createEmptyItem(services);
  setState('form', 'items', [...state.form.items, newItem]);
  updatePrice(state.form.items.length - 1);
};

const removeItem = (index: number): void => {
  const item = state.form.items[index];
  if (item.total === 0) {
    setState('form', 'items', (items) => items.filter((_, i) => i !== index));
  } else {
    openConfirm('ลบรายการนี้?', async () => {
      setState('form', 'items', (items) => items.filter((_, i) => i !== index));
    });
  }
};

const updateItemField = (index: number, field: keyof OrderItem, value: unknown): void => {
  setState('form', 'items', index, field as keyof OrderItem, value as never);
};

const updatePrice = (index: number): void => {
  const item = state.form.items[index];
  const service = item.service as Service;
  const basePrice = service.service_name === 'อื่นๆ' ? 0 : service.unit_price || 0;

  setState('form', 'items', index, 'base_price', basePrice);

  if (service.service_name === 'อื่นๆ') {
    setState('form', 'items', index, 'price', 0);
  }

  calcRow(index, 'size');
};

const calcRow = (index: number, _type: 'size' | 'qty' | 'manual'): void => {
  const item = state.form.items[index];
  const wm = item.unit === 'cm' ? item.w / 100 : item.w;
  const hm = item.unit === 'cm' ? item.h / 100 : item.h;
  const area = wm * hm;

  const price = area > 0 && item.base_price > 0 ? Math.ceil(area * item.base_price) : Math.ceil(item.base_price);
  const total = price * item.qty;

  setState('form', 'items', index, 'price', price);
  setState('form', 'items', index, 'total', total);
};

// ============ Form Actions ============

const fillCustomerInfo = (customer: Customer): void => {
  setState('form', {
    selectedCustomer: customer,
    customerName: customer.name,
    branch: customer.address + (customer.tax_id ? ` (Tax: ${customer.tax_id})` : ''),
  });
};

const resetOrder = (): void => {
  setState({
    form: getDefaultForm(),
    showPreview: false,
    generatedJobId: '',
    isHistoryView: false,
  });
};

const setFormField = <K extends keyof OrderFormState>(field: K, value: OrderFormState[K]): void => {
  setState('form', field, value);
};

// ============ Job ID Generation ============

const generateJobId = async (): Promise<string> => {
  const prefix = generateJobIdPrefix();

  const { data } = await supabase
    .from('job_orders')
    .select('job_id')
    .ilike('job_id', `${prefix}%`)
    .order('job_id', { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    const lastNum = parseInt(data[0].job_id.slice(-2)) + 1;
    return `${prefix}${String(lastNum).padStart(2, '0')}`;
  }

  return `${prefix}00`;
};

// ============ Preview & Submit ============

const preparePreview = async (): Promise<boolean> => {
  if (!state.form.items.length) {
    showToast('เพิ่มรายการก่อน', 'error');
    return false;
  }

  if (!state.form.customerName) {
    showToast('ระบุลูกค้า', 'error');
    return false;
  }

  if (!state.generatedJobId && !state.isHistoryView) {
    const jobId = await generateJobId();
    setState('generatedJobId', jobId);
  }

  if (!state.isHistoryView) {
    setState('form', 'creatorName', authState.profile?.display_name || authState.user?.email || '');
  }

  setState('showPreview', true);
  return true;
};

const submitOrder = async (): Promise<boolean> => {
  if (!state.form.eventDate || !state.form.customerName) {
    showToast('กรอกข้อมูลให้ครบ', 'error');
    return false;
  }

  return new Promise((resolve) => {
    openConfirm('ยืนยันสั่งงาน?', async () => {
      const payload = {
        job_id: state.generatedJobId,
        customer_name: state.form.customerName,
        branch: state.form.branch,
        event_name: state.form.eventName,
        event_date: state.form.eventDate,
        items: state.form.items,
        total_price: grandTotal(),
        created_by: authState.profile?.display_name || authState.user?.email || '',
        status: 'waiting_approval' as JobStatus,
      };

      const { error } = await supabase.from('job_orders').insert(payload);

      if (error) {
        showToast(error.message, 'error');
        resolve(false);
        return;
      }

      showToast('บันทึกแล้ว!');
      resetOrder();
      resolve(true);
    });
  });
};

const closePreview = (): void => {
  setState('showPreview', false);
  if (state.isHistoryView) {
    resetOrder();
  }
};

// ============ History Actions ============

const fetchHistory = async (): Promise<void> => {
  const { data } = await supabase.from('job_orders').select('*').order('created_at', { ascending: false });

  setState('jobHistory', data || []);
};

const viewJob = (job: JobOrder): void => {
  setState({
    form: {
      customerType: 'general',
      selectedCustomer: null,
      customerName: job.customer_name,
      branch: job.branch || '',
      eventName: job.event_name || '',
      eventDate: job.event_date || '',
      items: job.items,
      creatorName: job.created_by,
    },
    generatedJobId: job.job_id,
    isHistoryView: true,
    showPreview: true,
  });
};

const printJob = (job: JobOrder): void => {
  viewJob(job);
  setTimeout(() => window.print(), 500);
};

const updateJobStatus = async (jobId: string, newStatus: JobStatus): Promise<boolean> => {
  return new Promise((resolve) => {
    openConfirm(`ยืนยันเปลี่ยนสถานะเป็น "${STATUS_OPTIONS[newStatus].label}"?`, async () => {
      const { error } = await supabase.from('job_orders').update({ status: newStatus }).eq('job_id', jobId);

      if (error) {
        showToast(error.message, 'error');
        resolve(false);
        return;
      }

      showToast('เรียบร้อย');
      await fetchHistory();
      resolve(true);
    });
  });
};

// ============ Setters ============

const setSearchQuery = (value: string): void => setState('searchQuery', value);
const setStatusFilter = (value: string): void => setState('statusFilter', value);

const changePage = (page: number): void => {
  if (page >= 1 && page <= totalPages()) {
    setState('currentPage', page);
  }
};

// ============ Export Hook ============

export const useOrder = () => ({
  // State
  state,

  // Computed
  grandTotal,
  filteredHistory,
  totalPages,
  paginatedHistory,

  // Constants
  statusOptions: STATUS_OPTIONS,

  // Item Actions
  addItem,
  removeItem,
  updateItemField,
  updatePrice,
  calcRow,

  // Form Actions
  fillCustomerInfo,
  resetOrder,
  setFormField,

  // Preview & Submit
  preparePreview,
  submitOrder,
  closePreview,

  // History Actions
  fetchHistory,
  viewJob,
  printJob,
  updateJobStatus,

  // Setters
  setSearchQuery,
  setStatusFilter,
  changePage,
});
