import { Component, JSX } from 'solid-js';
import { cn } from '@/lib/utils';

interface CardProps {
  title?: string;
  icon?: string;
  description?: string;
  borderColor?: string;
  onClick?: () => void;
  class?: string;
  children?: JSX.Element;
}

const Card: Component<CardProps> = (props) => {
  return (
    <div
      class={cn(
        'bg-white p-6 rounded shadow hover:shadow-lg transition-shadow cursor-pointer',
        props.borderColor && `border-l-4 ${props.borderColor}`,
        props.class
      )}
      onClick={props.onClick}
    >
      {props.title && (
        <h3 class="text-xl font-bold flex items-center gap-2">
          {props.icon && <span>{props.icon}</span>}
          {props.title}
        </h3>
      )}
      {props.description && <p class="text-gray-500 mt-1">{props.description}</p>}
      {props.children}
    </div>
  );
};

export default Card;
