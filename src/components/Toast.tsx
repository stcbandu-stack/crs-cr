import { Component, Show } from 'solid-js';
import { toast } from '@/store/ui';
import { cn } from '@/lib/utils';

const Toast: Component = () => {
  const toastValue = toast;

  const typeStyles: Record<string, string> = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
  };

  return (
    <Show when={toastValue().visible}>
      <div
        class={cn(
          'fixed top-4 left-1/2 transform -translate-x-1/2 z-50',
          'px-6 py-3 rounded-lg shadow-lg text-white font-medium',
          'animate-bounce-in',
          typeStyles[toastValue().type]
        )}
      >
        {toastValue().message}
      </div>
    </Show>
  );
};

export default Toast;
