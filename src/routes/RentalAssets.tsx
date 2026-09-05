import { Component, For, Show, createSignal, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useRentals } from '@/composables/useRentals';
import { isAdmin } from '@/store/auth';
import { showToast, openConfirm } from '@/store/ui';
import { formatDateTime } from '@/lib/utils';
import { Button, Input } from '@/components';

const RentalAssets: Component = () => {
  const navigate = useNavigate();
  const rental = useRentals();

  const [newName, setNewName] = createSignal('');
  const [newRate, setNewRate] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  onMount(() => {
    rental.fetchAssets();
  });

  const handleAdd = async () => {
    if (!newName().trim()) {
      showToast('กรอกชื่อทรัพย์สิน', 'error');
      return;
    }

    setSaving(true);
    const ok = await rental.addAsset(newName().trim(), parseFloat(newRate()) || 0);
    setSaving(false);

    if (ok) {
      showToast('เพิ่มทรัพย์สินแล้ว');
      setNewName('');
      setNewRate('');
    }
  };

  const handleUpdateRate = (id: string, rate: number) => {
    openConfirm(`ยืนยันเปลี่ยนค่าเช่าเป็น ${rate.toLocaleString()} บาท/วัน?`, async () => {
      if (await rental.updateAssetRate(id, rate)) showToast('บันทึกราคาแล้ว');
    });
  };

  const handleToggle = (id: string, name: string, isActive: boolean) => {
    const action = isActive ? 'ปิดการให้เช่า' : 'เปิดให้เช่าอีกครั้ง';
    openConfirm(`${action} "${name}"?`, async () => {
      if (await rental.setAssetActive(id, !isActive)) showToast(`${action}แล้ว`);
    });
  };

  return (
    <div class="container mx-auto p-4 max-w-5xl">
      <button onClick={() => navigate('/rentals')} class="mb-4 text-gray-500 hover:text-gray-800">
        ← กลับหน้าเช่าทรัพย์สิน
      </button>

      <h2 class="text-2xl font-bold mb-2">จัดการทรัพย์สินให้เช่า</h2>
      <p class="text-sm text-gray-500 mb-6">
        ค่าเช่าคิดต่อ 24 ชั่วโมง — เช่าไม่ถึง 1 วันคิดตามชั่วโมงจริง (ปัดขึ้น) ในอัตรา ค่าเช่า/วัน ÷ 24
      </p>

      {/* เพิ่มทรัพย์สิน */}
      <Show when={isAdmin()}>
        <div class="bg-white p-6 rounded shadow mb-6 border-l-4 border-green-500">
          <h3 class="font-bold text-lg mb-4">เพิ่มทรัพย์สินใหม่</h3>
          <div class="flex flex-col md:flex-row gap-4 items-end">
            <div class="w-full md:w-1/2">
              <Input
                label="ชื่อทรัพย์สิน"
                value={newName()}
                onInput={(e) => setNewName(e.currentTarget.value)}
              />
            </div>
            <div class="w-full md:w-1/4">
              <Input
                label="ค่าเช่า/วัน (บาท)"
                type="number"
                value={newRate()}
                onInput={(e) => setNewRate(e.currentTarget.value)}
              />
            </div>
            <Button onClick={handleAdd} isLoading={saving()}>
              + บันทึก
            </Button>
          </div>
        </div>
      </Show>

      {/* รายการทรัพย์สิน */}
      <div class="bg-white shadow rounded overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[640px]">
            <thead class="bg-gray-100 text-gray-700">
              <tr>
                <th class="p-3 text-left">ทรัพย์สิน</th>
                <th class="p-3 text-left">สภาพล่าสุด</th>
                <th class="p-3 text-left">ค่าเช่า/วัน</th>
                <th class="p-3 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <For each={rental.assets()}>
                {(asset) => (
                  <tr class="hover:bg-gray-50" classList={{ 'opacity-50': !asset.is_active }}>
                    <td class="p-3 font-medium">{asset.name}</td>
                    <td class="p-3">
                      <Show
                        when={asset.last_condition_image}
                        fallback={<span class="text-gray-400">— ยังไม่มีรูป</span>}
                      >
                        <a href={asset.last_condition_image!} target="_blank" rel="noreferrer" class="flex items-center gap-2">
                          <img
                            src={asset.last_condition_image!}
                            alt="สภาพล่าสุด"
                            class="h-12 w-12 object-cover rounded border"
                          />
                          <span class="text-xs text-gray-500">
                            {formatDateTime(asset.last_condition_at || undefined)}
                          </span>
                        </a>
                      </Show>
                    </td>
                    <td class="p-3 whitespace-nowrap">
                      <input
                        type="number"
                        value={asset.daily_rate}
                        onChange={(e) => handleUpdateRate(asset.id, parseFloat(e.currentTarget.value) || 0)}
                        disabled={!isAdmin()}
                        class="border p-1 w-28 rounded bg-gray-50 text-right disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isAdmin() ? 'แก้ไขค่าเช่า' : 'ต้องเป็น Admin เท่านั้น'}
                      />{' '}
                      บาท
                    </td>
                    <td class="p-3 text-center">
                      <button
                        onClick={() => handleToggle(asset.id, asset.name, asset.is_active)}
                        disabled={!isAdmin()}
                        class="px-3 py-1 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        classList={{
                          'bg-green-50 text-green-700 hover:bg-green-100': asset.is_active,
                          'bg-gray-100 text-gray-600 hover:bg-gray-200': !asset.is_active,
                        }}
                        title={isAdmin() ? 'เปิด/ปิดการให้เช่า' : 'ต้องเป็น Admin เท่านั้น'}
                      >
                        {asset.is_active ? 'ให้เช่าอยู่' : 'ปิดให้เช่า'}
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>

      <p class="text-xs text-gray-400 mt-4">
        ทรัพย์สินที่เคยถูกเช่าไปแล้วจะลบไม่ได้ (ใบเช่าเก่าต้องอ้างอิงได้) — ถ้าเลิกให้เช่าให้กด “ปิดให้เช่า” แทน
      </p>
    </div>
  );
};

export default RentalAssets;
