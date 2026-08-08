import { Component, createSignal, onMount, Show, For } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { JobOrder, ProviderInfo, ClaimType } from '@/lib/types';
import { CLAIM_TYPE_OPTIONS } from '@/lib/types';
import { Button, Modal, Select, Input } from '@/components';
import { isAdmin } from '@/store/auth';
import { useOrder } from '@/composables/useOrder';
import { useClaims } from '@/composables/useClaims';

const IMAGES_PER_PAGE = 6;

const chunkImages = (images?: string[]): string[][] => {
  const chunks: string[][] = [];
  for (let i = 0; i < (images?.length || 0); i += IMAGES_PER_PAGE) {
    chunks.push(images!.slice(i, i + IMAGES_PER_PAGE));
  }
  return chunks;
};

const JobDetail: Component = () => {
  const params = useParams();
  const navigate = useNavigate();
  const order = useOrder();
  const claims = useClaims();
  const [job, setJob] = createSignal<JobOrder | null>(null);
  const [provider, setProvider] = createSignal<ProviderInfo | null>(null);
  const [loading, setLoading] = createSignal(true);

  // Claim Modal
  const [claimModalOpen, setClaimModalOpen] = createSignal(false);
  const [claimType, setClaimType] = createSignal<ClaimType>('remake');
  const [claimNote, setClaimNote] = createSignal('');
  const [claimDescription, setClaimDescription] = createSignal('');
  const [submittingClaim, setSubmittingClaim] = createSignal(false);

  const openClaimModal = () => {
    setClaimType('remake');
    setClaimNote('');
    setClaimDescription('');
    setClaimModalOpen(true);
  };

  const submitClaimForm = async () => {
    const j = job();
    if (!j) return;
    if (!claimDescription().trim()) {
      alert('กรุณากรอกรายละเอียดการเคลม');
      return;
    }

    setSubmittingClaim(true);
    const ok = await claims.submitClaim({
      jobId: j.job_id,
      customerName: j.customer_name,
      claimType: claimType(),
      claimNote: claimNote(),
      description: claimDescription(),
      // ยอดเคลม = ยอดค่าสินค้าที่ลูกค้าจ่ายในงานนี้ (ไม่ให้กรอกเอง) — ใช้ดูว่าจะสูญเงินไปเท่าไหร่ถ้าเคลมจริง
      claimAmount: j.total_price || 0,
    });
    setSubmittingClaim(false);
    if (ok) {
      setClaimModalOpen(false);
    }
  };

  onMount(async () => {
    try {
      // Fetch Job
      const { data: jobData, error: jobError } = await supabase
        .from('job_orders')
        .select('*')
        .eq('job_id', params.id)
        .single();

      if (jobError) throw jobError;
      setJob(jobData);

      // Fetch Provider
      const { data: provData, error: provError } = await supabase
        .from('provider_info')
        .select('*')
        .single();
      
      if (!provError && provData) {
        setProvider(provData);
      }
    } catch (err) {
      console.error(err);
      alert('ไม่พบข้อมูลใบสั่งงาน');
      navigate('/history');
    } finally {
      setLoading(false);
    }
  });

  const handlePrint = () => {
    window.print();
  };

  const handleEdit = () => {
    const currentJob = job();
    if (currentJob) {
      order.editJob(currentJob);
      navigate('/order');
    }
  };

  return (
    <div class="min-h-screen bg-gray-100 p-4 print:bg-white print:p-0">
      <Show when={!loading()} fallback={<div class="text-center p-10">กำลังโหลด...</div>}>
        <Show when={job()} keyed>
          {(j) => (
            <div class="max-w-4xl mx-auto bg-white p-8 rounded shadow print:shadow-none print:w-full print:max-w-none">
              
              {/* Toolbar (Hidden while printing) */}
              <div class="flex justify-between items-center mb-8 print:hidden">
                 <button
                    onClick={() => navigate('/history')}
                    class="text-gray-600 hover:text-blue-600 font-medium flex items-center gap-1"
                 >
                   ← กลับหน้าประวัติ
                 </button>
                 <div class="flex gap-2">
                   <Show when={j.drive_url}>
                     <a
                       href={j.drive_url}
                       target="_blank"
                       rel="noopener"
                       class="inline-flex items-center gap-1 px-4 py-2 rounded-md font-medium bg-teal-50 text-teal-700 border border-teal-300 hover:bg-teal-100 transition"
                     >
                       🔗 ไดรฟ์ผลิตงาน
                     </a>
                   </Show>
                   <Show when={isAdmin()}>
                     <Button onClick={handleEdit} variant="secondary" class="bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100">
                       ✏️ แก้ไขใบสั่งงาน
                     </Button>
                   </Show>
                   <Button onClick={openClaimModal} variant="secondary" class="bg-red-50 text-red-700 border-red-300 hover:bg-red-100">
                     ⚠️ แจ้งเคลม
                   </Button>
                   <Button onClick={handlePrint} variant="primary">🖨️ พิมพ์เอกสาร</Button>
                 </div>
              </div>

              {/* Document Header */}
              <div class="flex justify-between items-start mb-6 pb-6 border-b-2 border-gray-800">
                <div class="flex items-start gap-4">
                  <img src={provider()?.logo_url || '/crs-logo.svg'} class="h-16 object-contain" alt="Logo" onError={(e) => e.currentTarget.style.display = 'none'} />
                </div>
                <div class="text-right">
                  <h1 class="text-xl font-bold mb-1">{provider()?.org_name || 'Printing Shop'}</h1>
                  <p class="text-sm text-gray-600">{provider()?.address || '-'}</p>
                  <p class="text-sm text-gray-600">โทร: {provider()?.phone || '-'} | เลขภาษี: {provider()?.tax_id || '-'}</p>
                </div>
              </div>

              {/* Title */}
              <div class="text-center mb-8">
                <h2 class="text-2xl font-bold text-gray-800 bg-gray-100 inline-block px-8 py-2 rounded">
                  ใบสั่งงาน / ใบส่งของ
                </h2>
              </div>

              {/* Info Grid */}
              <div class="flex flex-wrap justify-between mb-8 gap-4 px-4">
                <div class="w-full md:w-[48%] space-y-1">
                  <div class="flex"><span class="w-32 font-bold text-gray-700">ลูกค้า (Customer):</span> <span>{j.customer_name}</span></div>
                  <div class="flex"><span class="w-32 font-bold text-gray-700">ที่อยู่/สาขา:</span> <span class="flex-1">{j.branch || '-'}</span></div>
                  <div class="flex"><span class="w-32 font-bold text-gray-700">ชื่องาน:</span> <span>{j.event_name || '-'}</span></div>
                </div>
                <div class="w-full md:w-[48%] space-y-1 text-left md:text-right">
                   <div class="flex md:justify-end"><span class="font-bold text-gray-700 mr-2">เลขที่ (No.):</span> <span>{j.job_id}</span></div>
                   <div class="flex md:justify-end"><span class="font-bold text-gray-700 mr-2">วันที่ (Date):</span> <span>{formatDate(j.created_at || '')}</span></div>
                   <div class="flex md:justify-end"><span class="font-bold text-gray-700 mr-2">ผู้ทำรายการ:</span> <span>{j.created_by}</span></div>
                   <div class="flex md:justify-end"><span class="font-bold text-gray-700 mr-2">สถานะ:</span> <span class="uppercase">{j.status}</span></div>
                </div>
              </div>

              {/* Items Table */}
              <div class="mb-8">
                <table class="w-full border-collapse">
                  <thead>
                    <tr class="bg-gray-100 border-t-2 border-b-2 border-gray-800">
                      <th class="py-3 px-2 text-left font-bold text-gray-700">ลำดับ</th>
                      <th class="py-3 px-2 text-left font-bold text-gray-700">รายการ (Description)</th>
                      <th class="py-3 px-2 text-center font-bold text-gray-700">ขนาด</th>
                      <th class="py-3 px-2 text-center font-bold text-gray-700">จำนวน</th>
                      <th class="py-3 px-2 text-right font-bold text-gray-700">ราคา/หน่วย</th>
                      <th class="py-3 px-2 text-right font-bold text-gray-700">รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={j.items}>
                      {(item, i) => (
                        <tr class="border-b border-gray-200 print:break-inside-avoid">
                          <td class="py-3 px-2 text-center text-gray-500 w-12">{i() + 1}</td>
                          <td class="py-3 px-2">
                             <div class="font-semibold">{typeof item.service === 'string' ? item.service : item.service.service_name}</div>
                             <Show when={item.note}><div class="text-xs text-gray-500 italic">*{item.note}</div></Show>
                          </td>
                          <td class="py-3 px-2 text-center whitespace-nowrap">{item.w} x {item.h} {item.unit}</td>
                          <td class="py-3 px-2 text-center">{item.qty}</td>
                          <td class="py-3 px-2 text-right">{formatCurrency(item.price)}</td>
                          <td class="py-3 px-2 text-right font-bold">{formatCurrency(item.total)}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                  <tfoot>
                    <tr class="border-t-2 border-gray-800 bg-gray-50">
                      <td colspan="5" class="py-4 px-2 text-right font-bold text-lg">รวมสุทธิ (Grand Total)</td>
                      <td class="py-4 px-2 text-right font-bold text-lg text-blue-800">{formatCurrency(j.total_price)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Attached Images: pages of 6 fixed blocks (2 cols x 3 rows) */}
              <For each={chunkImages(j.images)}>
                {(group, gi) => (
                  <div class="mb-8 print:break-before-page">
                    <h3 class="font-bold text-gray-700 border-b-2 border-gray-300 pb-2 mb-4">
                      🖼️ รูปประกอบงาน
                      {chunkImages(j.images).length > 1
                        ? ` (ชุดที่ ${gi() + 1}/${chunkImages(j.images).length})`
                        : ''}{' '}
                      — {j.job_id}
                    </h3>
                    <div class="grid grid-cols-2 gap-3">
                      <For each={group}>
                        {(url) => (
                          <div class="border rounded p-1 bg-gray-50 flex items-center justify-center h-64 print:h-[78mm] print:break-inside-avoid">
                            <img src={url} class="max-w-full max-h-full object-contain" alt="รูปประกอบงาน" />
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>

              {/* Signatures */}
              <div class="mt-16 flex justify-around print:mt-24 print:break-inside-avoid">
                 <div class="text-center">
                    <div class="border-b border-gray-800 w-48 mb-2"></div>
                    <p class="font-bold text-sm">ผู้รับสินค้า (Receiver)</p>
                    <p class="text-xs text-gray-500 mt-1">วันที่: _____/_____/_____</p>
                 </div>
                 <div class="text-center">
                    <div class="border-b border-gray-800 w-48 mb-2"></div>
                    <p class="font-bold text-sm">ผู้ส่งสินค้า (Sender)</p>
                    <p class="text-xs text-gray-500 mt-1">วันที่: _____/_____/_____</p>
                 </div>
              </div>

            </div>
          )}
        </Show>
      </Show>

      {/* Claim Modal */}
      <Modal
        isOpen={claimModalOpen()}
        onClose={() => setClaimModalOpen(false)}
        title={`⚠️ แจ้งเคลม ${job()?.job_id || ''}`}
        size="md"
      >
        <div class="space-y-4">
          <Select
            label="ประเภทการเคลม"
            value={claimType()}
            onChange={(e) => setClaimType(e.currentTarget.value as ClaimType)}
            options={Object.entries(CLAIM_TYPE_OPTIONS).map(([value, label]) => ({ value, label }))}
          />

          <Show when={claimType() === 'other'}>
            <Input
              label="ระบุประเภท"
              value={claimNote()}
              onInput={(e) => setClaimNote(e.currentTarget.value)}
              placeholder="ระบุว่าเคลมเรื่องอะไร"
            />
          </Show>

          <div class="w-full">
            <label class="block text-sm font-bold mb-1">รายละเอียด</label>
            <textarea
              class="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-300 border-gray-300"
              rows="3"
              value={claimDescription()}
              onInput={(e) => setClaimDescription(e.currentTarget.value)}
              placeholder="ลูกค้าเคลมเรื่องอะไร เกิดอะไรขึ้น"
            />
          </div>

          <div class="bg-gray-50 border rounded p-3 text-sm flex justify-between items-center">
            <span class="text-gray-500">ยอดเคลม (ยอดค่างานนี้ที่ลูกค้าจ่าย)</span>
            <span class="font-bold text-red-600">{formatCurrency(job()?.total_price)} บาท</span>
          </div>

          <div class="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setClaimModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="danger" onClick={submitClaimForm} isLoading={submittingClaim()}>
              บันทึกการแจ้งเคลม
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default JobDetail;
