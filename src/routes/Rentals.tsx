import { Component, For, Show, createSignal, createMemo, createEffect, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useRentals } from '@/composables/useRentals';
import { authState, isAdmin } from '@/store/auth';
import { showToast } from '@/store/ui';
import { formatCurrency } from '@/lib/utils';
import {
  calcRentalCharge,
  calcLineTotal,
  describeLineCalc,
  buildContractHtml,
  contractStyleTag,
} from '@/lib/rental';
import { Button, Input, Modal } from '@/components';

// <input type="date"> ต้องการรูปแบบ YYYY-MM-DD ตามเวลาเครื่อง
const toDateInput = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const thDate = (value: string): string => new Date(value).toLocaleDateString('th-TH', { dateStyle: 'medium' });

const Rentals: Component = () => {
  const navigate = useNavigate();
  const rental = useRentals();

  const today = toDateInput(new Date());

  const [customerName, setCustomerName] = createSignal('');
  const [eventName, setEventName] = createSignal('');
  const [startAt, setStartAt] = createSignal(today);
  const [endAt, setEndAt] = createSignal(today);
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  const [note, setNote] = createSignal('');
  const [acceptedName, setAcceptedName] = createSignal('');
  const [accepted, setAccepted] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [contractOpen, setContractOpen] = createSignal(false);

  onMount(() => {
    rental.fetchAssets();
    rental.fetchRentals();
  });

  // ============ Derived ============

  const charge = createMemo(() => calcRentalCharge(startAt(), endAt()));
  const blocked = createMemo(() => rental.unavailableAssets(startAt(), endAt()));

  // เปลี่ยนช่วงเวลาแล้วของที่เคยเลือกอาจกลายเป็นไม่ว่าง — ถอดออกจากตะกร้าทันที
  // ไม่งั้นยอดรวมจะยังนับของที่จองไม่ได้อยู่
  createEffect(() => {
    const busy = blocked();
    if (busy.size > 0) setSelectedIds((prev) => prev.filter((id) => !busy.has(id)));
  });

  const selectedAssets = createMemo(() =>
    rental.assets().filter((a) => selectedIds().includes(a.id))
  );

  const contractItems = createMemo(() => {
    const c = charge();
    if (!c) return [];
    return selectedAssets().map((a) => ({
      asset_name: a.name,
      daily_rate: a.daily_rate,
      line_total: calcLineTotal(a.daily_rate, c),
    }));
  });

  const totalPrice = createMemo(() => contractItems().reduce((sum, i) => sum + i.line_total, 0));

  const contractHtml = createMemo(() => {
    const c = charge();
    if (!c) return '';
    return (
      contractStyleTag +
      buildContractHtml({
        customerName: customerName() || '(ยังไม่ระบุผู้เช่า)',
        eventName: eventName(),
        startAt: new Date(startAt()).toISOString(),
        endAt: new Date(endAt()).toISOString(),
        charge: c,
        items: contractItems(),
        totalPrice: totalPrice(),
        provider: authState.provider,
      })
    );
  });

  const canSubmit = () =>
    !!customerName() && selectedIds().length > 0 && !!charge() && accepted() && !!acceptedName().trim();

  const toggleAsset = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const resetForm = () => {
    setCustomerName('');
    setEventName('');
    setSelectedIds([]);
    setNote('');
    setAcceptedName('');
    setAccepted(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const rentalId = await rental.createRental({
      customerName: customerName(),
      eventName: eventName(),
      startAt: startAt(),
      endAt: endAt(),
      assetIds: selectedIds(),
      note: note(),
      acceptedByName: acceptedName(),
    });
    setSubmitting(false);

    if (rentalId) {
      resetForm();
      navigate(`/rentals/${rentalId}`);
    }
  };

  return (
    <div class="container mx-auto p-4 max-w-5xl">
      <div class="flex justify-between items-center mb-6 gap-4 flex-wrap">
        <button onClick={() => navigate('/')} class="text-gray-500 hover:text-gray-800">
          ← กลับหน้าหลัก
        </button>
        <div class="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate('/rentals/history')}>
            📜 ประวัติการเช่า
          </Button>
          <Show when={isAdmin()}>
            <Button variant="secondary" size="sm" onClick={() => navigate('/rentals/assets')}>
              ⚙️ จัดการทรัพย์สิน / ราคา
            </Button>
          </Show>
        </div>
      </div>

      <h2 class="text-2xl font-bold mb-6">🎪 เช่าทรัพย์สิน</h2>

      {/* ============ ฟอร์มคีย์ใบเช่า ============ */}
      <div class="bg-white p-6 rounded shadow mb-8 border-l-4 border-blue-500">
        <h3 class="font-bold text-lg mb-4">คีย์ใบเช่าใหม่</h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-bold mb-1">ผู้เช่า</label>
            <select
              class="w-full border border-gray-300 p-2 rounded mb-2 bg-white"
              onChange={(e) => {
                const found = authState.customers.find((c) => String(c.id) === e.currentTarget.value);
                if (found) setCustomerName(found.name);
              }}
            >
              <option value="">— เลือกจากฐานข้อมูลลูกค้า —</option>
              <For each={authState.customers}>
                {(c) => <option value={String(c.id)}>{c.name}</option>}
              </For>
            </select>
            <Input
              placeholder="ชื่อผู้เช่า"
              value={customerName()}
              onInput={(e) => setCustomerName(e.currentTarget.value)}
            />
          </div>

          <Input
            label="งาน / อีเวนต์ที่นำไปใช้"
            placeholder="เช่น งานเปิดตัวสินค้า สาขารังสิต"
            value={eventName()}
            onInput={(e) => setEventName(e.currentTarget.value)}
          />

          <Input
            label="วันที่เช่า"
            type="date"
            value={startAt()}
            onInput={(e) => setStartAt(e.currentTarget.value)}
          />

          <Input
            label="ถึงวันที่"
            type="date"
            value={endAt()}
            onInput={(e) => setEndAt(e.currentTarget.value)}
          />
        </div>

        {/* ระยะเวลา */}
        <div class="mb-4 p-3 rounded bg-gray-50 text-sm">
          <Show
            when={charge()}
            fallback={<span class="text-red-600">ช่วงวันที่ไม่ถูกต้อง — วันคืนต้องไม่ก่อนวันรับ</span>}
          >
            <span class="font-bold text-blue-700">ระยะเวลาเช่า {charge()!.label}</span>
            <span class="text-gray-500"> · คิดค่าเช่าเป็นรายวัน เช่ากี่ชั่วโมงในวันนั้นก็คิดเต็มวัน</span>
          </Show>
        </div>

        {/* เลือกอุปกรณ์ */}
        <label class="block text-sm font-bold mb-2">เลือกอุปกรณ์ที่เช่า</label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          <For each={rental.assets().filter((a) => a.is_active)}>
            {(asset) => {
              const conflict = () => blocked().get(asset.id);
              // ยังไม่ตั้งราคา = ห้ามออกสัญญา กันเผลอทำสัญญา 0 บาทให้บริษัทในเครือ
              const noRate = () => asset.daily_rate <= 0;
              const locked = () => !!conflict() || noRate();
              const isSelected = () => selectedIds().includes(asset.id);
              return (
                <button
                  type="button"
                  disabled={locked()}
                  onClick={() => toggleAsset(asset.id)}
                  class="text-left border-2 rounded p-3 transition-colors disabled:cursor-not-allowed"
                  classList={{
                    'border-blue-500 bg-blue-50': isSelected() && !locked(),
                    'border-gray-200 hover:border-blue-300': !isSelected() && !locked(),
                    'border-gray-200 bg-gray-100 opacity-60': locked(),
                  }}
                >
                  <div class="flex justify-between items-start gap-2">
                    <div>
                      <div class="font-medium">
                        {isSelected() && !locked() ? '☑ ' : '☐ '}
                        {asset.name}
                      </div>
                      <div class="text-xs text-gray-500">
                        {formatCurrency(asset.daily_rate)} บาท/วัน
                        <Show when={charge()}>
                          {' · '}
                          {describeLineCalc(asset.daily_rate, charge()!)} ={' '}
                          <strong>{formatCurrency(calcLineTotal(asset.daily_rate, charge()!))}</strong> บาท
                        </Show>
                      </div>
                    </div>
                    <Show when={conflict()}>
                      <span class="shrink-0 text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                        {conflict()!.notReturned ? 'ยังไม่คืน' : 'ไม่ว่าง'}
                      </span>
                    </Show>
                    <Show when={!conflict() && noRate()}>
                      <span class="shrink-0 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                        ยังไม่ตั้งราคา
                      </span>
                    </Show>
                  </div>
                  <Show when={conflict()}>
                    <div class="text-xs text-red-600 mt-1">
                      ติดใบ {conflict()!.rentalId}
                      {conflict()!.notReturned
                        ? ' — ของยังไม่กลับเข้าระบบ'
                        : ` (${thDate(conflict()!.startAt)} – ${thDate(conflict()!.endAt)})`}
                    </div>
                  </Show>
                  <Show when={!conflict() && noRate()}>
                    <div class="text-xs text-yellow-700 mt-1">ตั้งค่าเช่า/วันที่หน้า “จัดการทรัพย์สิน” ก่อนจึงจะเลือกได้</div>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>

        <Input
          label="หมายเหตุ (ถ้ามี)"
          value={note()}
          onInput={(e) => setNote(e.currentTarget.value)}
          class="mb-4"
        />

        {/* สรุปราคา + สัญญา */}
        <div class="border-t pt-4 mt-4">
          <div class="flex justify-between items-center mb-4">
            <span class="text-lg font-bold">รวมค่าเช่าทั้งสิ้น</span>
            <span class="text-2xl font-bold text-blue-700">{formatCurrency(totalPrice())} บาท</span>
          </div>

          <Button
            variant="secondary"
            class="w-full mb-3"
            disabled={!charge() || selectedIds().length === 0}
            onClick={() => setContractOpen(true)}
          >
            📄 อ่านสัญญาเช่าทรัพย์สิน
          </Button>

          <label class="flex items-start gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted()}
              onChange={(e) => setAccepted(e.currentTarget.checked)}
              class="mt-1"
            />
            <span class="text-sm">
              ผู้เช่าได้อ่านและตกลงยอมรับข้อกำหนดตาม<strong>สัญญาเช่าทรัพย์สิน</strong>ข้างต้นทุกประการ
              และตกลงให้การยอมรับทางอิเล็กทรอนิกส์นี้มีผลผูกพันเช่นเดียวกับการลงลายมือชื่อ
            </span>
          </label>

          <Input
            label="ชื่อผู้กดยอมรับสัญญา"
            placeholder="ชื่อ-นามสกุล ผู้มีอำนาจของผู้เช่า"
            value={acceptedName()}
            onInput={(e) => setAcceptedName(e.currentTarget.value)}
            class="mb-4"
          />

          <Button
            class="w-full"
            size="lg"
            disabled={!canSubmit()}
            isLoading={submitting()}
            onClick={handleSubmit}
          >
            ยืนยันขอเช่า
          </Button>
          <Show when={!canSubmit() && !submitting()}>
            <p class="text-xs text-gray-500 mt-2 text-center">
              ต้องระบุผู้เช่า เลือกอุปกรณ์อย่างน้อย 1 ชิ้น ติ๊กยอมรับสัญญา และกรอกชื่อผู้กดยอมรับ
            </p>
          </Show>
        </div>
      </div>

      {/* ============ Modal สัญญา ============ */}
      <Modal isOpen={contractOpen()} onClose={() => setContractOpen(false)} title="สัญญาเช่าทรัพย์สิน" size="xl">
        <div class="max-h-[70vh] overflow-y-auto pr-1">
          <div innerHTML={contractHtml()} />
        </div>
        <div class="flex justify-end gap-2 mt-4 pt-3 border-t">
          <Button variant="secondary" onClick={() => setContractOpen(false)}>
            ปิด
          </Button>
          <Button
            onClick={() => {
              setAccepted(true);
              setContractOpen(false);
              showToast('ติ๊กยอมรับสัญญาให้แล้ว — กรอกชื่อผู้กดยอมรับก่อนยืนยัน');
            }}
          >
            ผู้เช่ายอมรับสัญญา
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default Rentals;
