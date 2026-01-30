import { Component, Show } from 'solid-js';
import { confirmModal, closeConfirm, handleConfirm } from '@/store/ui';
import { isLoading } from '@/store/ui';
import Modal from './Modal';
import Button from './Button';

const ConfirmModal: Component = () => {
  const modal = confirmModal;
  const loading = isLoading;

  return (
    <Modal isOpen={modal().isOpen} onClose={closeConfirm} title="ยืนยัน" size="sm">
      <div class="space-y-4">
        <p class="text-gray-700">{modal().message}</p>

        <div class="flex justify-end gap-2">
          <Button variant="secondary" onClick={closeConfirm}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={handleConfirm} isLoading={loading()}>
            ยืนยัน
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmModal;
