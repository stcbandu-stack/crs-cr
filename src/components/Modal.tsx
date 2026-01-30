import { Component, JSX, Show, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: JSX.Element;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const Modal: Component<ModalProps> = (props) => {
  const sizeClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  // Close on escape key
  createEffect(() => {
    if (props.isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          props.onClose();
        }
      };
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';

      onCleanup(() => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      });
    }
  });

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div class="absolute inset-0 bg-black/50 transition-opacity" onClick={props.onClose} />

          {/* Modal Content */}
          <div
            class={`relative bg-white rounded-lg shadow-xl w-full ${sizeClasses[props.size || 'md']} transform transition-all`}
          >
            {/* Header */}
            <Show when={props.title}>
              <div class="flex items-center justify-between p-4 border-b">
                <h3 class="text-lg font-semibold text-gray-900">{props.title}</h3>
                <button
                  onClick={props.onClose}
                  class="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
            </Show>

            {/* Body */}
            <div class="p-4">{props.children}</div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default Modal;
