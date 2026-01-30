import { Component, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { authState, can, canManageStock, isAdmin } from '@/store/auth';
import { Card } from '@/components';

const Dashboard: Component = () => {
  const navigate = useNavigate();

  return (
    <div class="container mx-auto p-4">
      <h2 class="text-2xl font-bold mb-6 text-center md:text-left">เมนูหลัก</h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {/* สั่งงาน */}
        <Card
          icon="📝"
          title="สั่งงาน"
          description="สร้างใบสั่งงานใหม่"
          borderColor="border-blue-500"
          onClick={() => navigate('/order')}
        />

        {/* ประวัติใบสั่งงาน */}
        <Card
          icon="📂"
          title="ประวัติใบสั่งงาน"
          description="ดูและแก้ไขงานเก่า"
          borderColor="border-green-500"
          onClick={() => navigate('/history')}
        />

        {/* คลังวัสดุ */}
        <Show when={can('manage_stock')}>
          <Card
            icon="📦"
            title="คลังวัสดุ"
            description="จัดการสต็อก / เบิกจ่าย"
            borderColor="border-teal-500"
            onClick={() => navigate('/inventory')}
          />
        </Show>

        {/* ฐานข้อมูลลูกค้า */}
        <Show when={isAdmin()}>
          <Card
            icon="👥"
            title="ฐานข้อมูลลูกค้า"
            description="จัดการลูกค้าองค์กร"
            borderColor="border-yellow-500"
            onClick={() => navigate('/customers')}
          />
        </Show>

        {/* ฐานข้อมูลราคา */}
        <Show when={canManageStock()}>
          <Card
            icon="💰"
            title="ฐานข้อมูลราคา"
            description="จัดการราคาค่าบริการ"
            borderColor="border-purple-500"
            onClick={() => navigate('/services')}
          />
        </Show>
      </div>
    </div>
  );
};

export default Dashboard;
