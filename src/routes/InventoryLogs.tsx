import { Component, For, onMount } from 'solid-js';
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
      <div class="bg-white rounded shadow overflow-x-auto">
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

      {/* Pagination */}
      <div class="bg-white border-t p-3 flex flex-col sm:flex-row justify-between items-center gap-4 mt-0 rounded-b shadow">
        <div class="text-xs text-gray-500">
          แสดงหน้า {inventory.state.currentLogPage} จาก {inventory.totalLogPages()} (ทั้งหมด{' '}
          {inventory.filteredLogs().length} รายการ)
        </div>

        <div class="flex items-center gap-2">
          <button
            onClick={() => inventory.changeLogPage(inventory.state.currentLogPage - 1)}
            disabled={inventory.state.currentLogPage === 1}
            class="px-3 py-1 rounded border bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← ก่อนหน้า
          </button>

          <div class="flex items-center gap-1">
            <span>หน้า</span>
            <input
              type="number"
              min="1"
              max={inventory.totalLogPages()}
              value={inventory.state.currentLogPage}
              onChange={(e) => inventory.changeLogPage(parseInt(e.currentTarget.value) || 1)}
              class="w-12 text-center border rounded p-1 text-sm focus:ring-2 focus:ring-blue-300 outline-none"
            />
            <span>/ {inventory.totalLogPages()}</span>
          </div>

          <button
            onClick={() => inventory.changeLogPage(inventory.state.currentLogPage + 1)}
            disabled={inventory.state.currentLogPage === inventory.totalLogPages()}
            class="px-3 py-1 rounded border bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ถัดไป →
          </button>
        </div>
      </div>
    </div>
  );
};

export default InventoryLogs;
