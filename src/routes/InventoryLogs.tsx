import { Component, For, onMount, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useInventory } from '@/composables/useInventory';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Button } from '@/components';

const InventoryLogs: Component = () => {
  const navigate = useNavigate();
  const inventory = useInventory();

  onMount(() => {
    inventory.fetchLogs();
    inventory.fetchMaterials();
  });

  return (
    <div class="container mx-auto p-4">
      {/* Header */}
      <button
        onClick={() => navigate('/inventory')}
        class="mb-4 text-gray-500 hover:text-gray-800 flex items-center gap-1"
      >
        ← กลับคลังวัสดุ
      </button>

      <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h2 class="text-2xl font-bold">📜 ประวัติการจัดการสต็อก</h2>

        <Button onClick={inventory.exportLogsCSV}>📥 Export CSV</Button>
      </div>

      {/* Filters */}
      <div class="bg-white p-4 rounded shadow mb-6 flex flex-col md:flex-row gap-4">
        <div class="relative flex-1">
          <span class="absolute left-3 top-2.5 text-gray-400">🔍</span>
          <input
            type="text"
            placeholder="ค้นหา..."
            class="pl-9 pr-4 py-2 border rounded w-full focus:ring-2 focus:ring-blue-300 outline-none"
            value={inventory.state.logSearch}
            onInput={(e) => inventory.setLogSearch(e.currentTarget.value)}
          />
        </div>

        <select
          class="border p-2 rounded"
          value={inventory.state.logCategoryFilter}
          onChange={(e) => inventory.setLogCategoryFilter(e.currentTarget.value)}
        >
          <option value="">ทุกหมวดหมู่</option>
          <For each={inventory.materialCategories}>
            {(cat) => <option value={cat}>{cat}</option>}
          </For>
        </select>

        <input
          type="month"
          class="border p-2 rounded"
          value={inventory.state.logMonthFilter}
          onChange={(e) => inventory.setLogMonthFilter(e.currentTarget.value)}
        />
      </div>

      {/* Table */}
      <div class="bg-white rounded shadow overflow-hidden">
        {/* Top Pagination */}
        <Show when={inventory.filteredLogs().length > 0}>
          <div class="bg-gray-50 border-b p-4 flex flex-col gap-4">
            <div class="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div class="text-xs text-gray-600">
                แสดงหน้า <span class="font-bold">{inventory.state.currentLogPage}</span> จาก{' '}
                <span class="font-bold">{inventory.totalLogPages()}</span> (ทั้งหมด{' '}
                <span class="font-bold">{inventory.filteredLogs().length}</span> รายการ)
              </div>
            </div>

            {/* Arrow Buttons + Page Numbers */}
            <div class="flex flex-wrap items-center justify-center gap-1">
              {/* Previous Button */}
              <button
                onClick={() => inventory.changeLogPage(inventory.state.currentLogPage - 1)}
                disabled={inventory.state.currentLogPage === 1}
                class="px-3 py-2 rounded border bg-white hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                title="ก่อนหน้า"
              >
                ← ก่อนหน้า
              </button>

              {/* Page Numbers */}
              <div class="flex flex-wrap items-center gap-1">
                <For each={inventory.getLogPageNumbers()}>
                  {(page) => (
                    <button
                      onClick={() => typeof page === 'number' && inventory.changeLogPage(page)}
                      disabled={typeof page === 'string'}
                      class={`px-2.5 py-2 rounded border transition text-sm font-medium min-w-[40px] text-center ${
                        page === inventory.state.currentLogPage
                          ? 'bg-blue-600 text-white border-blue-600'
                          : typeof page === 'string'
                            ? 'bg-gray-100 text-gray-400 cursor-default'
                            : 'bg-white hover:bg-blue-50 border-gray-300'
                      }`}
                    >
                      {page}
                    </button>
                  )}
                </For>
              </div>

              {/* Next Button */}
              <button
                onClick={() => inventory.changeLogPage(inventory.state.currentLogPage + 1)}
                disabled={inventory.state.currentLogPage === inventory.totalLogPages()}
                class="px-3 py-2 rounded border bg-white hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                title="ถัดไป"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        </Show>

        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[800px]">
          <thead class="bg-gray-100">
            <tr>
              <th class="p-3 text-left">วันที่</th>
              <th class="p-3 text-left">รายการ</th>
              <th class="p-3 text-left">หมวดหมู่</th>
              <th class="p-3 text-center">ประเภท</th>
              <th class="p-3 text-right">จำนวน</th>
              <th class="p-3 text-right">คงเหลือ</th>
              <th class="p-3 text-left">หมายเหตุ</th>
              <th class="p-3 text-left">ผู้ทำ</th>
            </tr>
          </thead>
          <tbody>
            <For each={inventory.paginatedLogs()}>
              {(log) => {
                const material = inventory.state.materials.find((m) => m.id === log.material_id);
                return (
                  <tr class="border-b hover:bg-gray-50">
                    <td class="p-3">{formatDate(log.action_date)}</td>
                    <td class="p-3 font-medium">{material?.name || 'Unknown/Deleted'}</td>
                    <td class="p-3">{material?.category || '-'}</td>
                    <td class="p-3 text-center">
                      <span
                        class={`px-2 py-1 rounded text-xs font-bold ${
                          log.action_type === 'IN'
                            ? 'bg-green-100 text-green-700'
                            : log.action_type === 'OUT'
                            ? 'bg-red-100 text-red-700'
                            : log.action_type === 'CREATE'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {log.action_type}
                      </span>
                    </td>
                    <td class="p-3 text-right font-bold">
                      {log.action_type === 'OUT' ? '-' : '+'}
                      {log.qty_change.toFixed(2)}
                    </td>
                    <td class="p-3 text-right">{log.current_qty_snapshot.toFixed(2)}</td>
                    <td class="p-3 text-gray-600">{log.note || '-'}</td>
                    <td class="p-3">{log.action_by}</td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
        </div>

        {/* Bottom Pagination */}
        <Show when={inventory.filteredLogs().length > 0}>
          <div class="bg-gray-50 border-t p-4 flex flex-col gap-4">
            <div class="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div class="text-xs text-gray-600">
                แสดงหน้า <span class="font-bold">{inventory.state.currentLogPage}</span> จาก{' '}
                <span class="font-bold">{inventory.totalLogPages()}</span> (ทั้งหมด{' '}
                <span class="font-bold">{inventory.filteredLogs().length}</span> รายการ)
              </div>
            </div>

            {/* Arrow Buttons + Page Numbers */}
            <div class="flex flex-wrap items-center justify-center gap-1">
              {/* Previous Button */}
              <button
                onClick={() => inventory.changeLogPage(inventory.state.currentLogPage - 1)}
                disabled={inventory.state.currentLogPage === 1}
                class="px-3 py-2 rounded border bg-white hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                title="ก่อนหน้า"
              >
                ← ก่อนหน้า
              </button>

              {/* Page Numbers */}
              <div class="flex flex-wrap items-center gap-1">
                <For each={inventory.getLogPageNumbers()}>
                  {(page) => (
                    <button
                      onClick={() => typeof page === 'number' && inventory.changeLogPage(page)}
                      disabled={typeof page === 'string'}
                      class={`px-2.5 py-2 rounded border transition text-sm font-medium min-w-[40px] text-center ${
                        page === inventory.state.currentLogPage
                          ? 'bg-blue-600 text-white border-blue-600'
                          : typeof page === 'string'
                            ? 'bg-gray-100 text-gray-400 cursor-default'
                            : 'bg-white hover:bg-blue-50 border-gray-300'
                      }`}
                    >
                      {page}
                    </button>
                  )}
                </For>
              </div>

              {/* Next Button */}
              <button
                onClick={() => inventory.changeLogPage(inventory.state.currentLogPage + 1)}
                disabled={inventory.state.currentLogPage === inventory.totalLogPages()}
                class="px-3 py-2 rounded border bg-white hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                title="ถัดไป"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default InventoryLogs;
