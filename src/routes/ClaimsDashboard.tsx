import { Component, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useClaims } from '@/composables/useClaims';
import { formatCurrency } from '@/lib/utils';
import { CLAIM_TYPE_OPTIONS } from '@/lib/types';

const ClaimsDashboard: Component = () => {
  const navigate = useNavigate();
  const claims = useClaims();

  onMount(() => {
    claims.fetchClaims();
  });

  return (
    <div class="container mx-auto p-4">
      <button
        onClick={() => navigate('/claims')}
        class="mb-4 text-gray-500 hover:text-gray-800 flex items-center gap-1"
      >
        ← กลับหน้ารายการเคลม
      </button>

      <h2 class="text-2xl font-bold mb-6 flex items-center gap-2">📊 แดชบอร์ดเคลม</h2>

      <Show when={claims.loading()}>
        <div class="text-center py-12 text-gray-500">⏳ กำลังโหลดข้อมูล...</div>
      </Show>

      <Show when={!claims.loading()}>
        {/* Summary Cards */}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-lg shadow p-4 text-center">
            <div class="text-3xl font-bold text-blue-600">{claims.totals().count}</div>
            <div class="text-sm text-gray-500">เคลมทั้งหมด</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4 text-center">
            <div class="text-2xl font-bold text-red-600">{formatCurrency(claims.totals().totalAmount)}</div>
            <div class="text-sm text-gray-500">ยอดเคลมรวม (บาท)</div>
          </div>
          <div class={`rounded-lg shadow p-4 text-center ${claims.totals().openCount > 0 ? 'bg-orange-50' : 'bg-white'}`}>
            <div class="text-3xl font-bold text-orange-600">{claims.totals().openCount}</div>
            <div class="text-sm text-gray-500">รอดำเนินการ</div>
          </div>
          <div class={`rounded-lg shadow p-4 text-center ${claims.totals().openAmount > 0 ? 'bg-orange-50' : 'bg-white'}`}>
            <div class="text-2xl font-bold text-orange-600">{formatCurrency(claims.totals().openAmount)}</div>
            <div class="text-sm text-gray-500">ยอดรอดำเนินการ (บาท)</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Employee — the number used to consider penalties */}
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="bg-red-50 px-4 py-3 border-b border-red-200">
              <h3 class="font-bold text-red-800">🚨 ยอดเคลมแยกตามพนักงาน (ใช้พิจารณาลงโทษ)</h3>
            </div>
            <div class="divide-y max-h-[28rem] overflow-y-auto">
              <Show when={claims.byEmployee().length === 0}>
                <div class="p-4 text-center text-gray-500">ไม่มีข้อมูล</div>
              </Show>
              <For each={claims.byEmployee()}>
                {(emp, idx) => (
                  <div class="p-3 flex justify-between items-center hover:bg-gray-50">
                    <div class="flex items-center gap-3">
                      <span class="bg-red-100 text-red-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                        {idx() + 1}
                      </span>
                      <div>
                        <div class="font-medium">{emp.name}</div>
                        <div class="text-xs text-gray-500">{emp.count} ครั้ง</div>
                      </div>
                    </div>
                    <div class="text-right font-bold text-red-600">
                      {formatCurrency(emp.totalAmount)} บาท
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* By Type */}
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="bg-blue-50 px-4 py-3 border-b border-blue-200">
              <h3 class="font-bold text-blue-800">📋 สรุปแยกตามประเภท</h3>
            </div>
            <div class="divide-y">
              <Show when={claims.byType().length === 0}>
                <div class="p-4 text-center text-gray-500">ไม่มีข้อมูล</div>
              </Show>
              <For each={claims.byType()}>
                {(t) => (
                  <div class="p-3 flex justify-between items-center hover:bg-gray-50">
                    <div>
                      <div class="font-medium">{CLAIM_TYPE_OPTIONS[t.type]}</div>
                      <div class="text-xs text-gray-500">{t.count} ครั้ง</div>
                    </div>
                    <div class="text-right font-bold text-blue-600">
                      {formatCurrency(t.totalAmount)} บาท
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default ClaimsDashboard;
