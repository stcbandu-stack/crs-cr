import { Component, For, Show, onMount, createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/store/ui';
import type { Material } from '@/lib/types';
import { MATERIAL_CATEGORIES } from '@/lib/types';

const InventoryReport: Component = () => {
  const navigate = useNavigate();
  const [materials, setMaterials] = createSignal<Material[]>([]);
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    await fetchMaterials();
  });

  const fetchMaterials = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('materials').select('*');
      if (error) throw error;
      setMaterials(data || []);
    } catch (e) {
      console.error('Error fetching materials:', e);
      showToast('ไม่สามารถโหลดข้อมูลวัสดุได้', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Group materials by category
  const groupedMaterials = () => {
    const grouped = new Map<string, Material[]>();

    materials()
      .filter(m => !m.is_deleted)
      .forEach(m => {
        if (!grouped.has(m.category)) {
          grouped.set(m.category, []);
        }
        grouped.get(m.category)!.push(m);
      });

    // Sort by category order
    const result: [string, Material[]][] = [];
    MATERIAL_CATEGORIES.forEach(cat => {
      if (grouped.has(cat)) {
        result.push([cat, grouped.get(cat)!]);
      }
    });
    return result;
  };

  return (
    <div class="min-h-screen bg-white p-8">
      {/* Header */}
      <div class="mb-6 flex items-center gap-4">
        <button
          onClick={() => navigate('/inventory')}
          class="text-gray-500 hover:text-gray-800 flex items-center gap-1"
        >
          ← ย้อนกลับ
        </button>
        <h1 class="text-3xl font-bold">📋 รายงานวัสดุ</h1>
      </div>

      <Show when={loading()}>
        <div class="text-center py-12 text-gray-500">⏳ กำลังโหลดข้อมูล...</div>
      </Show>

      <Show when={!loading()}>
        <For each={groupedMaterials()}>
          {([category, categoryMaterials]) => (
            <div class="mb-8">
              <h2 class="text-2xl font-bold text-gray-700 mb-4 pb-2 border-b-2 border-gray-300">
                {category}
              </h2>

              <div class="overflow-x-auto">
                <table class="w-full border-collapse">
                  <thead>
                    <tr class="bg-gray-200">
                      <th class="border border-gray-300 px-4 py-2 text-left">ชื่อวัสดุ</th>
                      <th class="border border-gray-300 px-4 py-2 text-center">รับเข้า</th>
                      <th class="border border-gray-300 px-4 py-2 text-center">เบิกออก</th>
                      <th class="border border-gray-300 px-4 py-2 text-center">คงเหลือ</th>
                      <th class="border border-gray-300 px-4 py-2 text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={categoryMaterials}>
                      {(mat) => (
                        <tr>
                          <td class="border border-gray-300 px-4 py-2">{mat.name}</td>
                          <td class="border border-gray-300 px-4 py-2 text-center">
                            {(mat.total_in || 0).toFixed(2)} {mat.unit}
                          </td>
                          <td class="border border-gray-300 px-4 py-2 text-center">
                            {(mat.total_out || 0).toFixed(2)} {mat.unit}
                          </td>
                          <td class="border border-gray-300 px-4 py-2 text-center font-bold">
                            {mat.remaining_qty.toFixed(2)} {mat.unit}
                          </td>
                          <td
                            class={`border border-gray-300 px-4 py-2 text-center font-bold ${
                              mat.remaining_qty === 0
                                ? 'text-red-600'
                                : mat.remaining_qty <= mat.min_alert
                                ? 'text-orange-600'
                                : 'text-gray-700'
                            }`}
                          >
                            {mat.remaining_qty === 0
                              ? 'หมดแล้ว'
                              : mat.remaining_qty <= mat.min_alert
                              ? 'ใกล้หมด'
                              : 'ปกติ'}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
};

export default InventoryReport;
