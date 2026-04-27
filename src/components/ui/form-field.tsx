import { cn } from '@/utils/cn';

interface Props {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  required,
  error,
  className,
  children,
}: Props) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="text-sm font-medium text-zinc-700">
        {label}
        {required && ' *'}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
