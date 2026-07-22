'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

// next-themes needs a client boundary; the root layout stays a server component.
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
