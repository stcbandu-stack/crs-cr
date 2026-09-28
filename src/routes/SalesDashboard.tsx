import { Component, For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useOrder } from '@/composables/useOrder';
import { isAdmin } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import type { JobOrder, OrderItem } from '@/lib/types';

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const itemName = (item: OrderItem): string =>
  typeof item.service === 'string' ? item.service : item.service?.service_name || '-';

interface ItemStat {
  name: string;
  lines: number;
  qty: number;
  total: number;
}

interface CustomerStat {
  name: string;
  jobs: number;
  total: number;
  topItem?: ItemStat;
}

// รวมยอดรายการสินค้าตามชื่อบริการ เรียงจากมูลค่ามากไปน้อย
const sumItems = (jobs: JobOrder[]): ItemStat[] => {
  const map = new Map<string, ItemStat>();
  for (const job of jobs) {
    for (const item of job.items || []) {
      const name = itemName(item);
      const s = map.get(name) || { name, lines: 0, qty: 0, total: 0 };
      s.lines += 1;
      s.qty += Number(item.qty) || 0;
      s.total += Number(item.total) || 0;
      map.set(name, s);
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
};

const SalesDashboard: Component = () => {
  const navigate = useNavigate();
  const order = useOrder();
  const [year, setYear] = createSignal<number | null>(null);
  const [month, setMonth] = createSignal<number | null>(null);

  onMount(() => {
    if (isAdmin()) order.fetchHistory();
  });

  // ไม่นับงานที่ยกเลิก
  const activeJobs = createMemo(() =>
    order.state.jobHistory.filter((j) => j.status !== 'cancelled' && j.created_at)
  );

  const years = createMemo(() =>
    [...new Set(activeJobs().map((j) => new Date(j.created_at!).getFullYear()))].sort((a, b) => b - a)
  );

  const jobs = createMemo(() =>
    activeJobs().filter((j) => {
      const d = new Date(j.created_at!);
      if (year() !== null && d.getFullYear() !== year()) return false;
      if (month() !== null && d.getMonth() !== month()) return false;
      return true;
    })
  );

  const totalValue = createMemo(() => jobs().reduce((sum, j) => sum + (Number(j.total_price) || 0), 0));

  const items = createMemo(() => sumItems(jobs()));

  // ชื่อลูกค้าบอกสาขาอยู่แล้ว เช่น "... (สาขาพาน)" จึงจัดกลุ่มตามชื่อลูกค้า
  const customers = createMemo<CustomerStat[]>(() => {
    const map = new Map<string, JobOrder[]>();
    for (const job of jobs()) {
      const name = job.customer_name?.trim() || '-';
      map.set(name, [...(map.get(name) || []), job]);
    }
    return [...map.entries()]
      .map(([name, list]) => ({
        name,
        jobs: list.length,
        total: list.reduce((sum, j) => sum + (Number(j.total_price) || 0), 0),
        topItem: sumItems(list)[0],
      }))
      .sort((a, b) => b.total - a.total);
  });

  const pct = (value: number) => (totalValue() > 0 ? (value / totalValue()) * 100 : 0);

  const periodLabel = () => {
    if (year() === null) return 'ทั้งหมด';
    const y = `${year()! + 543}`;
    return month() === null ? `ปี ${y}` : `${MONTHS[month()!]} ${y}`;
  };

  return (
    <div class="container mx-auto p-4">
      <button onClick={() => navigate('/')} class="mb-4 text-gray-500 hover:text-gray-800 flex items-center gap-1">
        ← กลับหน้าหลัก
      </button>

      <Show when={isAdmin()} fallback={<div class="text-center text-gray-400 py-12">หน้านี้สำหรับแอดมินเท่านั้น</div>}>
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h2 class="text-2xl font-bold flex items-center gap-2">📈 แดชบอร์ดยอดสั่งงาน</h2>

          <div class="flex gap-2 bg-white p-2 rounded shadow-sm border">
            <select
              class="py-2 px-3 border rounded-md bg-white cursor-pointer"
              value={year() ?? ''}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setYear(v ? Number(v) : null);
                if (!v) setMonth(null);
              }}
            >
              <option value="">ทุกปี</option>
              <For each={years()}>{(y) => <option value={y}>{y + 543}</option>}</For>
            </select>
            <select
              class="py-2 px-3 border rounded-md bg-white cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed"
              value={month() ?? ''}
              disabled={year() === null}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setMonth(v ? Number(v) : null);
              }}
            >
              <option value="">ทุกเดือน</option>
              <For each={MONTHS}>{(m, i) => <option value={i()}>{m}</option>}</For>
            </select>
          </div>
        </div>

        {/* Summary Cards */}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-lg shadow p-4 text-center">
            <div class="text-3xl font-bold text-blue-600">{jobs().length}</div>
            <div class="text-sm text-gray-500">ใบสั่งงาน ({periodLabel()})</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4 text-center">
            <div class="text-2xl font-bold text-green-600">{formatCurrency(totalValue())}</div>
            <div class="text-sm text-gray-500">มูลค่ารวม (บาท)</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4 text-center">
            <div class="text-lg font-bold text-purple-600 truncate" title={customers()[0]?.name}>
              {customers()[0]?.name || '-'}
            </div>
            <div class="text-sm text-gray-500">ลูกค้า/สาขาที่สั่งมากสุด</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4 text-center">
            <div class="text-lg font-bold text-orange-600 truncate" title={items()[0]?.name}>
              {items()[0]?.name || '-'}
            </div>
            <div class="text-sm text-gray-500">สินค้าที่ขายได้มากสุด</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Customer / Branch */}
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="bg-purple-50 px-4 py-3 border-b border-purple-200">
              <h3 class="font-bold text-purple-800">🏢 ยอดสั่งแยกตามลูกค้า / สาขา</h3>
            </div>
            <div class="divide-y">
              <Show when={customers().length === 0}>
                <div class="p-4 text-center text-gray-500">ไม่มีข้อมูล</div>
              </Show>
              <For each={customers()}>
                {(c, idx) => (
                  <div class="p-3 hover:bg-gray-50">
                    <div class="flex justify-between items-start gap-3">
                      <div class="flex items-start gap-3 min-w-0">
                        <span class="bg-purple-100 text-purple-700 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold">
                          {idx() + 1}
                        </span>
                        <div class="min-w-0">
                          <div class="font-medium">{c.name}</div>
                          <div class="text-xs text-gray-500">
                            {c.jobs} ใบ
                            <Show when={c.topItem}>
                              {' • '}สั่งมากสุด: <span class="text-gray-700">{c.topItem!.name}</span> (
                              {formatCurrency(c.topItem!.total)})
                            </Show>
                          </div>
                        </div>
                      </div>
                      <div class="text-right shrink-0">
                        <div class="font-bold text-purple-600">{formatCurrency(c.total)}</div>
                        <div class="text-xs text-gray-400">{pct(c.total).toFixed(1)}%</div>
                      </div>
                    </div>
                    <div class="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div class="h-full bg-purple-400 rounded-full" style={{ width: `${pct(c.total)}%` }} />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* By Item */}
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="bg-orange-50 px-4 py-3 border-b border-orange-200">
              <h3 class="font-bold text-orange-800">📦 ยอดขายแยกตามสินค้า / บริการ</h3>
            </div>
            <div class="divide-y max-h-[40rem] overflow-y-auto">
              <Show when={items().length === 0}>
                <div class="p-4 text-center text-gray-500">ไม่มีข้อมูล</div>
              </Show>
              <For each={items()}>
                {(it, idx) => (
                  <div class="p-3 hover:bg-gray-50">
                    <div class="flex justify-between items-start gap-3">
                      <div class="flex items-start gap-3 min-w-0">
                        <span class="bg-orange-100 text-orange-700 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold">
                          {idx() + 1}
                        </span>
                        <div class="min-w-0">
                          <div class="font-medium">{it.name}</div>
                          <div class="text-xs text-gray-500">
                            {it.lines} รายการ • {it.qty.toLocaleString('th-TH')} ชิ้น
                          </div>
                        </div>
                      </div>
                      <div class="text-right shrink-0">
                        <div class="font-bold text-orange-600">{formatCurrency(it.total)}</div>
                        <div class="text-xs text-gray-400">{pct(it.total).toFixed(1)}%</div>
                      </div>
                    </div>
                    <div class="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div class="h-full bg-orange-400 rounded-full" style={{ width: `${pct(it.total)}%` }} />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>

        <p class="text-xs text-gray-400 mt-4">* ไม่นับใบสั่งงานที่ยกเลิก</p>
      </Show>
    </div>
  );
};

export default SalesDashboard;
