import { Component, Show, For, createSignal, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { authState, isAdmin } from '@/store/auth';
import { useOrder } from '@/composables/useOrder';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Button, Input, Modal } from '@/components';
import type { Service, Customer, JobStatus } from '@/lib/types';

const Order: Component = () => {
  const navigate = useNavigate();
  const order = useOrder();

  // Status Modal State
  const [statusModalOpen, setStatusModalOpen] = createSignal(false);
  const [selectedStatus, setSelectedStatus] = createSignal<JobStatus>('waiting_approval');

  const services = () => authState.services;
  const customers = () => authState.customers;

  return (
    <div class="container mx-auto p-4">
      {/* Back Button */}
      <button
        onClick={() => {
          if (order.isEditMode()) {
            order.resetOrder();
          }
          navigate('/');
        }}
        class="mb-4 text-gray-500 hover:text-gray-800 no-print flex items-center gap-1"
      >
        <span>←</span> กลับหน้าหลัก
      </button>

      {/* Order Form */}
      <Show when={!order.state.showPreview}>
        <div class="bg-white p-4 md:p-6 rounded shadow">
          {/* Header with Edit Mode Indicator */}
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b pb-2 gap-2">
            <h2 class="text-xl font-bold">
              {order.isEditMode() ? '✏️ แก้ไขใบสั่งงาน' : 'รายละเอียดใบสั่งงาน'}
            </h2>
            <Show when={order.isEditMode()}>
              <div class="flex items-center gap-2">
                <span class="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
                  กำลังแก้ไข: {order.state.generatedJobId}
                </span>
                <button
                  onClick={() => {
                    order.resetOrder();
                    navigate('/history');
                  }}
                  class="text-red-500 hover:text-red-700 text-sm"
                >
                  ยกเลิก
                </button>
              </div>
            </Show>
          </div>

          {/* Customer Type */}
          <div class="mb-4 flex flex-col sm:flex-row gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={order.state.form.customerType === 'general'}
                onChange={() => order.setFormField('customerType', 'general')}
              />
              ลูกค้าทั่วไป
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={order.state.form.customerType === 'corporate'}
                onChange={() => order.setFormField('customerType', 'corporate')}
              />
              ลูกค้าองค์กร
            </label>
          </div>

          {/* Customer Info */}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Show when={order.state.form.customerType === 'corporate'}>
              <div>
                <label class="block text-sm font-bold">เลือกองค์กร</label>
                <select
                  class="w-full border p-2 rounded"
                  onChange={(e) => {
                    const customer = customers().find((c) => c.id === e.currentTarget.value);
                    if (customer) order.fillCustomerInfo(customer);
                  }}
                >
                  <option value="">-- เลือก --</option>
                  <For each={customers()}>
                    {(c) => <option value={c.id}>{c.name}</option>}
                  </For>
                </select>
              </div>
            </Show>

            <div>
              <Input
                label="ชื่อลูกค้า"
                value={order.state.form.customerName}
                onInput={(e) => order.setFormField('customerName', e.currentTarget.value)}
              />
            </div>

            <div>
              <Input
                label="สาขา/หน่วยงาน"
                value={order.state.form.branch}
                onInput={(e) => order.setFormField('branch', e.currentTarget.value)}
              />
            </div>

            <div>
              <Input
                label="ชื่องาน/กิจกรรม"
                value={order.state.form.eventName}
                onInput={(e) => order.setFormField('eventName', e.currentTarget.value)}
              />
            </div>

            <div>
              <Input
                label="วันที่จัดกิจกรรม"
                type="date"
                value={order.state.form.eventDate}
                onInput={(e) => order.setFormField('eventDate', e.currentTarget.value)}
              />
            </div>
          </div>

          {/* Items Table */}
          <h3 class="font-bold mt-6 mb-2">รายการสั่งทำ ({order.state.form.items.length}/30)</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse border min-w-[600px]">
              <thead>
                <tr class="bg-gray-200">
                  <th class="border p-2">บริการ</th>
                  <th class="border p-2 w-16">กว้าง</th>
                  <th class="border p-2 w-16">สูง</th>
                  <th class="border p-2 w-16">หน่วย</th>
                  <th class="border p-2 w-16">จำนวน</th>
                  <th class="border p-2 w-24">ราคา/หน่วย</th>
                  <th class="border p-2 w-24">รวม</th>
                  <th class="border p-2">หมายเหตุ</th>
                  <th class="border p-2 w-10">ลบ</th>
                </tr>
              </thead>
              <tbody>
                <For each={order.state.form.items}>
                  {(item, idx) => (
                    <tr>
                      <td class="border p-1">
                        <select
                          class="w-full p-1 border"
                          onChange={(e) => {
                            const selectedValue = e.currentTarget.value;
                            if (selectedValue === 'other') {
                              order.setItemService(idx(), { service_name: 'อื่นๆ', unit_price: 0 });
                            } else {
                              const service = services().find((s) => String(s.id) === selectedValue);
                              if (service) {
                                order.setItemService(idx(), service);
                              }
                            }
                          }}
                        >
                          <For each={services()}>
                            {(s) => (
                              <option 
                                value={s.id}
                                selected={(item.service as Service).id === s.id}
                              >
                                {s.service_name}
                              </option>
                            )}
                          </For>
                          <option value="other" selected={item.service.service_name === 'อื่นๆ'}>อื่นๆ</option>
                        </select>
                        <Show when={item.service.service_name === 'อื่นๆ'}>
                          <input
                            type="text"
                            placeholder="ระบุชื่อ"
                            class="w-full mt-1 p-1 border text-xs"
                            value={item.customName}
                            onInput={(e) => order.updateItemField(idx(), 'customName', e.currentTarget.value)}
                          />
                        </Show>
                      </td>
                      <td class="border p-1">
                        <input
                          type="number"
                          class="w-full p-1 border"
                          value={item.w}
                          onInput={(e) => {
                            order.updateItemField(idx(), 'w', parseFloat(e.currentTarget.value) || 0);
                            order.calcRow(idx(), 'size');
                          }}
                        />
                      </td>
                      <td class="border p-1">
                        <input
                          type="number"
                          class="w-full p-1 border"
                          value={item.h}
                          onInput={(e) => {
                            order.updateItemField(idx(), 'h', parseFloat(e.currentTarget.value) || 0);
                            order.calcRow(idx(), 'size');
                          }}
                        />
                      </td>
                      <td class="border p-1">
                        <select
                          class="p-1 border w-full"
                          value={item.unit}
                          onChange={(e) => {
                            order.updateItemField(idx(), 'unit', e.currentTarget.value as 'cm' | 'm');
                            order.calcRow(idx(), 'size');
                          }}
                        >
                          <option value="cm">ซม.</option>
                          <option value="m">ม.</option>
                        </select>
                      </td>
                      <td class="border p-1">
                        <input
                          type="number"
                          class="w-full p-1 border"
                          value={item.qty}
                          onInput={(e) => {
                            order.updateItemField(idx(), 'qty', parseInt(e.currentTarget.value) || 1);
                            order.calcRow(idx(), 'qty');
                          }}
                        />
                      </td>
                      <td class="border p-1">
                        <input
                          type="number"
                          class="w-full p-1 border bg-gray-50 font-bold text-blue-600 text-right"
                          value={item.price}
                          readOnly={!isAdmin()}
                          onInput={(e) => {
                            if (isAdmin()) {
                              order.updateItemField(idx(), 'price', parseFloat(e.currentTarget.value) || 0);
                              order.calcRow(idx(), 'manual');
                            }
                          }}
                        />
                      </td>
                      <td class="border p-1 text-right">{formatCurrency(item.total)}</td>
                      <td class="border p-1">
                        <input
                          type="text"
                          class="w-full p-1 border"
                          value={item.note}
                          onInput={(e) => order.updateItemField(idx(), 'note', e.currentTarget.value)}
                        />
                      </td>
                      <td class="border p-1 text-center">
                        <button
                          onClick={() => order.removeItem(idx())}
                          class="text-red-500 font-bold hover:bg-red-100 px-2 rounded"
                        >
                          x
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>

          {/* Add Item Button */}
          <Show when={order.state.form.items.length < 30}>
            <button
              onClick={() => order.addItem(services())}
              class="mt-2 bg-green-500 text-white px-4 py-2 rounded text-sm hover:bg-green-600 w-full sm:w-auto"
            >
              + เพิ่มรายการ
            </button>
          </Show>

          {/* Actions */}
          <div class="mt-8 flex flex-col sm:flex-row justify-end gap-4 border-t pt-4">
            <Button variant="secondary" onClick={() => {
              order.resetOrder();
              if (order.isEditMode()) {
                navigate('/history');
              }
            }}>
              ยกเลิก
            </Button>
            <Show when={order.isEditMode()}>
              <Button variant="success" onClick={async () => {
                const success = await order.updateJob();
                if (success) {
                  navigate('/history');
                }
              }}>
                💾 บันทึกการแก้ไข
              </Button>
            </Show>
            <Show when={!order.isEditMode()}>
              <Button onClick={order.preparePreview}>ตรวจสอบ / สรุปยอด</Button>
            </Show>
          </div>
        </div>
      </Show>

      {/* Preview */}
      <Show when={order.state.showPreview}>
        <div class="relative">
          {/* A4 Document */}
          <div class="A4 bg-white max-w-[210mm] p-[10mm] mx-auto shadow-md">
            {/* Header */}
            <div class="text-center mb-6">
              <Show when={authState.provider?.logo_url}>
                <img src={authState.provider?.logo_url} class="h-16 mx-auto mb-2" alt="Logo" />
              </Show>
              <h1 class="text-xl md:text-2xl font-bold">{authState.provider?.org_name}</h1>
              <p class="text-xs md:text-sm">
                {authState.provider?.address} | โทร: {authState.provider?.phone} | เลขภาษี:{' '}
                {authState.provider?.tax_id}
              </p>
              <div class="mt-4 text-lg md:text-xl font-bold border-2 border-black inline-block px-4 py-1">
                ใบสั่งงาน / ใบส่งของ
              </div>
            </div>

            {/* Customer Info */}
            <div class="flex flex-col sm:flex-row justify-between mb-4 text-sm gap-4">
              <div class="w-full sm:w-2/3">
                <p>
                  <strong>ลูกค้า:</strong> {order.state.form.customerName}
                </p>
                <p>
                  <strong>สาขา/ที่อยู่:</strong> {order.state.form.branch}
                </p>
                <p>
                  <strong>ชื่องาน:</strong> {order.state.form.eventName}
                </p>
                <p>
                  <strong>วันที่ใช้งาน:</strong> {formatDate(order.state.form.eventDate)}
                </p>
              </div>
              <div class="w-full sm:w-1/3 text-left sm:text-right">
                <p>
                  <strong>เลขที่:</strong> {order.state.generatedJobId}
                </p>
                <p>
                  <strong>วันที่:</strong> {formatDate(new Date().toISOString())}
                </p>
                <p>
                  <strong>ผู้สั่งงาน:</strong>{' '}
                  {order.state.form.creatorName || authState.profile?.display_name}
                </p>
              </div>
            </div>

            {/* Items Table */}
            <div class="overflow-x-auto">
              <table class="w-full border-collapse border border-black text-sm mb-6 min-w-[500px]">
                <thead>
                  <tr class="bg-gray-200">
                    <th class="border border-black p-2 w-10">ลำดับ</th>
                    <th class="border border-black p-2">รายการ</th>
                    <th class="border border-black p-2 w-24">ขนาด (ม.)</th>
                    <th class="border border-black p-2 w-16">จำนวน</th>
                    <th class="border border-black p-2 w-24">ราคา/หน่วย</th>
                    <th class="border border-black p-2 w-24">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={order.state.form.items}>
                    {(item, idx) => (
                      <tr>
                        <td class="border border-black p-2 text-center">{idx() + 1}</td>
                        <td class="border border-black p-2">
                          {item.service.service_name === 'อื่นๆ'
                            ? item.customName
                            : item.service.service_name}
                          <Show when={item.note}>
                            <div class="text-xs text-gray-500">{item.note}</div>
                          </Show>
                        </td>
                        <td class="border border-black p-2 text-center">
                          {item.unit === 'cm' ? item.w / 100 : item.w} x{' '}
                          {item.unit === 'cm' ? item.h / 100 : item.h}
                        </td>
                        <td class="border border-black p-2 text-center">{item.qty}</td>
                        <td class="border border-black p-2 text-right">{formatCurrency(item.price)}</td>
                        <td class="border border-black p-2 text-right">{formatCurrency(item.total)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
                <tfoot>
                  <tr class="font-bold bg-gray-100">
                    <td colspan="5" class="border border-black p-2 text-right">
                      รวมเป็นเงินทั้งสิ้น
                    </td>
                    <td class="border border-black p-2 text-right">{formatCurrency(order.grandTotal())} บาท</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Signatures */}
            <div class="flex flex-col sm:flex-row justify-between mt-12 text-center px-4 sm:px-8 gap-8 sm:gap-0">
              <div>
                <p class="mb-8 border-b border-black w-48 mx-auto" />
                <p class="font-bold text-lg">{order.state.form.creatorName}</p>
                <p class="text-sm">(ผู้สั่งงาน)</p>
              </div>
              <div>
                <p class="mb-8 border-b border-black w-48 mx-auto" />
                <p class="font-bold text-lg">ผู้รับสินค้า / ลูกค้า</p>
                <p class="text-sm">วันที่ ...../...../..........</p>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div class="fixed bottom-0 left-0 w-full bg-white p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] flex flex-col sm:flex-row justify-center gap-4 no-print border-t z-10">
            <Button variant="secondary" onClick={order.closePreview}>
              แก้ไข
            </Button>
            <Button variant="ghost" onClick={() => window.print()} class="bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300">
              🖨️ พิมพ์ / PDF
            </Button>
            <Show when={!order.state.isHistoryView}>
              <Button variant="success" onClick={order.submitOrder}>
                ยืนยันส่งคำสั่งงาน
              </Button>
            </Show>
            <Show when={order.state.isHistoryView}>
              <Button variant="secondary" onClick={order.closePreview}>
                ปิด
              </Button>
            </Show>
          </div>

          {/* Spacer for fixed bar */}
          <div class="h-32 no-print" />
        </div>
      </Show>
    </div>
  );
};

export default Order;
