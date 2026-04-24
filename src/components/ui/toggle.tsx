import { cn } from '@/utils/cn';
import { InputHTMLAttributes, forwardRef } from 'react';

interface ToggleProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  labelPosition?: 'left' | 'right';
}

const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  (
    { className, children, disabled, labelPosition = 'left', ...props },
    ref
  ) => {
    const label = children && (
      <span className="text-sm text-zinc-600">{children}</span>
    );

    return (
      <label
        className={cn(
          'group inline-flex cursor-pointer items-center gap-2 select-none',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          disabled={disabled}
          className="sr-only"
          {...props}
        />
        {labelPosition === 'left' && label}
        {/* Track */}
        <span className="relative h-6 w-10 shrink-0 rounded-full bg-zinc-200 transition-colors group-has-checked:bg-zinc-900">
          {/* Thumb */}
          <span className="absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow-xs transition-transform group-has-checked:translate-x-4" />
        </span>
        {labelPosition === 'right' && label}
      </label>
    );
  }
);

Toggle.displayName = 'Toggle';

export { Toggle };
