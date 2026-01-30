import { createSignal } from 'solid-js';
import type { Toast, ConfirmModal } from '@/lib/types';
import { CONFIG } from '@/lib/types';

// ============ Toast Store ============
const [toast, setToast] = createSignal<Toast>({
  visible: false,
  message: '',
  type: 'success',
});

let toastTimeout: ReturnType<typeof setTimeout>;

export const showToast = (message: string, type: Toast['type'] = 'success'): void => {
  clearTimeout(toastTimeout);
  setToast({ visible: true, message, type });
  toastTimeout = setTimeout(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, CONFIG.TOAST_DURATION);
};

export const hideToast = (): void => {
  clearTimeout(toastTimeout);
  setToast((prev) => ({ ...prev, visible: false }));
};

// ============ Confirm Modal Store ============
const [confirmModal, setConfirmModal] = createSignal<ConfirmModal>({
  isOpen: false,
  message: '',
  onConfirm: null,
});

export const openConfirm = (message: string, onConfirm: () => Promise<void>): void => {
  setConfirmModal({ isOpen: true, message, onConfirm });
};

export const closeConfirm = (): void => {
  setConfirmModal({ isOpen: false, message: '', onConfirm: null });
};

export const handleConfirm = async (): Promise<void> => {
  const modal = confirmModal();
  if (modal.onConfirm) {
    try {
      await modal.onConfirm();
    } catch (error) {
      console.error('Confirm action error:', error);
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  }
  closeConfirm();
};

// ============ Loading Store ============
const [isLoading, setIsLoading] = createSignal(false);

export const startLoading = (): void => setIsLoading(true);
export const stopLoading = (): void => setIsLoading(false);

export const withLoading = async <T>(fn: () => Promise<T>): Promise<T> => {
  startLoading();
  try {
    return await fn();
  } finally {
    stopLoading();
  }
};

// Export hooks
export const useToast = () => ({ toast, showToast, hideToast });
export const useConfirm = () => ({ confirmModal, openConfirm, closeConfirm, handleConfirm });
export const useLoading = () => ({ isLoading, startLoading, stopLoading, withLoading });

export { toast, confirmModal, isLoading };
