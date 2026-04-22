import { cn } from '@/utils/cn';
import { InputHTMLAttributes, forwardRef } from 'react';

const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>
>(({ className, disabled, ...props }, ref) => {
  return (
    <label
      className={cn(
        'group inline-flex cursor-pointer items-center',
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
      <span className="flex h-4 w-4 items-center justify-center rounded border border-zinc-300 bg-white transition-colors group-has-checked:border-zinc-900 group-has-checked:bg-zinc-900">
        <svg
          className="hidden h-2.5 w-2.5 text-white group-has-checked:block"
          viewBox="0 0 10 8"
          fill="none"
        >
          <path
            d="M1 4L3.5 6.5L9 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </label>
  );
});

Checkbox.displayName = 'Checkbox';

export { Checkbox };
