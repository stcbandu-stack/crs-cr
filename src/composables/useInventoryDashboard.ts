import { createSignal, createMemo } from 'solid-js';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/store/ui';
import { authState } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import type { Material, MaterialLog } from '@/lib/types';
import { MATERIAL_CATEGORIES } from '@/lib/types';

// ============ Types ============

export type PeriodType = 'week' | 'month' | 'custom';

export interface DashboardData {
  materials: Material[];
  logs: MaterialLog[];
  loading: boolean;
}

export interface CategorySummary {
  category: string;
  totalItems: number;
  totalRemaining: number;
  totalIn: number;
  totalOut: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface TopMover {
  materialId: string;
  materialName: string;
  category: string;
  unit: string;
  inQty: number;
  outQty: number;
  totalMovement: number;
}

export interface ActivityLog extends MaterialLog {
  materialName: string;
  materialUnit: string;
}

export interface DashboardSummary {
  totalMaterials: number;
  totalRemaining: number;
  totalIn: number;
  totalOut: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

// ============ State ============

const [data, setData] = createSignal<DashboardData>({
  materials: [],
  logs: [],
  loading: true,
});

const [period, setPeriod] = createSignal<PeriodType>('week');
const [customStartDate, setCustomStartDate] = createSignal(
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
);
const [customEndDate, setCustomEndDate] = createSignal(
  new Date().toISOString().split('T')[0]
);

// ============ Computed: Date Range ============

const dateRange = createMemo(() => {
  const now = new Date();
  let startDate: Date;
  let endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  if (period() === 'week') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
  } else if (period() === 'month') {
    startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - 1);
    startDate.setHours(0, 0, 0, 0);
  } else {
    startDate = new Date(customStartDate());
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(customEndDate());
    endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
});

// ============ Computed: Filtered Data ============

const activeMaterials = createMemo(() => 
  data().materials.filter(m => !m.is_deleted)
);

const filteredLogs = createMemo(() => {
  const { startDate, endDate } = dateRange();
  return data().logs.filter((log) => {
    const logDate = new Date(log.created_at || log.action_date);
    return logDate >= startDate && logDate <= endDate;
  });
});

// ============ Computed: Summary Statistics ============

const summary = createMemo((): DashboardSummary => {
  const materials = activeMaterials();
  const logs = filteredLogs();

  const totalIn = logs
    .filter((l) => l.action_type === 'IN')
    .reduce((sum, l) => sum + l.qty_change, 0);

  const totalOut = logs
    .filter((l) => l.action_type === 'OUT')
    .reduce((sum, l) => sum + Math.abs(l.qty_change), 0);

  const totalRemaining = materials.reduce((sum, m) => sum + m.remaining_qty, 0);
  const totalValue = materials.reduce((sum, m) => sum + m.remaining_qty * m.cost_per_unit, 0);

  const lowStockCount = materials.filter(
    (m) => m.remaining_qty > 0 && m.remaining_qty <= m.min_alert
  ).length;

  const outOfStockCount = materials.filter((m) => m.remaining_qty === 0).length;

  return {
    totalMaterials: materials.length,
    totalRemaining,
    totalIn,
    totalOut,
    totalValue,
    lowStockCount,
    outOfStockCount,
  };
});

// ============ Computed: Category Breakdown ============

const categoryBreakdown = createMemo((): CategorySummary[] => {
  const materials = activeMaterials();
  const logs = filteredLogs();

  return MATERIAL_CATEGORIES.map((category) => {
    const categoryMaterials = materials.filter((m) => m.category === category);
    const categoryMaterialIds = new Set(categoryMaterials.map((m) => m.id));
    const categoryLogs = logs.filter((l) => categoryMaterialIds.has(l.material_id));

    const totalIn = categoryLogs
      .filter((l) => l.action_type === 'IN')
      .reduce((sum, l) => sum + l.qty_change, 0);

    const totalOut = categoryLogs
      .filter((l) => l.action_type === 'OUT')
      .reduce((sum, l) => sum + Math.abs(l.qty_change), 0);

    return {
      category,
      totalItems: categoryMaterials.length,
      totalRemaining: categoryMaterials.reduce((sum, m) => sum + m.remaining_qty, 0),
      totalIn,
      totalOut,
      totalValue: categoryMaterials.reduce((sum, m) => sum + m.remaining_qty * m.cost_per_unit, 0),
      lowStockCount: categoryMaterials.filter(
        (m) => m.remaining_qty > 0 && m.remaining_qty <= m.min_alert
      ).length,
      outOfStockCount: categoryMaterials.filter((m) => m.remaining_qty === 0).length,
    };
  }).filter((c) => c.totalItems > 0);
});

// ============ Computed: Top Movers ============

const topMovers = createMemo((): TopMover[] => {
  const logs = filteredLogs();
  const materials = data().materials;

  // Group by material_id
  const movementMap = new Map<string, { inQty: number; outQty: number }>();
  logs.forEach((log) => {
    const existing = movementMap.get(log.material_id) || { inQty: 0, outQty: 0 };
    if (log.action_type === 'IN') {
      existing.inQty += log.qty_change;
    } else if (log.action_type === 'OUT') {
      existing.outQty += Math.abs(log.qty_change);
    }
    movementMap.set(log.material_id, existing);
  });

  // Convert to array with material info
  return Array.from(movementMap.entries())
    .map(([materialId, movement]) => {
      const material = materials.find((m) => m.id === materialId);
      return {
        materialId,
        materialName: material?.name || 'Unknown',
        category: material?.category || '',
        unit: material?.unit || '',
        ...movement,
        totalMovement: movement.inQty + movement.outQty,
      };
    })
    .sort((a, b) => b.totalMovement - a.totalMovement)
    .slice(0, 10);
});

// ============ Computed: Low Stock Items ============

const lowStockItems = createMemo(() => {
  return activeMaterials()
    .filter((m) => m.remaining_qty <= m.min_alert)
    .sort((a, b) => a.remaining_qty - b.remaining_qty)
    .slice(0, 10);
});

// ============ Computed: Activity Timeline ============

const activityTimeline = createMemo((): ActivityLog[] => {
  const logs = filteredLogs();
  const materials = data().materials;

  return logs.slice(0, 20).map((log) => {
    const material = materials.find((m) => m.id === log.material_id);
    return {
      ...log,
      materialName: material?.name || 'Unknown',
      materialUnit: material?.unit || '',
    };
  });
});

// ============ Actions ============

const fetchData = async (): Promise<void> => {
  setData((prev) => ({ ...prev, loading: true }));

  try {
    const [materialsRes, logsRes] = await Promise.all([
      supabase.from('materials').select('*'),
      supabase.from('material_logs').select('*').order('created_at', { ascending: false }).limit(5000),
    ]);

    if (materialsRes.error) throw materialsRes.error;
    if (logsRes.error) throw logsRes.error;

    setData({
      materials: materialsRes.data || [],
      logs: logsRes.data || [],
      loading: false,
    });
  } catch (e) {
    console.error('Error fetching dashboard data:', e);
    showToast('ไม่สามารถโหลดข้อมูล Dashboard', 'error');
    setData((prev) => ({ ...prev, loading: false }));
  }
};

// ============ Utilities ============

const formatDateRange = (): string => {
  const { startDate, endDate } = dateRange();
  const formatDate = (d: Date) =>
    d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
};

const formatDateLong = (d: Date): string =>
  d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

// ============ Export Report (Print) ============

const generateReportHtml = (): string => {
  const { startDate, endDate } = dateRange();
  const summaryData = summary();
  const categories = categoryBreakdown();
  const lowStock = lowStockItems();
  const movers = topMovers();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>รายงานสรุปคลังวัสดุ - ${formatDateRange()}</title>
      <meta charset="UTF-8">
      <style>
        @media print {
          @page { margin: 15mm; size: A4; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Tahoma', 'Segoe UI', sans-serif; 
          font-size: 11px; 
          line-height: 1.4;
          color: #333;
          padding: 20px;
        }
        .header { 
          text-align: center; 
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid #2563eb;
        }
        .header h1 { font-size: 20px; color: #1e40af; margin-bottom: 5px; }
        .header .org-name { font-size: 14px; color: #666; }
        .header .period { font-size: 12px; color: #888; margin-top: 8px; }
        .summary-grid { 
          display: grid; 
          grid-template-columns: repeat(4, 1fr); 
          gap: 10px; 
          margin-bottom: 20px; 
        }
        .summary-card { 
          background: #f8fafc; 
          border: 1px solid #e2e8f0;
          border-radius: 8px; 
          padding: 12px; 
          text-align: center; 
        }
        .summary-card .label { font-size: 10px; color: #64748b; }
        .summary-card .value { font-size: 18px; font-weight: bold; color: #1e293b; }
        .summary-card.warning { background: #fef3c7; border-color: #fcd34d; }
        .summary-card.danger { background: #fee2e2; border-color: #fca5a5; }
        .section { margin-bottom: 20px; }
        .section-title { 
          font-size: 14px; 
          font-weight: bold; 
          color: #1e40af;
          margin-bottom: 10px;
          padding-bottom: 5px;
          border-bottom: 1px solid #e2e8f0;
        }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th { 
          background: #f1f5f9; 
          padding: 8px 6px; 
          text-align: left; 
          font-weight: bold;
          border-bottom: 2px solid #cbd5e1;
        }
        td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) { background: #f8fafc; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .text-green { color: #16a34a; }
        .text-red { color: #dc2626; }
        .text-yellow { color: #ca8a04; }
        .badge { 
          display: inline-block; 
          padding: 2px 6px; 
          border-radius: 4px; 
          font-size: 9px; 
          font-weight: bold;
        }
        .badge-in { background: #dcfce7; color: #166534; }
        .badge-out { background: #fee2e2; color: #991b1b; }
        .footer { 
          margin-top: 30px; 
          padding-top: 15px; 
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #64748b;
        }
        .low-stock-row { background: #fef3c7 !important; }
        .out-of-stock-row { background: #fee2e2 !important; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📦 รายงานสรุปคลังวัสดุ</h1>
        <div class="org-name">${authState.provider?.org_name || 'CRS Creative'}</div>
        <div class="period">ช่วงเวลา: ${formatDateLong(startDate)} - ${formatDateLong(endDate)}</div>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="label">วัสดุทั้งหมด</div>
          <div class="value">${summaryData.totalMaterials}</div>
          <div class="label">รายการ</div>
        </div>
        <div class="summary-card">
          <div class="label">มูลค่าคงเหลือ</div>
          <div class="value">${formatCurrency(summaryData.totalValue)}</div>
        </div>
        <div class="summary-card ${summaryData.lowStockCount > 0 ? 'warning' : ''}">
          <div class="label">ใกล้หมด</div>
          <div class="value text-yellow">${summaryData.lowStockCount}</div>
          <div class="label">รายการ</div>
        </div>
        <div class="summary-card ${summaryData.outOfStockCount > 0 ? 'danger' : ''}">
          <div class="label">หมดแล้ว</div>
          <div class="value text-red">${summaryData.outOfStockCount}</div>
          <div class="label">รายการ</div>
        </div>
      </div>

      <div class="summary-grid" style="grid-template-columns: repeat(2, 1fr);">
        <div class="summary-card">
          <div class="label">รับเข้าในช่วงนี้</div>
          <div class="value text-green">+${summaryData.totalIn.toFixed(2)}</div>
          <div class="label">หน่วย</div>
        </div>
        <div class="summary-card">
          <div class="label">เบิกออกในช่วงนี้</div>
          <div class="value text-red">-${summaryData.totalOut.toFixed(2)}</div>
          <div class="label">หน่วย</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📊 สรุปตามหมวดหมู่</div>
        <table>
          <thead>
            <tr>
              <th>หมวดหมู่</th>
              <th class="text-center">จำนวนรายการ</th>
              <th class="text-right">คงเหลือ</th>
              <th class="text-right">รับเข้า</th>
              <th class="text-right">เบิกออก</th>
              <th class="text-right">มูลค่า</th>
              <th class="text-center">ใกล้หมด</th>
              <th class="text-center">หมด</th>
            </tr>
          </thead>
          <tbody>
            ${categories.map((cat) => `
              <tr>
                <td><strong>${cat.category}</strong></td>
                <td class="text-center">${cat.totalItems}</td>
                <td class="text-right">${cat.totalRemaining.toFixed(2)}</td>
                <td class="text-right text-green">+${cat.totalIn.toFixed(2)}</td>
                <td class="text-right text-red">-${cat.totalOut.toFixed(2)}</td>
                <td class="text-right">${formatCurrency(cat.totalValue)}</td>
                <td class="text-center ${cat.lowStockCount > 0 ? 'text-yellow' : ''}">${cat.lowStockCount}</td>
                <td class="text-center ${cat.outOfStockCount > 0 ? 'text-red' : ''}">${cat.outOfStockCount}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${lowStock.length > 0 ? `
      <div class="section">
        <div class="section-title">⚠️ รายการที่ต้องสั่งซื้อ (ใกล้หมด/หมดแล้ว)</div>
        <table>
          <thead>
            <tr>
              <th>ชื่อวัสดุ</th>
              <th>หมวดหมู่</th>
              <th class="text-right">คงเหลือ</th>
              <th class="text-right">เตือนที่</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            ${lowStock.map((item) => `
              <tr class="${item.remaining_qty === 0 ? 'out-of-stock-row' : 'low-stock-row'}">
                <td><strong>${item.name}</strong></td>
                <td>${item.category}</td>
                <td class="text-right">${item.remaining_qty.toFixed(2)} ${item.unit}</td>
                <td class="text-right">${item.min_alert} ${item.unit}</td>
                <td>
                  ${item.remaining_qty === 0
                    ? '<span class="badge badge-out">หมดแล้ว</span>'
                    : '<span class="badge" style="background:#fef3c7;color:#92400e;">ใกล้หมด</span>'
                  }
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">🔥 Top 10 วัสดุที่เคลื่อนไหวมากที่สุด</div>
        <table>
          <thead>
            <tr>
              <th>ชื่อวัสดุ</th>
              <th>หมวดหมู่</th>
              <th class="text-right">รับเข้า</th>
              <th class="text-right">เบิกออก</th>
              <th class="text-right">รวมเคลื่อนไหว</th>
            </tr>
          </thead>
          <tbody>
            ${movers.map((item) => `
              <tr>
                <td><strong>${item.materialName}</strong></td>
                <td>${item.category}</td>
                <td class="text-right text-green">+${item.inQty.toFixed(2)}</td>
                <td class="text-right text-red">-${item.outQty.toFixed(2)}</td>
                <td class="text-right"><strong>${item.totalMovement.toFixed(2)}</strong> ${item.unit}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="footer">
        <div>ออกรายงานโดย: ${authState.profile?.display_name || '-'}</div>
        <div>วันที่ออกรายงาน: ${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </body>
    </html>
  `;
};

const exportReport = (): void => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('ไม่สามารถเปิดหน้าต่างพิมพ์ได้', 'error');
    return;
  }

  printWindow.document.write(generateReportHtml());
  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
  }, 500);
};

// ============ Export Hook ============

export const useInventoryDashboard = () => ({
  // State (readonly)
  data,
  period,
  customStartDate,
  customEndDate,
  
  // Setters
  setPeriod,
  setCustomStartDate,
  setCustomEndDate,
  
  // Computed
  dateRange,
  summary,
  categoryBreakdown,
  topMovers,
  lowStockItems,
  activityTimeline,
  
  // Actions
  fetchData,
  exportReport,
  
  // Utilities
  formatDateRange,
});
