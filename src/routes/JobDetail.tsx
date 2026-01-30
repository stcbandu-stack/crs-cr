import { Component, createSignal, onMount, Show, For } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { JobOrder, ProviderInfo } from '@/lib/types';
import { Button } from '@/components';

const JobDetail: Component = () => {
  const params = useParams();
  const navigate = useNavigate();
  const [job, setJob] = createSignal<JobOrder | null>(null);
  const [provider, setProvider] = createSignal<ProviderInfo | null>(null);
  const [loading, setLoading] = createSignal(true);

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
    </div>
  );
};

export default JobDetail;
