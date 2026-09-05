import { Component, For, Show, createSignal, createMemo, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useRentals } from '@/composables/useRentals';
import { authState } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import {
  calcRentalCharge,
  buildContractHtml,
  printContractHtml,
  overdueHours,
  formatOverdue,
} from '@/lib/rental';
import { RENTAL_STATUS_OPTIONS } from '@/lib/types';
import type { Rental, RentalStatus } from '@/lib/types';

const thDate = (value: string): string => new Date(value).toLocaleDateString('th-TH', { dateStyle: 'medium' });

const RentalsHistory: Component = () => {
  const navigate = useNavigate();
  const rental = useRentals();

  const [searchQuery, setSearchQuery] = createSignal('');
  const [statusFilter, setStatusFilter] = createSignal<RentalStatus | ''>('');

  onMount(() => {
    rental.fetchAssets();
    rental.fetchRentals();
  });

  const filteredRentals = createMemo(() => {
    const q = searchQuery().toLowerCase().trim();
    const status = statusFilter();
    return rental.rentals().filter((r) => {
      if (status && r.status !== status) return false;
      if (!q) return true;
      return (
        r.rental_id.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q) ||
        (r.event_name || '').toLowerCase().includes(q)
      );
    });
  });

  // ============ List helpers ============

  const returnedCount = (r: Rental) => (r.items || []).filter((i) => i.returned_at).length;

  const statusBadge = (r: Rental) => {
    if (r.status !== 'active') return RENTAL_STATUS_OPTIONS[r.status];
    const done = returnedCount(r);
    const total = (r.items || []).length;
    if (done > 0) return { label: `คืนแล้ว ${done}/${total}`, class: 'bg-amber-100 text-amber-700' };
    return RENTAL_STATUS_OPTIONS.active;
  };

  const overdue = (r: Rental) => {
    if (r.status !== 'active') return 0;
    if ((r.items || []).every((i) => i.returned_at)) return 0;
    return overdueHours(r.end_at);
  };

  const totalDamage = (r: Rental) => (r.items || []).reduce((sum, i) => sum + (i.damage_amount || 0), 0);

  // ใบเก่าใช้สำเนาสัญญาที่ยอมรับจริง (contract_html) — render สดเฉพาะใบที่ไม่มีสำเนา (ข้อมูลเก่า)
  const printRental = (r: Rental) => {
    const charge = calcRentalCharge(r.start_at, r.end_at) || {
      unit: r.billed_unit,
      qty: r.billed_qty,
      label: `${r.billed_qty} ${r.billed_unit === 'day' ? 'วัน' : 'ชั่วโมง'}`,
    };
    const html =
      r.contract_html ||
      buildContractHtml({
        rentalId: r.rental_id,
        customerName: r.customer_name,
        eventName: r.event_name,
        startAt: r.start_at,
        endAt: r.end_at,
        charge,
        items: (r.items || []).map((i) => ({
          asset_name: i.asset_name,
          daily_rate: i.daily_rate,
          line_total: i.line_total,
        })),
        totalPrice: r.total_price,
        acceptedByName: r.accepted_by_name,
        acceptedAt: r.accepted_at,
        provider: authState.provider,
      });
    printContractHtml(html, r.rental_id);
  };

  return (
    <div class="container mx-auto p-4 max-w-5xl">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div class="w-full md:w-auto">
          <button onClick={() => navigate('/')} class="mb-2 text-gray-500 hover:text-gray-800 flex items-center gap-1">
            ← กลับหน้าหลัก
          </button>
          <h2 class="text-2xl font-bold">📜 ประวัติการเช่า</h2>
        </div>

        {/* Filters */}
        <div class="flex flex-col md:flex-row gap-2 w-full md:w-auto bg-white p-2 rounded shadow-sm border">
          <div class="relative w-full md:w-64">
            <span class="absolute left-3 top-2.5 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="ค้นหาเลขที่ใบเช่า / ชื่อผู้เช่า / งาน..."
              class="pl-9 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300 w-full"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
          </div>

          <select
            class="py-2 px-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer bg-white w-full md:w-auto"
            value={statusFilter()}
            onChange={(e) => setStatusFilter(e.currentTarget.value as RentalStatus | '')}
          >
            <option value="">แสดง: ทุกสถานะ</option>
            <For each={Object.entries(RENTAL_STATUS_OPTIONS)}>
              {([key, info]) => <option value={key}>{info.label}</option>}
            </For>
          </select>
        </div>
      </div>

      <Show
        when={filteredRentals().length > 0}
        fallback={
          <div class="bg-white p-6 rounded shadow text-center text-gray-400">
            {rental.rentals().length === 0 ? 'ยังไม่มีใบเช่า' : 'ไม่พบใบเช่าที่ตรงกับเงื่อนไข'}
          </div>
        }
      >
        <div class="space-y-3">
          <For each={filteredRentals()}>
            {(r) => (
              <div
                class="bg-white p-4 rounded shadow hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/rentals/${r.rental_id}`)}
              >
                <div class="flex justify-between items-start gap-3 flex-wrap">
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-bold">{r.rental_id}</span>
                      <span class={`text-xs px-2 py-0.5 rounded ${statusBadge(r).class}`}>
                        {statusBadge(r).label}
                      </span>
                      <Show when={overdue(r) > 0}>
                        <span class="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                          {formatOverdue(overdue(r))}
                        </span>
                      </Show>
                      <Show when={totalDamage(r) > 0}>
                        <span class="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                          ⚠️ ค่าเสียหาย {formatCurrency(totalDamage(r))} บาท
                        </span>
                      </Show>
                    </div>
                    <div class="text-sm text-gray-700 mt-1">{r.customer_name}</div>
                    <Show when={r.event_name}>
                      <div class="text-xs text-gray-500">งาน: {r.event_name}</div>
                    </Show>
                    <div class="text-xs text-gray-500 mt-1">
                      {thDate(r.start_at)} → {thDate(r.end_at)} ({r.billed_qty}{' '}
                      {r.billed_unit === 'day' ? 'วัน' : 'ชั่วโมง'})
                    </div>
                    <div class="text-xs text-gray-500 mt-1">
                      {(r.items || []).map((i) => i.asset_name).join(', ')}
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-lg font-bold text-blue-700">{formatCurrency(r.total_price)} บาท</div>
                    <div class="text-xs text-gray-400 mb-2">ดูรายละเอียด / คีย์คืน →</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        printRental(r);
                      }}
                      class="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-3 py-1 rounded text-xs transition inline-flex items-center gap-1"
                    >
                      🖨️ PDF
                    </button>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default RentalsHistory;
