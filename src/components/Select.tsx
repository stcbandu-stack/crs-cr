import { Component, JSX, For } from 'solid-js';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends JSX.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
}

const Select: Component<SelectProps> = (props) => {
  return (
    <div class="w-full">
      {props.label && (
        <label class="block text-sm font-bold mb-1">{props.label}</label>
      )}
      <select
        {...props}
        class={`w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white ${
          props.class || ''
        }`}
      >
        {props.placeholder && <option value="">{props.placeholder}</option>}
        <For each={props.options}>
          {(option) => (
            <option value={option.value}>{option.label}</option>
          )}
        </For>
      </select>
    </div>
  );
};

export default Select;
