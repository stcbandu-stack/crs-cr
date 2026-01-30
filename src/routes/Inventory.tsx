import { Component, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useInventory } from '@/composables/useInventory';
import { formatCurrency } from '@/lib/utils';
import { Button, Input, Modal } from '@/components';
import type { Material } from '@/lib/types';

const Inventory: Component = () => {
  const navigate = useNavigate();
  const inventory = useInventory();

  onMount(() => {
    inventory.fetchMaterials();
  });

  return (
    <div class="container mx-auto p-4">
      {/* Header */}
      <button
        onClick={() => navigate('/')}
        class="mb-4 text-gray-500 hover:text-gray-800 flex items-center gap-1"
      >
        ← กลับหน้าหลัก
      </button>

      <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h2 class="text-2xl font-bold flex items-center gap-2">📦 คลังวัสดุ</h2>
      </div>

      {/* Controls */}
      <div class="bg-white p-4 rounded shadow mb-6 space-y-4">
        {/* Tabs */}
        <div class="flex border-b">
          <button
            onClick={() => inventory.setActiveTab('printing')}
            class={`px-6 py-2 font-bold transition-colors border-b-2 ${
              inventory.state.activeTab === 'printing'
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            🖨️ วัสดุพิมพ์ (ม้วน)
          </button>
          <button
            onClick={() => inventory.setActiveTab('consumable')}
            class={`px-6 py-2 font-bold transition-colors border-b-2 ${
              inventory.state.activeTab === 'consumable'
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            ✂️ วัสดุสิ้นเปลือง (ชิ้น/แพ็ค)
          </button>
        </div>

        {/* Search & Actions */}
        <div class="flex flex-col md:flex-row justify-between items-center gap-4">
          <div class="relative w-full md:w-96">
            <span class="absolute left-3 top-2.5 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="ค้นหาชื่อ, ยี่ห้อ, รหัส..."
              class="pl-9 pr-4 py-2 border rounded w-full focus:ring-2 focus:ring-blue-300 outline-none"
              value={inventory.state.materialSearch}
              onInput={(e) => inventory.setMaterialSearch(e.currentTarget.value)}
            />
          </div>

          <div class="flex gap-2 w-full md:w-auto">
            {/* View Mode */}
            <div class="flex border rounded overflow-hidden">
              <button
                onClick={() => inventory.setViewMode('grid')}
                class={`px-3 py-2 ${
                  inventory.state.viewMode === 'grid' ? 'bg-blue-100 text-blue-700' : 'bg-white hover:bg-gray-50'
                }`}
              >
                ⬛ Card
              </button>
              <div class="w-px bg-gray-300" />
              <button
                onClick={() => inventory.setViewMode('table')}
                class={`px-3 py-2 ${
                  inventory.state.viewMode === 'table' ? 'bg-blue-100 text-blue-700' : 'bg-white hover:bg-gray-50'
                }`}
              >
                ☰ Table
              </button>
            </div>

            <button
              onClick={() => {
                navigate('/inventory/logs');
                inventory.fetchLogs();
              }}
              class="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 border"
            >
              📜 ประวัติ
            </button>

            <Button onClick={() => inventory.openMaterialModal('add')}>+ เพิ่มวัสดุ</Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white p-4 rounded shadow border-l-4 border-blue-500">
          <p class="text-gray-500 text-sm">มูลค่าสต็อกคงเหลือ</p>
          <p class="text-2xl font-bold text-blue-600">{formatCurrency(inventory.totalStockValue())} บาท</p>
        </div>
        <div class="bg-white p-4 rounded shadow border-l-4 border-green-500">
          <p class="text-gray-500 text-sm">มูลค่ารับเข้า (รวม)</p>
          <p class="text-2xl font-bold text-green-600">{formatCurrency(inventory.totalInValue())} บาท</p>
        </div>
        <div class="bg-white p-4 rounded shadow border-l-4 border-red-500">
          <p class="text-gray-500 text-sm">มูลค่าเบิกออก (รวม)</p>
          <p class="text-2xl font-bold text-red-600">{formatCurrency(inventory.totalOutValue())} บาท</p>
        </div>
      </div>

      {/* Grid View */}
      <Show when={inventory.state.viewMode === 'grid'}>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <For each={inventory.sortedMaterials()}>
            {(mat) => (
              <div
                class={`rounded-lg shadow border overflow-hidden flex flex-col relative transition-all hover:shadow-md ${
                  mat.remaining_qty === 0
                    ? 'bg-red-600 text-white border-red-700'
                    : mat.remaining_qty <= mat.min_alert
                    ? 'bg-yellow-300 text-gray-900 border-yellow-400'
                    : 'bg-white text-gray-800 border-gray-200'
                }`}
              >
                <div class="p-4 flex-grow flex flex-col">
                  <h3 class="font-bold text-lg mb-1">{mat.name}</h3>
                  <p class="text-sm opacity-80">{mat.brand || '-'}</p>
                  <p class="text-sm opacity-80">{mat.category}</p>

                  <div class="mt-auto pt-4">
                    <p class="text-2xl font-bold">
                      {mat.remaining_qty.toFixed(2)} {mat.unit}
                    </p>
                    <p class="text-sm opacity-70">
                      ทุน: {formatCurrency(mat.cost_per_unit)} บาท/{mat.unit}
                    </p>
                  </div>
                </div>

                <div class="p-3 gap-2 flex flex-col bg-black/5">
                  <div class="flex gap-2">
                    <button
                      onClick={() => inventory.openStockAction('IN', mat)}
                      class="flex-1 py-1.5 px-3 rounded bg-green-600 text-white hover:bg-green-700 transition-colors shadow-sm text-sm font-semibold"
                    >
                      + รับเข้า
                    </button>
                    <button
                      onClick={() => inventory.openStockAction('OUT', mat)}
                      class="flex-1 py-1.5 px-3 rounded bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm text-sm font-semibold"
                    >
                      - เบิกออก
                    </button>
                  </div>

                  <div class="flex gap-2 text-xs">
                    <button
                      onClick={() => inventory.openMaterialModal('edit', mat)}
                      class="flex-1 py-1.5 px-2 rounded bg-white text-gray-700 hover:bg-gray-50 border shadow-sm transition-colors"
                    >
                      ✏️ แก้ไข
                    </button>
                    <button
                      onClick={() => inventory.deleteMaterial(mat.id)}
                      class="flex-1 py-1.5 px-2 rounded bg-white text-red-600 hover:bg-red-50 border shadow-sm transition-colors"
                    >
                      🗑️ ลบ
                    </button>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Table View */}
      <Show when={inventory.state.viewMode === 'table'}>
        <div class="bg-white rounded shadow overflow-x-auto">
          <table class="w-full text-sm min-w-[800px]">
            <thead class="bg-gray-100">
              <tr>
                <th class="p-3 text-left">ชื่อ</th>
                <th class="p-3 text-left">ยี่ห้อ</th>
                <th class="p-3 text-left">หมวดหมู่</th>
                <th class="p-3 text-right">คงเหลือ</th>
                <th class="p-3 text-right">ทุน/หน่วย</th>
                <th class="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              <For each={inventory.sortedMaterials()}>
                {(mat) => (
                  <tr
                    class={`border-b hover:bg-gray-50 ${
                      mat.remaining_qty === 0
                        ? 'bg-red-100'
                        : mat.remaining_qty <= mat.min_alert
                        ? 'bg-yellow-100'
                        : ''
                    }`}
                  >
                    <td class="p-3 font-medium">{mat.name}</td>
                    <td class="p-3">{mat.brand || '-'}</td>
                    <td class="p-3">{mat.category}</td>
                    <td class="p-3 text-right font-bold">
                      {mat.remaining_qty.toFixed(2)} {mat.unit}
                    </td>
                    <td class="p-3 text-right">{formatCurrency(mat.cost_per_unit)}</td>
                    <td class="p-3">
                      <div class="flex justify-center gap-1">
                        <button
                          onClick={() => inventory.openStockAction('IN', mat)}
                          class="bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-600"
                        >
                          + รับ
                        </button>
                        <button
                          onClick={() => inventory.openStockAction('OUT', mat)}
                          class="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600"
                        >
                          - เบิก
                        </button>
                        <button
                          onClick={() => inventory.openMaterialModal('edit', mat)}
                          class="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600"
                        >
                          ✏️
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      {/* Material Modal */}
      <Modal
        isOpen={inventory.materialModal().isOpen}
        onClose={inventory.closeMaterialModal}
        title={inventory.materialModal().mode === 'add' ? 'เพิ่มวัสดุใหม่' : 'แก้ไขวัสดุ'}
        size="lg"
      >
        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="ชื่อวัสดุ"
              value={inventory.materialModal().data.name || ''}
              onInput={(e) => inventory.updateMaterialModalData('name', e.currentTarget.value)}
            />

            <div>
              <label class="block text-sm font-bold mb-1">หมวดหมู่</label>
              <select
                class="w-full border p-2 rounded"
                value={inventory.materialModal().data.category || ''}
                onChange={(e) => inventory.updateMaterialModalData('category', e.currentTarget.value)}
              >
                <For each={inventory.materialCategories}>
                  {(cat) => <option value={cat}>{cat}</option>}
                </For>
              </select>
            </div>

            <div>
              <label class="block text-sm font-bold mb-1">ประเภท</label>
              <select
                class="w-full border p-2 rounded"
                value={inventory.materialModal().data.type || 'roll'}
                onChange={(e) => inventory.updateMaterialModalData('type', e.currentTarget.value)}
              >
                <For each={inventory.materialTypes}>
                  {(type) => <option value={type.id}>{type.label}</option>}
                </For>
              </select>
            </div>

            <Input
              label="ยี่ห้อ"
              value={inventory.materialModal().data.brand || ''}
              onInput={(e) => inventory.updateMaterialModalData('brand', e.currentTarget.value)}
            />

            <Show when={inventory.materialModal().data.type === 'roll'}>
              <Input
                label="ความกว้าง (เมตร)"
                type="number"
                value={inventory.materialModal().data.width || 0}
                onInput={(e) => inventory.updateMaterialModalData('width', parseFloat(e.currentTarget.value) || 0)}
              />
            </Show>

            <Input
              label="จำนวนเริ่มต้น"
              type="number"
              value={inventory.materialModal().data.remaining_qty || 0}
              onInput={(e) =>
                inventory.updateMaterialModalData('remaining_qty', parseFloat(e.currentTarget.value) || 0)
              }
            />

            <Input
              label="แจ้งเตือนเมื่อต่ำกว่า"
              type="number"
              value={inventory.materialModal().data.min_alert || 0}
              onInput={(e) => inventory.updateMaterialModalData('min_alert', parseFloat(e.currentTarget.value) || 0)}
            />

            <Input
              label="ทุนต่อหน่วย (บาท)"
              type="number"
              value={inventory.materialModal().data.cost_per_unit || 0}
              onInput={(e) =>
                inventory.updateMaterialModalData('cost_per_unit', parseFloat(e.currentTarget.value) || 0)
              }
            />
          </div>

          <div class="flex justify-end gap-2 pt-4 border-t">
            <Button variant="secondary" onClick={inventory.closeMaterialModal}>
              ยกเลิก
            </Button>
            <Button onClick={inventory.saveMaterial}>บันทึก</Button>
          </div>
        </div>
      </Modal>

      {/* Stock Action Modal */}
      <Modal
        isOpen={inventory.stockActionModal().isOpen}
        onClose={inventory.closeStockAction}
        title={`${inventory.stockActionModal().type === 'IN' ? 'รับเข้า' : 'เบิกออก'} - ${
          inventory.stockActionModal().material?.name
        }`}
        size="md"
      >
        <div class="space-y-4">
          <Show when={inventory.stockActionModal().material?.type === 'roll'}>
            <Input
              label="ความยาว (เมตร)"
              type="number"
              value={inventory.stockActionModal().data.length}
              onInput={(e) => inventory.updateStockActionData('length', parseFloat(e.currentTarget.value) || 0)}
            />
            <p class="text-sm text-gray-500">
              พื้นที่: {inventory.stockActionModal().material?.width || 0} ม. x{' '}
              {inventory.stockActionModal().data.length} ม. ={' '}
              {((inventory.stockActionModal().material?.width || 0) * inventory.stockActionModal().data.length).toFixed(
                2
              )}{' '}
              ตร.ม.
            </p>
          </Show>

          <Show when={inventory.stockActionModal().material?.type !== 'roll'}>
            <Input
              label="จำนวน"
              type="number"
              value={inventory.stockActionModal().data.qty}
              onInput={(e) => inventory.updateStockActionData('qty', parseFloat(e.currentTarget.value) || 0)}
            />
          </Show>

          <Input
            label="วันที่"
            type="date"
            value={inventory.stockActionModal().data.date}
            onInput={(e) => inventory.updateStockActionData('date', e.currentTarget.value)}
          />

          <Input
            label="หมายเหตุ"
            value={inventory.stockActionModal().data.note}
            onInput={(e) => inventory.updateStockActionData('note', e.currentTarget.value)}
          />

          <div class="flex justify-end gap-2 pt-4 border-t">
            <Button variant="secondary" onClick={inventory.closeStockAction}>
              ยกเลิก
            </Button>
            <Button
              variant={inventory.stockActionModal().type === 'IN' ? 'success' : 'danger'}
              onClick={inventory.submitStockAction}
            >
              {inventory.stockActionModal().type === 'IN' ? 'รับเข้า' : 'เบิกออก'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Inventory;
