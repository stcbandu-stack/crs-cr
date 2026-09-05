import { Component, For, Show, createSignal, createMemo, onMount } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { useRentals, type ImageKind } from '@/composables/useRentals';
import { authState } from '@/store/auth';
import { showToast, openConfirm } from '@/store/ui';
import { formatCurrency } from '@/lib/utils';
import {
  printContractHtml,
  buildContractHtml,
  contractStyleTag,
  overdueHours,
  formatOverdue,
} from '@/lib/rental';
import { prepareImageForUpload, IMAGE_ACCEPT_ATTR, MAX_FILES_PER_BATCH } from '@/lib/image';
import { Button, Modal } from '@/components';
import { RENTAL_STATUS_OPTIONS } from '@/lib/types';
import type { RentalItem } from '@/lib/types';

const thDateTime = (value?: string | null): string =>
  value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

// แปลงเป็น WebP + ย่อขนาด แล้วรวมข้อความของไฟล์ที่ไม่ผ่าน
const prepareAll = async (files: File[]): Promise<{ ready: File[]; errors: string[] }> => {
  const ready: File[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const { file: prepared, error } = await prepareImageForUpload(file);
    if (error || !prepared) {
      errors.push(error || `"${file.name}" เตรียมไฟล์ไม่สำเร็จ`);
      continue;
    }
    ready.push(prepared);
  }
  return { ready, errors };
};

const RentalDetail: Component = () => {
  const navigate = useNavigate();
  const params = useParams();
  const rental = useRentals();

  const [busyKey, setBusyKey] = createSignal(''); // `${itemId}:${kind}` ที่กำลังอัปโหลดอยู่
  const [returningId, setReturningId] = createSignal('');
  const [notes, setNotes] = createSignal<Record<string, string>>({});
  const [contractOpen, setContractOpen] = createSignal(false);

  onMount(() => {
    rental.fetchAssets();
    rental.fetchRentals();
  });

  const current = createMemo(() => rental.findRental(params.id));
  const items = createMemo(() => current()?.items || []);
  const returnedCount = createMemo(() => items().filter((i) => i.returned_at).length);

  const overdue = createMemo(() => {
    const r = current();
    if (!r || r.status !== 'active') return 0;
    if (items().every((i) => i.returned_at)) return 0;
    return overdueHours(r.end_at);
  });

  const contractContext = () => {
    const r = current()!;
    return {
      rentalId: r.rental_id,
      customerName: r.customer_name,
      eventName: r.event_name,
      startAt: r.start_at,
      endAt: r.end_at,
      // ใช้ค่าที่บันทึกไว้ ไม่คำนวณใหม่ — สูตรราคาเปลี่ยนในอนาคตต้องไม่ทำให้สัญญาเก่าเปลี่ยนตัวเลข
      charge: {
        unit: r.billed_unit,
        qty: r.billed_qty,
        label: `${r.billed_qty} ${r.billed_unit === 'day' ? 'วัน' : 'ชั่วโมง'}`,
      },
      items: items().map((i) => ({
        asset_name: i.asset_name,
        daily_rate: i.daily_rate,
        line_total: i.line_total,
      })),
      totalPrice: r.total_price,
      acceptedByName: r.accepted_by_name,
      acceptedAt: r.accepted_at,
      provider: authState.provider,
    };
  };

  // สัญญาที่แสดง/พิมพ์ = สำเนาที่ snapshot ไว้ตอนยอมรับ; render สดเฉพาะใบที่ไม่มีสำเนา (กันข้อมูลเก่า)
  const contractBody = () => current()?.contract_html || buildContractHtml(contractContext());

  // ============ Photos ============

  const handleFiles = async (item: RentalItem, kind: ImageKind, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const key = `${item.id}:${kind}`;
    if (busyKey()) return; // กันยิงซ้ำระหว่างรอบก่อนยังไม่จบ

    let batch = Array.from(fileList);
    if (batch.length > MAX_FILES_PER_BATCH) {
      showToast(`เลือกมา ${batch.length} ไฟล์ — ทำให้ ${MAX_FILES_PER_BATCH} ไฟล์แรกก่อน`, 'error');
      batch = batch.slice(0, MAX_FILES_PER_BATCH);
    }

    setBusyKey(key);
    const { ready, errors } = await prepareAll(batch);
    if (errors.length > 0) showToast(errors.join(' • '), 'error');
    if (ready.length > 0) await rental.uploadItemImages(item, kind, ready);
    setBusyKey('');
  };

  const handleRemove = (item: RentalItem, kind: ImageKind, url: string) => {
    openConfirm('ลบรูปนี้?', async () => {
      await rental.removeItemImage(item, kind, url);
    });
  };

  // ============ Return ============

  const handleReturn = (item: RentalItem) => {
    const hasPhotos = (item.return_images || []).length > 0;
    const warning = hasPhotos ? ' หลังรับคืนแล้วจะแก้ไขรูปไม่ได้' : '';
    openConfirm(`ยืนยันรับคืน "${item.asset_name}"?${warning}`, async () => {
      setReturningId(item.id);
      await rental.returnItem(item, notes()[item.id] || '');
      setReturningId('');
    });
  };

  const handleCancel = () => {
    const r = current();
    if (!r) return;
    openConfirm(`ยกเลิกใบเช่า ${r.rental_id}?`, async () => {
      if (await rental.cancelRental(r.rental_id)) navigate('/rentals');
    });
  };

  // ============ Photo UI ============

  const photoSection = (item: RentalItem, kind: ImageKind) => {
    const images = () => (kind === 'return' ? item.return_images : item.handover_images) || [];
    const locked = () => !!item.returned_at;
    const busy = () => busyKey() === `${item.id}:${kind}`;
    let inputRef: HTMLInputElement | undefined;

    return (
      <div class="mt-3">
        <div class="text-sm font-medium mb-1">
          {kind === 'return' ? 'รูปสภาพตอนรับคืน' : 'รูปสภาพตอนส่งมอบ'}
          <span class="text-xs font-normal text-gray-500">
            {kind === 'return' ? ' — ไม่บังคับ แนะนำให้ถ่ายไว้เป็นหลักฐานเมื่อมีเวลา' : ' — ไม่บังคับ'}
          </span>
        </div>

        <div class="flex flex-wrap gap-2">
          <For each={images()}>
            {(url) => (
              <div class="relative">
                <a href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt="สภาพอุปกรณ์" class="h-20 w-20 object-cover rounded border" />
                </a>
                <Show when={!locked()}>
                  <button
                    onClick={() => handleRemove(item, kind, url)}
                    class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs leading-none"
                    title="ลบรูป"
                  >
                    ×
                  </button>
                </Show>
              </div>
            )}
          </For>

          <Show when={!locked()}>
            <button
              onClick={() => inputRef?.click()}
              disabled={busy()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(item, kind, e.dataTransfer?.files || null);
              }}
              class="h-20 w-20 border-2 border-dashed rounded text-xs text-gray-500 hover:border-blue-400 hover:text-blue-500 disabled:opacity-50"
            >
              {busy() ? 'กำลังอัป...' : '+ เพิ่มรูป'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={IMAGE_ACCEPT_ATTR}
              multiple
              class="hidden"
              onChange={(e) => {
                handleFiles(item, kind, e.currentTarget.files);
                e.currentTarget.value = '';
              }}
            />
          </Show>

          <Show when={locked() && images().length === 0}>
            <span class="text-xs text-gray-400">— ไม่มีรูป</span>
          </Show>
        </div>
      </div>
    );
  };

  return (
    <div class="container mx-auto p-4 max-w-4xl">
      <button onClick={() => navigate('/rentals')} class="mb-4 text-gray-500 hover:text-gray-800">
        ← กลับรายการเช่า
      </button>

      <Show when={current()} fallback={<div class="bg-white p-6 rounded shadow text-center text-gray-400">ไม่พบใบเช่านี้</div>}>
        {(r) => (
          <>
            {/* หัวใบเช่า */}
            <div class="bg-white p-6 rounded shadow mb-6">
              <div class="flex justify-between items-start gap-4 flex-wrap mb-4">
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <h2 class="text-2xl font-bold">{r().rental_id}</h2>
                    <span class={`text-xs px-2 py-0.5 rounded ${RENTAL_STATUS_OPTIONS[r().status].class}`}>
                      {RENTAL_STATUS_OPTIONS[r().status].label}
                    </span>
                    <Show when={overdue() > 0}>
                      <span class="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                        {formatOverdue(overdue())}
                      </span>
                    </Show>
                  </div>
                  <div class="text-gray-700 mt-1">{r().customer_name}</div>
                  <Show when={r().event_name}>
                    <div class="text-sm text-gray-500">งาน: {r().event_name}</div>
                  </Show>
                </div>
                <div class="text-right">
                  <div class="text-2xl font-bold text-blue-700">{formatCurrency(r().total_price)} บาท</div>
                  <div class="text-xs text-gray-500">
                    {r().billed_qty} {r().billed_unit === 'day' ? 'วัน' : 'ชั่วโมง'}
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm border-t pt-4">
                <div>
                  <span class="text-gray-500">รับของ:</span> {thDateTime(r().start_at)}
                </div>
                <div>
                  <span class="text-gray-500">กำหนดคืน:</span> {thDateTime(r().end_at)}
                </div>
                <div>
                  <span class="text-gray-500">ผู้ยอมรับสัญญา:</span> {r().accepted_by_name} (
                  {thDateTime(r().accepted_at)})
                </div>
                <div>
                  <span class="text-gray-500">ผู้คีย์:</span> {r().created_by || '-'}
                </div>
                <Show when={r().note}>
                  <div class="sm:col-span-2">
                    <span class="text-gray-500">หมายเหตุ:</span> {r().note}
                  </div>
                </Show>
              </div>

              <div class="flex gap-2 mt-4 pt-4 border-t flex-wrap">
                <Button variant="secondary" size="sm" onClick={() => setContractOpen(true)}>
                  📄 ดูสัญญา
                </Button>
                <Button variant="secondary" size="sm" onClick={() => printContractHtml(contractBody(), r().rental_id)}>
                  🖨️ พิมพ์สัญญา
                </Button>
                <Show when={r().status === 'active' && returnedCount() === 0}>
                  <Button variant="danger" size="sm" onClick={handleCancel}>
                    ยกเลิกใบเช่า
                  </Button>
                </Show>
              </div>
            </div>

            {/* รายการอุปกรณ์ + คีย์คืน */}
            <div class="flex justify-between items-center mb-3">
              <h3 class="font-bold text-lg">อุปกรณ์ที่เช่า</h3>
              <span class="text-sm text-gray-500">
                คืนแล้ว {returnedCount()}/{items().length}
              </span>
            </div>

            <div class="space-y-4">
              <For each={items()}>
                {(item) => (
                  <div
                    class="bg-white p-4 rounded shadow border-l-4"
                    classList={{
                      'border-green-500': !!item.returned_at,
                      'border-amber-400': !item.returned_at,
                    }}
                  >
                    <div class="flex justify-between items-start gap-3 flex-wrap">
                      <div>
                        <div class="font-bold">{item.asset_name}</div>
                        <div class="text-xs text-gray-500">
                          {formatCurrency(item.daily_rate)} บาท/วัน · รวม {formatCurrency(item.line_total)} บาท
                        </div>
                      </div>
                      <Show
                        when={item.returned_at}
                        fallback={
                          <span class="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700">⏳ ยังไม่คืน</span>
                        }
                      >
                        <span class="text-xs px-2 py-1 rounded bg-green-100 text-green-700">
                          ✅ รับคืน {thDateTime(item.returned_at)}
                          {item.returned_by ? ` โดย ${item.returned_by}` : ''}
                        </span>
                      </Show>
                    </div>

                    <Show when={item.return_note}>
                      <div class="text-sm text-gray-600 mt-2">หมายเหตุการคืน: {item.return_note}</div>
                    </Show>

                    {/* รูปตอนส่งมอบ — ซ่อนหลังรับคืนถ้าไม่มีรูป จะได้ไม่รก */}
                    <Show when={!item.returned_at || (item.handover_images || []).length > 0}>
                      {photoSection(item, 'handover')}
                    </Show>

                    {photoSection(item, 'return')}

                    <Show when={!item.returned_at}>
                      <div class="mt-3 flex flex-col sm:flex-row gap-2 sm:items-end">
                        <div class="flex-1">
                          <label class="block text-sm font-bold mb-1">หมายเหตุการคืน (ถ้ามี)</label>
                          <input
                            type="text"
                            placeholder="เช่น มีรอยขีดข่วนที่ฝาเลนส์"
                            value={notes()[item.id] || ''}
                            onInput={(e) =>
                              setNotes((prev) => ({ ...prev, [item.id]: e.currentTarget.value }))
                            }
                            class="w-full border border-gray-300 p-2 rounded"
                          />
                        </div>
                        <Button
                          variant="success"
                          isLoading={returningId() === item.id}
                          onClick={() => handleReturn(item)}
                        >
                          ยืนยันรับคืนชิ้นนี้
                        </Button>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>

            <Modal
              isOpen={contractOpen()}
              onClose={() => setContractOpen(false)}
              title="สัญญาเช่าทรัพย์สิน"
              size="xl"
            >
              <div class="max-h-[70vh] overflow-y-auto pr-1">
                <div innerHTML={contractStyleTag + contractBody()} />
              </div>
              <div class="flex justify-end mt-4 pt-3 border-t">
                <Button variant="secondary" onClick={() => setContractOpen(false)}>
                  ปิด
                </Button>
              </div>
            </Modal>
          </>
        )}
      </Show>
    </div>
  );
};

export default RentalDetail;
