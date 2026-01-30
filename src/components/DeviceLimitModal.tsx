import { Component, Show, For } from 'solid-js';
import { authState } from '@/store/auth';
import { kickDevice, cancelDeviceKick } from '@/store/auth';
import { isLoading } from '@/store/ui';
import { formatDateTime } from '@/lib/utils';
import Modal from './Modal';
import Button from './Button';

const DeviceLimitModal: Component = () => {
  const sessions = () => authState.deviceSessions;
  const loading = isLoading;

  return (
    <Modal
      isOpen={sessions().length > 0}
      onClose={cancelDeviceKick}
      title="⚠️ จำนวนอุปกรณ์เกินกำหนด"
      size="lg"
    >
      <div class="space-y-4">
        <p class="text-gray-700">
          บัญชีของคุณ <strong>{authState.profile?.display_name}</strong> ได้ Login อยู่บนอุปกรณ์อื่นครบ 2 เครื่องแล้ว
        </p>
        <p class="text-gray-600">กรุณาเลือก "Kick" อุปกรณ์ที่ต้องการออก เพื่อใช้งานบนเครื่องนี้แทน</p>

        <div class="border rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-100">
              <tr>
                <th class="p-3 text-left">อุปกรณ์</th>
                <th class="p-3 text-left">ใช้งานล่าสุด</th>
                <th class="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              <For each={sessions()}>
                {(session) => (
                  <tr class="border-t hover:bg-gray-50">
                    <td class="p-3 font-medium">{session.device_name}</td>
                    <td class="p-3 text-gray-600">{formatDateTime(session.last_active)}</td>
                    <td class="p-3 text-center">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => kickDevice(session.id)}
                        isLoading={loading()}
                      >
                        Kick
                      </Button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>

        <div class="flex justify-end">
          <Button variant="secondary" onClick={cancelDeviceKick}>
            ยกเลิก / ออกจากระบบ
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DeviceLimitModal;
