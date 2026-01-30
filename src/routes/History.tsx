import { Component, For, Show, createSignal, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useOrder } from '@/composables/useOrder';
import { can, isAdmin } from '@/store/auth';
import { formatDate, formatCurrency } from '@/lib/utils';
import { generateJobPdf } from '@/lib/pdf';
import { Button, Input, Modal } from '@/components';
import type { JobOrder, JobStatus } from '@/lib/types';

const History: Component = () => {
  const navigate = useNavigate();
  const order = useOrder();

  // Status Modal
  const [statusModalOpen, setStatusModalOpen] = createSignal(false);
  const [selectedJob, setSelectedJob] = createSignal<JobOrder | null>(null);
  const [selectedStatus, setSelectedStatus] = createSignal<JobStatus>('waiting_approval');

  onMount(() => {
    order.fetchHistory();
  });

  const openStatusModal = (job: JobOrder) => {
    setSelectedJob(job);
    setSelectedStatus(job.status);
    setStatusModalOpen(true);
  };

  const saveStatus = async () => {
    const job = selectedJob();
    if (job) {
      await order.updateJobStatus(job.job_id, selectedStatus());
      setStatusModalOpen(false);
    }
  };

  return (
    <div class="container mx-auto p-4">
      {/* Header */}
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div class="w-full md:w-auto">
          <button
            onClick={() => navigate('/')}
            class="mb-2 text-gray-500 hover:text-gray-800 flex items-center gap-1"
          >
            ← กลับหน้าหลัก
          </button>
          <h2 class="text-2xl font-bold">📂 ประวัติใบสั่งงาน</h2>
        </div>

        {/* Filters */}
        <div class="flex flex-col md:flex-row gap-2 w-full md:w-auto bg-white p-2 rounded shadow-sm border">
          <div class="relative w-full md:w-64">
            <span class="absolute left-3 top-2.5 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="ค้นหาเลขงาน / ชื่อลูกค้า..."
              class="pl-9 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300 w-full"
              value={order.state.searchQuery}
              onInput={(e) => order.setSearchQuery(e.currentTarget.value)}
            />
          </div>

          <select
            class="py-2 px-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer bg-white w-full md:w-auto"
            value={order.state.statusFilter}
            onChange={(e) => order.setStatusFilter(e.currentTarget.value)}
          >
            <option value="">Showing: ทุกสถานะ</option>
            <For each={Object.entries(order.statusOptions)}>
              {([key, info]) => <option value={key}>{info.label}</option>}
            </For>
          </select>
        </div>
      </div>

      {/* Table */}
      <div class="bg-white rounded shadow overflow-hidden">
        {/* Top Pagination */}
        <Show when={order.filteredHistory().length > 0}>
          <div class="bg-gray-50 border-b p-4 flex flex-col gap-4">
            <div class="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div class="text-xs text-gray-600">
                แสดงหน้า <span class="font-bold">{order.state.currentPage}</span> จาก{' '}
                <span class="font-bold">{order.totalPages()}</span> (ทั้งหมด{' '}
                <span class="font-bold">{order.filteredHistory().length}</span> รายการ)
              </div>
            </div>

            {/* Arrow Buttons + Page Numbers */}
            <div class="flex flex-wrap items-center justify-center gap-1">
              {/* Previous Button */}
              <button
                onClick={() => order.changePage(order.state.currentPage - 1)}
                disabled={order.state.currentPage === 1}
                class="px-3 py-2 rounded border bg-white hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                title="ก่อนหน้า"
              >
                ← ก่อนหน้า
              </button>

              {/* Page Numbers */}
              <div class="flex flex-wrap items-center gap-1">
                <For each={order.getPageNumbers()}>
                  {(page) => (
                    <button
                      onClick={() => typeof page === 'number' && order.changePage(page)}
                      disabled={typeof page === 'string'}
                      class={`px-2.5 py-2 rounded border transition text-sm font-medium min-w-[40px] text-center ${
                        page === order.state.currentPage
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
                onClick={() => order.changePage(order.state.currentPage + 1)}
                disabled={order.state.currentPage === order.totalPages()}
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
            <thead>
              <tr class="bg-blue-100 text-left">
                <th class="p-3">ID งาน</th>
                <th class="p-3">วันที่</th>
                <th class="p-3">ลูกค้า</th>
                <th class="p-3">ชื่องาน</th>
                <th class="p-3">ยอดรวม</th>
                <th class="p-3">สถานะ</th>
                <th class="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              <For each={order.paginatedHistory()}>
                {(job) => (
                  <tr class="border-b hover:bg-gray-50">
                    <td class="p-3 font-mono font-bold text-blue-600">{job.job_id}</td>
                    <td class="p-3">{formatDate(job.created_at)}</td>
                    <td class="p-3">{job.customer_name}</td>
                    <td class="p-3">{job.event_name}</td>
                    <td class="p-3">{formatCurrency(job.total_price)}</td>
                    <td class="p-3">
                      <Show
                        when={order.statusOptions[job.status]}
                        fallback={<span class="text-gray-400 text-xs">{job.status}</span>}
                      >
                        <span
                          class={`px-2 py-1 rounded-full text-xs font-bold border border-opacity-20 whitespace-nowrap ${
                            order.statusOptions[job.status]?.class
                          }`}
                        >
                          {order.statusOptions[job.status]?.label}
                        </span>
                      </Show>
                    </td>
                    <td class="p-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => navigate(`/history/${job.job_id}`)}
                          class="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 px-3 py-1 rounded text-xs transition flex items-center gap-1"
                        >
                          📄 ดู
                        </button>
                        <button
                          onClick={() => generateJobPdf(job)}
                          class="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-3 py-1 rounded text-xs transition flex items-center gap-1"
                        >
                          🖨️ PDF
                        </button>
                        <Show when={isAdmin()}>
                          <button
                            onClick={() => {
                              order.editJob(job);
                              navigate('/order');
                            }}
                            class="bg-yellow-50 text-yellow-600 hover:bg-yellow-100 border border-yellow-200 px-3 py-1 rounded text-xs transition flex items-center gap-1"
                          >
                            ✏️ แก้ไข
                          </button>
                        </Show>
                        <Show when={can('change_status')}>
                          <button
                            onClick={() => openStatusModal(job)}
                            class="bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200 px-3 py-1 rounded text-xs transition flex items-center gap-1"
                          >
                            🔄 สถานะ
                          </button>
                        </Show>
                      </div>
                    </td>
                  </tr>
                )}
              </For>

              <Show when={order.paginatedHistory().length === 0}>
                <tr>
                  <td colspan="7" class="p-8 text-center text-gray-500 bg-gray-50">
                    ❌ ไม่พบข้อมูลที่ค้นหา (จากทั้งหมด {order.state.jobHistory.length} รายการ)
                  </td>
                </tr>
              </Show>
            </tbody>
          </table>
        </div>

        {/* Pagination - Show if there are items */}
        <Show when={order.filteredHistory().length > 0}>
          <div class="bg-gray-50 border-t p-4 flex flex-col gap-4">
            <div class="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div class="text-xs text-gray-600">
                แสดงหน้า <span class="font-bold">{order.state.currentPage}</span> จาก{' '}
                <span class="font-bold">{order.totalPages()}</span> (ทั้งหมด{' '}
                <span class="font-bold">{order.filteredHistory().length}</span> รายการ)
              </div>
            </div>

            {/* Arrow Buttons + Page Numbers */}
            <div class="flex flex-wrap items-center justify-center gap-1">
              {/* Previous Button */}
              <button
                onClick={() => order.changePage(order.state.currentPage - 1)}
                disabled={order.state.currentPage === 1}
                class="px-3 py-2 rounded border bg-white hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                title="กำนหน้า"
              >
                ← ก่อนหน้า
              </button>

              {/* Page Numbers */}
              <div class="flex flex-wrap items-center gap-1">
                <For each={order.getPageNumbers()}>
                  {(page) => (
                    <button
                      onClick={() => typeof page === 'number' && order.changePage(page)}
                      disabled={typeof page === 'string'}
                      class={`px-2.5 py-2 rounded border transition text-sm font-medium min-w-[40px] text-center ${
                        page === order.state.currentPage
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
                onClick={() => order.changePage(order.state.currentPage + 1)}
                disabled={order.state.currentPage === order.totalPages()}
                class="px-3 py-2 rounded border bg-white hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                title="ถัดไป"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        </Show>
      </div>

      {/* Status Modal */}
      <Modal isOpen={statusModalOpen()} onClose={() => setStatusModalOpen(false)} title="เปลี่ยนสถานะ" size="sm">
        <div class="space-y-4">
          <select
            class="w-full border p-2 rounded"
            value={selectedStatus()}
            onChange={(e) => setSelectedStatus(e.currentTarget.value as JobStatus)}
          >
            <For each={Object.entries(order.statusOptions)}>
              {([key, info]) => <option value={key}>{info.label}</option>}
            </For>
          </select>

          <div class="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStatusModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={saveStatus}>บันทึก</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default History;
