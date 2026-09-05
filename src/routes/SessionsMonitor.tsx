import { Component, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useSessions } from '@/composables/useSessions';
import { isAdmin } from '@/store/auth';
import { formatDateTime } from '@/lib/utils';

const SessionsMonitor: Component = () => {
  const navigate = useNavigate();
  const sessions = useSessions();

  onMount(() => {
    if (isAdmin()) sessions.fetchSessions();
  });

  return (
    <div class="container mx-auto p-4 max-w-4xl">
      <button onClick={() => navigate('/')} class="mb-4 text-gray-500 hover:text-gray-800">
        ← กลับหน้าหลัก
      </button>

      <Show when={isAdmin()} fallback={<div class="text-center text-gray-400 py-12">หน้านี้สำหรับแอดมินเท่านั้น</div>}>
        <h2 class="text-2xl font-bold mb-2">🖥️ อุปกรณ์ที่ล็อกอินอยู่</h2>
        <p class="text-sm text-gray-500 mb-6">
          1 บัญชีล็อกอินได้พร้อมกันได้ไม่จำกัดจำนวนเครื่อง — หน้านี้แสดงไว้ให้ดูเฉยๆ ว่าใครใช้เครื่องไหนบ้าง
        </p>

        <Show when={sessions.loading()}>
          <div class="text-center py-12 text-gray-500">⏳ กำลังโหลดข้อมูล...</div>
        </Show>

        <Show when={!sessions.loading()}>
          <div class="space-y-3">
            <For each={sessions.accounts()}>
              {(account) => (
                <div class="bg-white rounded shadow p-4">
                  <div class="flex justify-between items-start gap-3 flex-wrap">
                    <div>
                      <div class="font-bold">{account.displayName}</div>
                      <div class="text-xs text-gray-500">
                        {account.email} · {account.role}
                      </div>
                    </div>
                    <span class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                      {account.devices.length} เครื่อง
                    </span>
                  </div>

                  <Show
                    when={account.devices.length > 0}
                    fallback={<div class="text-xs text-gray-400 mt-2">ไม่มีเครื่องที่ล็อกอินอยู่</div>}
                  >
                    <div class="mt-3 divide-y">
                      <For each={account.devices}>
                        {(device) => (
                          <div class="py-2 flex justify-between items-center text-sm">
                            <span>{device.deviceName}</span>
                            <span class="text-xs text-gray-500">
                              ใช้งานล่าสุด {formatDateTime(device.lastActive)}
                            </span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export default SessionsMonitor;
