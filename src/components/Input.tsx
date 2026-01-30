import { Component, JSX } from 'solid-js';

interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input: Component<InputProps> = (props) => {
  return (
    <div class="w-full">
      {props.label && (
        <label class="block text-sm font-bold mb-1">{props.label}</label>
      )}
      <input
        {...props}
        class={`w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-300 ${
          props.error ? 'border-red-500' : 'border-gray-300'
        } ${props.class || ''}`}
      />
      {props.error && (
        <p class="text-red-500 text-xs mt-1">{props.error}</p>
      )}
    </div>
  );
};

export default Input;
