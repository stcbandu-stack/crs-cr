import { Component, For, Show, createSignal, createMemo, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useClaims } from '@/composables/useClaims';
import { formatDate, formatCurrency } from '@/lib/utils';
import { CLAIM_TYPE_OPTIONS, CLAIM_STATUS_OPTIONS } from '@/lib/types';
import { Button, Modal, Select } from '@/components';
import type { Claim, ClaimStatus } from '@/lib/types';

const Claims: Component = () => {
  const navigate = useNavigate();
  const claims = useClaims();

  const [statusFilter, setStatusFilter] = createSignal<ClaimStatus | ''>('');

  const [resolveModalOpen, setResolveModalOpen] = createSignal(false);
  const [resolveTarget, setResolveTarget] = createSignal<Claim | null>(null);
  const [resolutionNote, setResolutionNote] = createSignal('');
  const [responsibleName, setResponsibleName] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  onMount(() => {
    claims.fetchClaims();
    claims.fetchEmployees();
  });

  const filteredClaims = createMemo(() => {
    const filter = statusFilter();
    if (!filter) return claims.claims();
    return claims.claims().filter((c) => c.status === filter);
  });

  const openResolveModal = (claim: Claim) => {
    setResolveTarget(claim);
    setResolutionNote('');
    setResponsibleName(claim.responsible_name || '');
    setResolveModalOpen(true);
  };

  const confirmResolve = async () => {
    const claim = resolveTarget();
    if (!claim?.id) return;
    setSaving(true);
    const ok = await claims.resolveClaim(claim.id, resolutionNote(), responsibleName());
    setSaving(false);
    if (ok) setResolveModalOpen(false);
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
          <h2 class="text-2xl font-bold">⚠️ รายการแจ้งเคลม</h2>
        </div>

        <div class="flex flex-col md:flex-row gap-2 w-full md:w-auto bg-white p-2 rounded shadow-sm border">
          <select
            class="py-2 px-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer bg-white w-full md:w-auto"
            value={statusFilter()}
            onChange={(e) => setStatusFilter(e.currentTarget.value as ClaimStatus | '')}
          >
            <option value="">Showing: ทุกสถานะ</option>
            <For each={Object.entries(CLAIM_STATUS_OPTIONS)}>
              {([key, info]) => <option value={key}>{info.label}</option>}
            </For>
          </select>

          <Button variant="secondary" onClick={() => navigate('/claims/dashboard')}>
            📊 แดชบอร์ดเคลม
          </Button>
        </div>
      </div>

      {/* Table */}
      <div class="bg-white rounded shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[900px]">
            <thead>
              <tr class="bg-blue-100 text-left">
                <th class="p-3">วันที่</th>
                <th class="p-3">เลขที่งาน</th>
                <th class="p-3">ลูกค้า</th>
                <th class="p-3">ประเภท</th>
                <th class="p-3">รายละเอียด</th>
                <th class="p-3 text-right">ยอดเคลม</th>
                <th class="p-3">ผู้รับผิดชอบ</th>
                <th class="p-3">ผู้แจ้ง</th>
                <th class="p-3">สถานะ</th>
                <th class="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              <For each={filteredClaims()}>
                {(claim) => (
                  <tr class="border-b hover:bg-gray-50">
                    <td class="p-3 whitespace-nowrap">{formatDate(claim.created_at)}</td>
                    <td class="p-3 font-mono font-bold text-blue-600">
                      <button onClick={() => navigate(`/history/${claim.job_id}`)} class="hover:underline">
                        {claim.job_id}
                      </button>
                    </td>
                    <td class="p-3">{claim.customer_name}</td>
                    <td class="p-3">
                      {CLAIM_TYPE_OPTIONS[claim.claim_type]}
                      <Show when={claim.claim_type === 'other' && claim.claim_note}>
                        <div class="text-xs text-gray-400">{claim.claim_note}</div>
                      </Show>
                    </td>
                    <td class="p-3 max-w-xs truncate" title={claim.description}>{claim.description}</td>
                    <td class="p-3 text-right font-bold text-red-600 whitespace-nowrap">
                      {formatCurrency(claim.claim_amount)}
                    </td>
                    <td class="p-3">
                      <Show when={claim.responsible_name} fallback={<span class="text-gray-400">ยังไม่ระบุ</span>}>
                        {claim.responsible_name}
                      </Show>
                    </td>
                    <td class="p-3 text-gray-500">{claim.reported_by || '-'}</td>
                    <td class="p-3">
                      <span class={`px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap ${CLAIM_STATUS_OPTIONS[claim.status].class}`}>
                        {CLAIM_STATUS_OPTIONS[claim.status].label}
                      </span>
                    </td>
                    <td class="p-3">
                      <Show
                        when={claim.status === 'open'}
                        fallback={
                          <button
                            onClick={() => claim.id && claims.reopenClaim(claim.id)}
                            class="bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 px-3 py-1 rounded text-xs transition"
                          >
                            🔄 เปิดใหม่
                          </button>
                        }
                      >
                        <button
                          onClick={() => openResolveModal(claim)}
                          class="bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 px-3 py-1 rounded text-xs transition"
                        >
                          ✅ ปิดเคส
                        </button>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>

              <Show when={!claims.loading() && filteredClaims().length === 0}>
                <tr>
                  <td colspan="10" class="p-8 text-center text-gray-500 bg-gray-50">
                    ❌ ไม่พบรายการเคลม
                  </td>
                </tr>
              </Show>
            </tbody>
          </table>
        </div>
      </div>

      {/* Resolve Modal */}
      <Modal
        isOpen={resolveModalOpen()}
        onClose={() => setResolveModalOpen(false)}
        title={`✅ ปิดเคส ${resolveTarget()?.job_id || ''}`}
        size="sm"
      >
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-bold mb-1">สรุปผลการแก้ไข (ถ้ามี)</label>
            <textarea
              class="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-300 border-gray-300"
              rows="3"
              value={resolutionNote()}
              onInput={(e) => setResolutionNote(e.currentTarget.value)}
              placeholder="แก้ไขอะไรไปบ้าง"
            />
          </div>

          <Select
            label="พนักงานผู้รับผิดชอบ (ถ้าระบุได้)"
            value={responsibleName()}
            onChange={(e) => setResponsibleName(e.currentTarget.value)}
            placeholder="ไม่ระบุ"
            options={claims.employees().map((emp) => ({ value: emp.display_name, label: emp.display_name }))}
          />

          <div class="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResolveModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={confirmResolve} isLoading={saving()}>
              บันทึก
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Claims;
