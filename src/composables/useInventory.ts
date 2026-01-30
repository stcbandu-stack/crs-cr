import { createSignal, createMemo, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { supabase } from '@/lib/supabase';
import { showToast, openConfirm } from '@/store/ui';
import { authState } from '@/store/auth';
import type { Material, MaterialLog } from '@/lib/types';
import { MATERIAL_CATEGORIES, MATERIAL_TYPES, CONFIG } from '@/lib/types';

// ============ State ============
interface InventoryState {
  materials: Material[];
  logs: MaterialLog[];
  materialSearch: string;
  viewMode: 'grid' | 'table';
  activeTab: 'printing' | 'consumable';
  logSearch: string;
  logCategoryFilter: string;
  logMonthFilter: string;
  currentLogPage: number;
}

const [state, setState] = createStore<InventoryState>({
  materials: [],
  logs: [],
  materialSearch: '',
  viewMode: 'grid',
  activeTab: 'printing',
  logSearch: '',
  logCategoryFilter: '',
  logMonthFilter: '',
  currentLogPage: 1,
});

// Material Modal State
interface MaterialModalState {
  isOpen: boolean;
  mode: 'add' | 'edit';
  data: Partial<Material>;
}

const [materialModal, setMaterialModal] = createSignal<MaterialModalState>({
  isOpen: false,
  mode: 'add',
  data: {},
});

// Stock Action Modal State
interface StockActionModalState {
  isOpen: boolean;
  type: 'IN' | 'OUT';
  material: Material | null;
  data: {
    qty: number;
    length: number;
    date: string;
    user: string;
    note: string;
  };
}

const [stockActionModal, setStockActionModal] = createSignal<StockActionModalState>({
  isOpen: false,
  type: 'IN',
  material: null,
  data: {
    qty: 0,
    length: 0,
    date: new Date().toISOString().split('T')[0],
    user: '',
    note: '',
  },
});

// ============ Computed Properties ============

const sortedMaterials = createMemo(() => {
  let items = state.materials.filter((m) => !m.is_deleted);

  // Filter by active tab
  if (state.activeTab === 'printing') {
    items = items.filter((m) => m.type === 'roll');
  } else {
    items = items.filter((m) => m.type !== 'roll');
  }

  // Filter by search query
  const query = state.materialSearch.toLowerCase().trim();
  if (query) {
    items = items.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        (m.brand || '').toLowerCase().includes(query) ||
        m.category.toLowerCase().includes(query)
    );
  }

  // Sort: out of stock first, then low stock, then by category
  return [...items].sort((a, b) => {
    if (a.remaining_qty === 0 && b.remaining_qty !== 0) return -1;
    if (b.remaining_qty === 0 && a.remaining_qty !== 0) return 1;

    const aLow = a.remaining_qty <= a.min_alert;
    const bLow = b.remaining_qty <= b.min_alert;
    if (aLow && !bLow) return -1;
    if (!aLow && bLow) return 1;

    return a.category.localeCompare(b.category);
  });
});

const totalStockValue = createMemo(() =>
  sortedMaterials().reduce((sum, m) => sum + m.remaining_qty * (m.cost_per_unit || 0), 0)
);

const totalInValue = createMemo(() =>
  sortedMaterials().reduce((sum, m) => sum + (m.total_in || 0) * (m.cost_per_unit || 0), 0)
);

const totalOutValue = createMemo(() =>
  sortedMaterials().reduce((sum, m) => sum + (m.total_out || 0) * (m.cost_per_unit || 0), 0)
);

const filteredLogs = createMemo(() => {
  const query = state.logSearch.toLowerCase().trim();
  const categoryFilter = state.logCategoryFilter;
  const monthFilter = state.logMonthFilter;

  return state.logs.filter((log) => {
    const material = state.materials.find((x) => x.id === log.material_id);
    const materialName = material?.name || (log.note?.includes('Deleted') ? 'รายการถูกลบ' : 'Unknown/Deleted');

    const matchesSearch =
      !query || materialName.toLowerCase().includes(query) || (log.note || '').toLowerCase().includes(query);

    const matchesCategory = !categoryFilter || material?.category === categoryFilter;

    let matchesMonth = true;
    if (monthFilter && log.action_date) {
      matchesMonth = log.action_date.startsWith(monthFilter);
    }

    return matchesSearch && matchesCategory && matchesMonth;
  });
});

const totalLogPages = createMemo(() => Math.ceil(filteredLogs().length / CONFIG.LOGS_PER_PAGE) || 1);

const paginatedLogs = createMemo(() => {
  const start = (state.currentLogPage - 1) * CONFIG.LOGS_PER_PAGE;
  return filteredLogs().slice(start, start + CONFIG.LOGS_PER_PAGE);
});

// Reset pagination when filters change
createEffect(() => {
  // Track these dependencies
  state.logSearch;
  state.logCategoryFilter;
  state.logMonthFilter;
  setState('currentLogPage', 1);
});

// ============ Actions ============

const fetchMaterials = async (): Promise<void> => {
  try {
    const { data, error } = await supabase.from('materials').select('*');
    if (error) throw error;
    setState('materials', data || []);
  } catch (e) {
    console.error('Error fetching materials:', e);
    showToast('ไม่สามารถโหลดข้อมูลวัสดุ', 'error');
  }
};

const fetchLogs = async (): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('material_logs')
      .select('*')
      .order('action_date', { ascending: false })
      .limit(1000);
    if (error) throw error;
    setState('logs', data || []);
  } catch (e) {
    console.error('Error fetching logs:', e);
    showToast('ไม่สามารถโหลดประวัติการจัดการสต็อก', 'error');
  }
};

const getDefaultMaterialData = (): Partial<Material> => ({
  name: '',
  category: MATERIAL_CATEGORIES[0],
  type: 'roll',
  brand: '',
  supplier: '',
  details: '',
  width: 0,
  remaining_qty: 0,
  min_alert: 5,
  unit: '',
  cost_per_unit: 0,
  image_url: '',
});

const openMaterialModal = (mode: 'add' | 'edit', item?: Material): void => {
  setMaterialModal({
    isOpen: true,
    mode,
    data: mode === 'edit' && item ? { ...item } : getDefaultMaterialData(),
  });
};

const closeMaterialModal = (): void => {
  setMaterialModal((prev) => ({ ...prev, isOpen: false }));
};

const saveMaterial = async (): Promise<boolean> => {
  const modal = materialModal();
  const materialData = modal.data;

  if (!materialData.name) {
    showToast('ระบุชื่อวัสดุ', 'error');
    return false;
  }

  // Set unit based on material type
  if (materialData.type === 'roll') {
    materialData.unit = CONFIG.ROLL_UNIT;
  } else if (!materialData.unit) {
    materialData.unit = CONFIG.DEFAULT_UNIT;
  }

  const payload = {
    name: materialData.name,
    category: materialData.category,
    type: materialData.type,
    brand: materialData.brand,
    supplier: materialData.supplier,
    details: materialData.details,
    width: parseFloat(String(materialData.width || 0)),
    remaining_qty: parseFloat(String(materialData.remaining_qty || 0)),
    unit: materialData.unit,
    cost_per_unit: parseFloat(String(materialData.cost_per_unit || 0)),
    min_alert: parseFloat(String(materialData.min_alert || 0)),
    image_url: materialData.image_url,
    is_deleted: false,
  };

  try {
    if (modal.mode === 'add') {
      const { data, error } = await supabase.from('materials').insert(payload).select().single();
      if (error) throw error;

      if (data) {
        await supabase.from('material_logs').insert({
          material_id: data.id,
          action_type: 'CREATE',
          qty_change: parseFloat(String(materialData.remaining_qty || 0)),
          current_qty_snapshot: parseFloat(String(materialData.remaining_qty || 0)),
          note: 'เพิ่มใหม่',
          action_by: authState.profile?.display_name || '',
          action_date: new Date().toISOString(),
        });
      }
    } else {
      const { error } = await supabase.from('materials').update(payload).eq('id', materialData.id);
      if (error) throw error;
    }

    showToast('บันทึกเรียบร้อย');
    closeMaterialModal();
    await fetchMaterials();
    return true;
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    showToast(`ไม่สามารถบันทึก: ${errorMessage}`, 'error');
    return false;
  }
};

const deleteMaterial = (id: string): void => {
  openConfirm('ต้องการลบรายการนี้ใช่ไหม?', async () => {
    const { error } = await supabase.from('materials').update({ is_deleted: true }).eq('id', id);

    if (!error) {
      await supabase.from('material_logs').insert({
        material_id: id,
        action_type: 'DELETE',
        qty_change: 0,
        current_qty_snapshot: 0,
        note: 'ลบรายการ',
        action_by: authState.profile?.display_name || '',
        action_date: new Date().toISOString(),
      });
      showToast('ลบเรียบร้อย');
      await fetchMaterials();
    } else {
      showToast(error.message, 'error');
    }
  });
};

const openStockAction = (type: 'IN' | 'OUT', item: Material): void => {
  setStockActionModal({
    isOpen: true,
    type,
    material: item,
    data: {
      qty: 0,
      length: 0,
      date: new Date().toISOString().split('T')[0],
      user: authState.profile?.display_name || '',
      note: '',
    },
  });
};

const closeStockAction = (): void => {
  setStockActionModal((prev) => ({ ...prev, isOpen: false }));
};

const submitStockAction = async (): Promise<boolean> => {
  const modal = stockActionModal();
  const { type, material, data } = modal;

  if (!material) return false;

  const inputQty = parseFloat(String(data.qty || 0));
  const inputLength = parseFloat(String(data.length || 0));
  let finalQtyChange = 0;
  let noteText = data.note;

  if (material.type === 'roll') {
    if (inputLength <= 0) {
      showToast('ระบุความยาว', 'error');
      return false;
    }
    finalQtyChange = material.width * inputLength;
    noteText += ` (${type === 'IN' ? 'รับ' : 'เบิก'} ${inputLength}ม. x ${material.width}ม.)`;
  } else {
    if (inputQty <= 0) {
      showToast('ระบุจำนวน', 'error');
      return false;
    }
    finalQtyChange = inputQty;
  }

  if (type === 'OUT' && finalQtyChange > material.remaining_qty) {
    showToast(`สต็อกไม่พอ (มี ${material.remaining_qty})`, 'error');
    return false;
  }

  const newBalance =
    type === 'IN' ? material.remaining_qty + finalQtyChange : material.remaining_qty - finalQtyChange;
  const newTotalIn = type === 'IN' ? (material.total_in || 0) + finalQtyChange : material.total_in;
  const newTotalOut = type === 'OUT' ? (material.total_out || 0) + finalQtyChange : material.total_out;

  try {
    const { error } = await supabase
      .from('materials')
      .update({
        remaining_qty: newBalance,
        total_in: newTotalIn,
        total_out: newTotalOut,
      })
      .eq('id', material.id);

    if (error) throw error;

    await supabase.from('material_logs').insert({
      material_id: material.id,
      action_type: type,
      qty_change: finalQtyChange,
      width_used: material.type === 'roll' ? material.width : null,
      length_used: material.type === 'roll' ? inputLength : null,
      current_qty_snapshot: newBalance,
      note: noteText,
      action_by: data.user,
      action_date: data.date,
    });

    showToast('เรียบร้อย');
    closeStockAction();
    await fetchMaterials();
    return true;
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    showToast(errorMessage, 'error');
    return false;
  }
};

const changeLogPage = (pageNum: number): void => {
  let newPage = pageNum;
  if (newPage < 1) newPage = 1;
  if (newPage > totalLogPages()) newPage = totalLogPages();
  setState('currentLogPage', newPage);
};

const exportLogsCSV = (): void => {
  const dataToExport = filteredLogs();
  if (dataToExport.length === 0) {
    showToast('ไม่พบข้อมูล', 'error');
    return;
  }

  const headers = 'วันที่,รายการ,หมวดหมู่,ประเภท,จำนวน,ทุน,รวม,คงเหลือ,รายละเอียด,ผู้ทำ';
  const csvContent = dataToExport
    .map((log) => {
      const material = state.materials.find((m) => m.id === log.material_id);
      return [
        log.action_date ? log.action_date.slice(0, 10) : '-',
        `"${(material?.name || '-').replace(/"/g, '""')}"`,
        material?.category || '-',
        log.action_type,
        log.qty_change,
        material?.cost_per_unit || 0,
        log.qty_change * (material?.cost_per_unit || 0),
        log.current_qty_snapshot,
        `"${(log.note || '').replace(/"/g, '""')}"`,
        log.action_by,
      ].join(',');
    })
    .join('\n');

  const csvData = `\uFEFF${headers}\n${csvContent}`;
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'stock_logs.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ============ Setters ============

const setMaterialSearch = (value: string): void => setState('materialSearch', value);
const setViewMode = (mode: 'grid' | 'table'): void => setState('viewMode', mode);
const setActiveTab = (tab: 'printing' | 'consumable'): void => setState('activeTab', tab);
const setLogSearch = (value: string): void => setState('logSearch', value);
const setLogCategoryFilter = (value: string): void => setState('logCategoryFilter', value);
const setLogMonthFilter = (value: string): void => setState('logMonthFilter', value);

const updateMaterialModalData = (key: keyof Material, value: unknown): void => {
  setMaterialModal((prev) => ({
    ...prev,
    data: { ...prev.data, [key]: value },
  }));
};

const updateStockActionData = (key: string, value: unknown): void => {
  setStockActionModal((prev) => ({
    ...prev,
    data: { ...prev.data, [key]: value },
  }));
};

// ============ Export Hook ============

export const useInventory = () => ({
  // State
  state,
  materialModal,
  stockActionModal,

  // Computed
  sortedMaterials,
  totalStockValue,
  totalInValue,
  totalOutValue,
  filteredLogs,
  totalLogPages,
  paginatedLogs,

  // Constants
  materialCategories: MATERIAL_CATEGORIES,
  materialTypes: MATERIAL_TYPES,

  // Actions
  fetchMaterials,
  fetchLogs,
  openMaterialModal,
  closeMaterialModal,
  saveMaterial,
  deleteMaterial,
  openStockAction,
  closeStockAction,
  submitStockAction,
  changeLogPage,
  exportLogsCSV,

  // Setters
  setMaterialSearch,
  setViewMode,
  setActiveTab,
  setLogSearch,
  setLogCategoryFilter,
  setLogMonthFilter,
  updateMaterialModalData,
  updateStockActionData,
});
