import type { Metadata } from 'next';
import { Manrope, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

/**
 * «Аврора»'s interface face — and a correctness fix, not only a visual one.
 *
 * This was `Geist({ subsets: ['latin'] })`. Geist has **no Cyrillic glyphs at
 * all**, so every Ukrainian word in the app — which is all of them — has been
 * falling back to whatever sans the operating system picked. That is why the
 * app looked slightly different on every machine, and why nothing about its
 * typography ever read as deliberate.
 *
 * Manrope carries Cyrillic, so `subsets` names it: without that the glyphs are
 * fetched but the subset is never requested and the fallback stays.
 */
const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin', 'cyrillic'],
});

// Mono is only used for figures and code-ish strings, where Latin and digits
// are the whole job, so Geist Mono stays.
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'EduRank',
  description: 'Система управління науково-педагогічним персоналом університету',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // next-themes writes the theme class onto <html> before paint, so the
    // server markup and the first client render differ by design.
    <html
      lang="uk"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {/* Light unless the reader has chosen otherwise. The operating system's
            preference is deliberately ignored: the dark palette has had far less
            use than the light one, so a visitor whose laptop happens to be in
            dark mode should not meet the app in its less-tested skin. The toggle
            still works and its choice persists — this only changes the default
            for someone who has never pressed it. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          // NOT `disableTransitionOnChange`: that prop exists to inject
          // `transition: none` across the document during a switch, which is
          // precisely what made the theme snap. `ThemeToggle` opens a short
          // transition window of its own instead — see `.theme-transition`.
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
