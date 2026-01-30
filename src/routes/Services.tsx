import { Component, For, createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { authState, addService, updateServicePrice, deleteService, isAdmin } from '@/store/auth';
import { showToast, openConfirm } from '@/store/ui';
import { Button, Input } from '@/components';

const Services: Component = () => {
  const navigate = useNavigate();

  const [newServiceName, setNewServiceName] = createSignal('');
  const [newServicePrice, setNewServicePrice] = createSignal('');
  const [isLoading, setIsLoading] = createSignal(false);

  const handleAddService = async () => {
    if (!newServiceName()) {
      showToast('กรอกชื่อบริการ', 'error');
      return;
    }

    setIsLoading(true);
    const success = await addService(newServiceName(), parseFloat(newServicePrice()) || 0);
    setIsLoading(false);

    if (success) {
      showToast('เพิ่มบริการเรียบร้อย');
      setNewServiceName('');
      setNewServicePrice('');
    } else {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  };

  const handleUpdatePrice = (id: string, newPrice: number) => {
    openConfirm(`ยืนยันเปลี่ยนราคาบริการนี้เป็น ${newPrice} บาท?`, async () => {
      const success = await updateServicePrice(id, newPrice);
      if (success) {
        showToast('บันทึกราคาแล้ว');
      }
    });
  };

  const handleDeleteService = (id: string) => {
    openConfirm('ลบบริการนี้?', async () => {
      const success = await deleteService(id);
      if (success) {
        showToast('ลบเรียบร้อย');
      }
    });
  };

  return (
    <div class="container mx-auto p-4">
      {/* Header */}
      <button onClick={() => navigate('/')} class="mb-4 text-gray-500 hover:text-gray-800">
        ← กลับหน้าหลัก
      </button>

      <h2 class="text-2xl font-bold mb-6">จัดการราคาบริการ</h2>

      {/* Add New Service */}
      <div class="bg-white p-6 rounded shadow mb-6 border-l-4 border-green-500">
        <h3 class="font-bold text-lg mb-4">เพิ่มรายการบริการใหม่</h3>
        <div class="flex flex-col md:flex-row gap-4 items-end">
          <div class="w-full md:w-1/3">
            <Input
              label="ชื่อบริการ"
              value={newServiceName()}
              onInput={(e) => setNewServiceName(e.currentTarget.value)}
            />
          </div>
          <div class="w-full md:w-1/4">
            <Input
              label="ราคา (บาท)"
              type="number"
              value={newServicePrice()}
              onInput={(e) => setNewServicePrice(e.currentTarget.value)}
            />
          </div>
          <div class="w-full md:w-auto">
            <Button
              onClick={handleAddService}
              isLoading={isLoading()}
              disabled={!isAdmin()}
              title={isAdmin() ? 'บันทึกรายการ' : 'ต้องเป็น Admin เท่านั้น'}
            >
              + บันทึกรายการ
            </Button>
          </div>
        </div>
      </div>

      {/* Services Table */}
      <div class="bg-white shadow rounded overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[500px]">
            <thead class="bg-gray-100 text-gray-700">
              <tr>
                <th class="p-3 text-left">บริการ</th>
                <th class="border p-2">ราคา/หน่วย</th>
                <th class="p-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <For each={authState.services}>
                {(s) => (
                  <tr class="hover:bg-gray-50">
                    <td class="p-3 font-medium">{s.service_name}</td>
                    <td class="p-3">
                      <input
                        type="number"
                        value={s.unit_price}
                        onChange={(e) => handleUpdatePrice(s.id, parseFloat(e.currentTarget.value) || 0)}
                        disabled={!isAdmin()}
                        class="border p-1 w-24 rounded bg-gray-50 text-right disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isAdmin() ? 'แก้ไขราคา' : 'ต้องเป็น Admin เท่านั้น'}
                      />{' '}
                      บาท
                    </td>
                    <td class="p-3 text-center">
                      <button
                        onClick={() => handleDeleteService(s.id)}
                        disabled={!isAdmin()}
                        class="text-red-500 hover:text-red-700 bg-red-50 px-3 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isAdmin() ? 'ลบรายการ' : 'ต้องเป็น Admin เท่านั้น'}
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Services;
