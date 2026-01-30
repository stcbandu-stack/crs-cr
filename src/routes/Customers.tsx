import { Component, For, createSignal, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { authState, saveCustomer, deleteCustomer, isAdmin } from '@/store/auth';
import { showToast, openConfirm } from '@/store/ui';
import { Button, Input, Modal } from '@/components';
import type { Customer } from '@/lib/types';

const Customers: Component = () => {
  const navigate = useNavigate();

  // Modal State
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editingCustomer, setEditingCustomer] = createSignal<Partial<Customer>>({});

  const openModal = (customer?: Customer) => {
    setEditingCustomer(customer ? { ...customer } : { name: '', phone: '', address: '', tax_id: '' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const data = editingCustomer();
    if (!data.name) {
      showToast('กรุณากรอกชื่อ', 'error');
      return;
    }

    const success = await saveCustomer(data);
    if (success) {
      showToast('บันทึกเรียบร้อย');
      setModalOpen(false);
    } else {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  };

  const handleDelete = (id: string) => {
    openConfirm('ต้องการลบลูกค้านี้?', async () => {
      const success = await deleteCustomer(id);
      if (success) {
        showToast('ลบเรียบร้อย');
      }
    });
  };

  return (
    <div class="container mx-auto p-4">
      {/* Header */}
      <button onClick={() => navigate('/')} class="mb-4 text-gray-500 hover:text-gray-800">
        ← กลับ
      </button>

      <div class="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
        <h2 class="text-2xl font-bold">จัดการลูกค้าองค์กร</h2>
        <Button onClick={() => openModal()}>+ เพิ่มลูกค้า</Button>
      </div>

      {/* Table */}
      <div class="bg-white shadow rounded p-4 overflow-x-auto">
        <table class="w-full text-sm min-w-[700px]">
          <thead>
            <tr class="bg-gray-100 text-left">
              <th class="p-3">ชื่อองค์กร</th>
              <th class="p-3">เลขผู้เสียภาษี</th>
              <th class="p-3">ที่อยู่</th>
              <th class="p-3">เบอร์โทร</th>
              <th class="p-3 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <For each={authState.customers}>
              {(c) => (
                <tr class="border-b hover:bg-gray-50">
                  <td class="p-3 font-bold text-blue-900">{c.name}</td>
                  <td class="p-3 font-mono text-gray-600">{c.tax_id || '-'}</td>
                  <td class="p-3 text-gray-600 max-w-xs truncate" title={c.address}>
                    {c.address || '-'}
                  </td>
                  <td class="p-3">{c.phone}</td>
                  <td class="p-3 text-center">
                    <div class="flex justify-center gap-2">
                      <button
                        onClick={() => openModal(c)}
                        class="text-yellow-600 hover:text-yellow-800 bg-yellow-50 px-3 py-1 rounded border border-yellow-200"
                      >
                        แก้ไข
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        class="text-red-500 hover:text-red-700 bg-red-50 px-3 py-1 rounded border border-red-200"
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen()}
        onClose={() => setModalOpen(false)}
        title={editingCustomer().id ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'}
        size="md"
      >
        <div class="space-y-4">
          <Input
            label="ชื่อองค์กร"
            value={editingCustomer().name || ''}
            onInput={(e) => setEditingCustomer((prev) => ({ ...prev, name: e.currentTarget.value }))}
          />

          <Input
            label="เลขผู้เสียภาษี"
            value={editingCustomer().tax_id || ''}
            onInput={(e) => setEditingCustomer((prev) => ({ ...prev, tax_id: e.currentTarget.value }))}
          />

          <Input
            label="ที่อยู่"
            value={editingCustomer().address || ''}
            onInput={(e) => setEditingCustomer((prev) => ({ ...prev, address: e.currentTarget.value }))}
          />

          <Input
            label="เบอร์โทร"
            value={editingCustomer().phone || ''}
            onInput={(e) => setEditingCustomer((prev) => ({ ...prev, phone: e.currentTarget.value }))}
          />

          <div class="flex justify-end gap-2 pt-4 border-t">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={handleSave}>บันทึก</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Customers;
