import { Toaster } from '@/components/ui/sonner';
import { AuroraWash } from '@/components/ui/aurora-wash';

/**
 * The signed-out shell — login, «забули пароль», activation.
 *
 * First place «Аврора» lands, and deliberately so: these are three small,
 * self-contained pages with one card each, which is exactly the composition the
 * concept was drawn for. They are also the first thing all ~200 НПП will ever
 * see of the system, so they are worth more than their line count suggests.
 *
 * The wash was previously `bg-muted/30`.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <AuroraWash />
      {children}
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
