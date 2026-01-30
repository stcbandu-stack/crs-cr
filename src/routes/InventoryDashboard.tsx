import { Component, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useInventoryDashboard } from '@/composables/useInventoryDashboard';
import { formatCurrency } from '@/lib/utils';
import type { PeriodType } from '@/composables/useInventoryDashboard';

const InventoryDashboard: Component = () => {
  const navigate = useNavigate();
  const dashboard = useInventoryDashboard();

  onMount(() => {
    dashboard.fetchData();
  });

  return (
    <div class="container mx-auto p-4">
      {/* Header */}
      <button
        onClick={() => navigate('/inventory')}
        class="mb-4 text-gray-500 hover:text-gray-800 flex items-center gap-1 no-print"
      >
        ← กลับหน้าคลังวัสดุ
      </button>

      {/* Title & Controls */}
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 class="text-2xl font-bold flex items-center gap-2">📊 Dashboard คลังวัสดุ</h2>

        <div class="flex flex-wrap gap-2 no-print">
          <select
            class="border rounded px-3 py-2 bg-white"
            value={dashboard.period()}
            onChange={(e) => dashboard.setPeriod(e.currentTarget.value as PeriodType)}
          >
            <option value="week">สัปดาห์นี้ (7 วัน)</option>
            <option value="month">เดือนนี้ (30 วัน)</option>
            <option value="custom">กำหนดเอง</option>
          </select>

          <Show when={dashboard.period() === 'custom'}>
            <input
              type="date"
              class="border rounded px-3 py-2"
              value={dashboard.customStartDate()}
              onChange={(e) => dashboard.setCustomStartDate(e.currentTarget.value)}
            />
            <span class="self-center">ถึง</span>
            <input
              type="date"
              class="border rounded px-3 py-2"
              value={dashboard.customEndDate()}
              onChange={(e) => dashboard.setCustomEndDate(e.currentTarget.value)}
            />
          </Show>

          <button
            onClick={dashboard.exportReport}
            class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2"
          >
            🖨️ พิมพ์รายงาน
          </button>

          <button
            onClick={() => navigate('/inventory/report')}
            class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
          >
            📋 รายงานวัสดุ
          </button>
        </div>
      </div>

      <div class="text-sm text-gray-500 mb-4">
        📅 ช่วงเวลา: <strong>{dashboard.formatDateRange()}</strong>
      </div>

      {/* Loading State */}
      <Show when={dashboard.data().loading}>
        <div class="text-center py-12 text-gray-500">⏳ กำลังโหลดข้อมูล...</div>
      </Show>

      {/* Dashboard Content */}
      <Show when={!dashboard.data().loading}>
        {/* Summary Cards */}
        <SummaryCards summary={dashboard.summary()} />

        {/* In/Out Summary */}
        <InOutSummary summary={dashboard.summary()} />

        {/* Category Breakdown */}
        <CategoryTable categories={dashboard.categoryBreakdown()} />

        {/* Two Column Layout */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LowStockList items={dashboard.lowStockItems()} />
          <TopMoversList items={dashboard.topMovers()} />
        </div>

        {/* Activity Timeline */}
        <ActivityTimeline logs={dashboard.activityTimeline()} />
      </Show>
    </div>
  );
};

// ============ Sub-Components ============

const SummaryCards: Component<{ summary: ReturnType<ReturnType<typeof useInventoryDashboard>['summary']> }> = (props) => (
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    <div class="bg-white rounded-lg shadow p-4 text-center">
      <div class="text-3xl font-bold text-blue-600">{props.summary.totalMaterials}</div>
      <div class="text-sm text-gray-500">วัสดุทั้งหมด</div>
    </div>
    <div class="bg-white rounded-lg shadow p-4 text-center">
      <div class="text-2xl font-bold text-gray-700">{formatCurrency(props.summary.totalValue)}</div>
      <div class="text-sm text-gray-500">มูลค่าคงเหลือ</div>
    </div>
    <div class={`rounded-lg shadow p-4 text-center ${props.summary.lowStockCount > 0 ? 'bg-yellow-50' : 'bg-white'}`}>
      <div class="text-3xl font-bold text-yellow-600">{props.summary.lowStockCount}</div>
      <div class="text-sm text-gray-500">ใกล้หมด</div>
    </div>
    <div class={`rounded-lg shadow p-4 text-center ${props.summary.outOfStockCount > 0 ? 'bg-red-50' : 'bg-white'}`}>
      <div class="text-3xl font-bold text-red-600">{props.summary.outOfStockCount}</div>
      <div class="text-sm text-gray-500">หมดแล้ว</div>
    </div>
  </div>
);

const InOutSummary: Component<{ summary: ReturnType<ReturnType<typeof useInventoryDashboard>['summary']> }> = (props) => (
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
    <div class="bg-green-50 rounded-lg shadow p-4 border-l-4 border-green-500">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm text-green-700">รับเข้าในช่วงนี้</div>
          <div class="text-3xl font-bold text-green-600">+{props.summary.totalIn.toFixed(2)}</div>
          <div class="text-xs text-green-600">หน่วย</div>
        </div>
        <div class="text-4xl opacity-30">📥</div>
      </div>
    </div>
    <div class="bg-red-50 rounded-lg shadow p-4 border-l-4 border-red-500">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm text-red-700">เบิกออกในช่วงนี้</div>
          <div class="text-3xl font-bold text-red-600">-{props.summary.totalOut.toFixed(2)}</div>
          <div class="text-xs text-red-600">หน่วย</div>
        </div>
        <div class="text-4xl opacity-30">📤</div>
      </div>
    </div>
  </div>
);

const CategoryTable: Component<{ categories: ReturnType<ReturnType<typeof useInventoryDashboard>['categoryBreakdown']> }> = (props) => (
  <div class="bg-white rounded-lg shadow mb-6 overflow-hidden">
    <div class="bg-gray-50 px-4 py-3 border-b">
      <h3 class="font-bold text-gray-700">📊 สรุปตามหมวดหมู่</h3>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-100">
          <tr>
            <th class="p-3 text-left">หมวดหมู่</th>
            <th class="p-3 text-center">จำนวนรายการ</th>
            <th class="p-3 text-right">คงเหลือ</th>
            <th class="p-3 text-right">รับเข้า</th>
            <th class="p-3 text-right">เบิกออก</th>
            <th class="p-3 text-right">มูลค่า</th>
            <th class="p-3 text-center">ใกล้หมด</th>
            <th class="p-3 text-center">หมด</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.categories}>
            {(cat) => (
              <tr class="border-b hover:bg-gray-50">
                <td class="p-3 font-medium">{cat.category}</td>
                <td class="p-3 text-center">{cat.totalItems}</td>
                <td class="p-3 text-right">{cat.totalRemaining.toFixed(2)}</td>
                <td class="p-3 text-right text-green-600">+{cat.totalIn.toFixed(2)}</td>
                <td class="p-3 text-right text-red-600">-{cat.totalOut.toFixed(2)}</td>
                <td class="p-3 text-right">{formatCurrency(cat.totalValue)}</td>
                <td class="p-3 text-center">
                  <Show when={cat.lowStockCount > 0} fallback="-">
                    <span class="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs">{cat.lowStockCount}</span>
                  </Show>
                </td>
                <td class="p-3 text-center">
                  <Show when={cat.outOfStockCount > 0} fallback="-">
                    <span class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs">{cat.outOfStockCount}</span>
                  </Show>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  </div>
);

const LowStockList: Component<{ items: ReturnType<ReturnType<typeof useInventoryDashboard>['lowStockItems']> }> = (props) => (
  <Show when={props.items.length > 0}>
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <div class="bg-yellow-50 px-4 py-3 border-b border-yellow-200">
        <h3 class="font-bold text-yellow-800">⚠️ รายการที่ต้องสั่งซื้อ</h3>
      </div>
      <div class="divide-y max-h-96 overflow-y-auto">
        <For each={props.items}>
          {(item) => (
            <div class={`p-3 flex justify-between items-center ${item.remaining_qty === 0 ? 'bg-red-50' : 'bg-yellow-50/50'}`}>
              <div>
                <div class="font-medium">{item.name}</div>
                <div class="text-xs text-gray-500">{item.category}</div>
              </div>
              <div class="text-right">
                <div class={`font-bold ${item.remaining_qty === 0 ? 'text-red-600' : 'text-yellow-600'}`}>
                  {item.remaining_qty.toFixed(2)} {item.unit}
                </div>
                <div class="text-xs text-gray-500">เตือนที่ {item.min_alert}</div>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  </Show>
);

const TopMoversList: Component<{ items: ReturnType<ReturnType<typeof useInventoryDashboard>['topMovers']> }> = (props) => (
  <div class="bg-white rounded-lg shadow overflow-hidden">
    <div class="bg-blue-50 px-4 py-3 border-b border-blue-200">
      <h3 class="font-bold text-blue-800">🔥 Top 10 วัสดุเคลื่อนไหวมากสุด</h3>
    </div>
    <div class="divide-y max-h-96 overflow-y-auto">
      <Show when={props.items.length === 0}>
        <div class="p-4 text-center text-gray-500">ไม่มีการเคลื่อนไหวในช่วงเวลานี้</div>
      </Show>
      <For each={props.items}>
        {(item, idx) => (
          <div class="p-3 flex justify-between items-center hover:bg-gray-50">
            <div class="flex items-center gap-3">
              <span class="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                {idx() + 1}
              </span>
              <div>
                <div class="font-medium">{item.materialName}</div>
                <div class="text-xs text-gray-500">{item.category}</div>
              </div>
            </div>
            <div class="text-right text-sm">
              <span class="text-green-600">+{item.inQty.toFixed(1)}</span>
              <span class="text-gray-400 mx-1">/</span>
              <span class="text-red-600">-{item.outQty.toFixed(1)}</span>
            </div>
          </div>
        )}
      </For>
    </div>
  </div>
);

const ActivityTimeline: Component<{ logs: ReturnType<ReturnType<typeof useInventoryDashboard>['activityTimeline']> }> = (props) => (
  <div class="bg-white rounded-lg shadow mt-6 overflow-hidden">
    <div class="bg-gray-50 px-4 py-3 border-b">
      <h3 class="font-bold text-gray-700">📜 รายการเคลื่อนไหวล่าสุด</h3>
    </div>
    <div class="divide-y max-h-80 overflow-y-auto">
      <Show when={props.logs.length === 0}>
        <div class="p-4 text-center text-gray-500">ไม่มีรายการในช่วงเวลานี้</div>
      </Show>
      <For each={props.logs}>
        {(log) => (
          <div class="p-3 flex items-center gap-4 hover:bg-gray-50">
            <div
              class={`w-10 h-10 rounded-full flex items-center justify-center ${
                log.action_type === 'IN'
                  ? 'bg-green-100 text-green-600'
                  : log.action_type === 'OUT'
                  ? 'bg-red-100 text-red-600'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {log.action_type === 'IN' ? '📥' : log.action_type === 'OUT' ? '📤' : '📝'}
            </div>
            <div class="flex-1">
              <div class="font-medium">{log.materialName}</div>
              <div class="text-xs text-gray-500">
                {log.note || '-'} • โดย {log.action_by}
              </div>
            </div>
            <div class="text-right">
              <div
                class={`font-bold ${
                  log.action_type === 'IN'
                    ? 'text-green-600'
                    : log.action_type === 'OUT'
                    ? 'text-red-600'
                    : 'text-gray-600'
                }`}
              >
                {log.action_type === 'IN' ? '+' : log.action_type === 'OUT' ? '-' : ''}
                {Math.abs(log.qty_change).toFixed(2)} {log.materialUnit}
              </div>
              <div class="text-xs text-gray-400">
                {new Date(log.created_at || log.action_date).toLocaleDateString('th-TH', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        )}
      </For>
    </div>
  </div>
);

export default InventoryDashboard;
