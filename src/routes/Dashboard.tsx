import { Component, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { authState, can, canManageStock, isAdmin } from '@/store/auth';
import { Card } from '@/components';

const Dashboard: Component = () => {
  const navigate = useNavigate();

  return (
    <div class="container mx-auto p-6 max-w-6xl">
      <h2 class="text-3xl font-bold mb-8 text-gray-800">📌 เมนูหลัก</h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* สั่งงาน */}
        <Card
          class="min-h-[200px] flex flex-col justify-center items-center text-center gap-4 hover:scale-105 transition-transform border-2 border-blue-100 hover:border-blue-500 hover:bg-blue-50"
          onClick={() => navigate('/order')}
        >
          <div class="text-6xl mb-2">📝</div>
          <div>
            <h3 class="text-2xl font-bold text-gray-800">สั่งงาน</h3>
            <p class="text-gray-500 mt-1">สร้างใบสั่งงานใหม่</p>
          </div>
        </Card>

        {/* ประวัติใบสั่งงาน */}
        <Card
          class="min-h-[200px] flex flex-col justify-center items-center text-center gap-4 hover:scale-105 transition-transform border-2 border-green-100 hover:border-green-500 hover:bg-green-50"
          onClick={() => navigate('/history')}
        >
          <div class="text-6xl mb-2">📂</div>
          <div>
            <h3 class="text-2xl font-bold text-gray-800">ประวัติใบสั่งงาน</h3>
            <p class="text-gray-500 mt-1">ดูและแก้ไขงานเก่า</p>
          </div>
        </Card>

        {/* คลังวัสดุ */}
        <Show when={can('manage_stock')}>
          <Card
            class="min-h-[200px] flex flex-col justify-center items-center text-center gap-4 hover:scale-105 transition-transform border-2 border-teal-100 hover:border-teal-500 hover:bg-teal-50"
            onClick={() => navigate('/inventory')}
          >
            <div class="text-6xl mb-2">📦</div>
            <div>
              <h3 class="text-2xl font-bold text-gray-800">คลังวัสดุ</h3>
              <p class="text-gray-500 mt-1">จัดการสต็อก / เบิกจ่าย</p>
            </div>
          </Card>
        </Show>

        {/* ฐานข้อมูลลูกค้า */}
        <Show when={isAdmin()}>
          <Card
            class="min-h-[200px] flex flex-col justify-center items-center text-center gap-4 hover:scale-105 transition-transform border-2 border-yellow-100 hover:border-yellow-500 hover:bg-yellow-50"
            onClick={() => navigate('/customers')}
          >
            <div class="text-6xl mb-2">👥</div>
            <div>
              <h3 class="text-2xl font-bold text-gray-800">ฐานข้อมูลลูกค้า</h3>
              <p class="text-gray-500 mt-1">จัดการลูกค้าองค์กร</p>
            </div>
          </Card>
        </Show>

        {/* ฐานข้อมูลราคา */}
        <Show when={canManageStock()}>
          <Card
            class="min-h-[200px] flex flex-col justify-center items-center text-center gap-4 hover:scale-105 transition-transform border-2 border-purple-100 hover:border-purple-500 hover:bg-purple-50"
            onClick={() => navigate('/services')}
          >
            <div class="text-6xl mb-2">💰</div>
            <div>
              <h3 class="text-2xl font-bold text-gray-800">ฐานข้อมูลราคา</h3>
              <p class="text-gray-500 mt-1">จัดการราคาค่าบริการ</p>
            </div>
          </Card>
        </Show>
      </div>
    </div>
  );
};

export default Dashboard;
