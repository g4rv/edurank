import { readFileSync } from 'fs';
import path from 'path';
import { ImageResponse } from 'next/og';

/**
 * The browser-tab icon, generated rather than served as a file.
 *
 * A static `app/icon.png` would be one image everywhere, and the whole point
 * here is that it is NOT: a tab open on production and a tab open on `pnpm dev`
 * have to be told apart at a glance, because they look identical otherwise and
 * the wrong one is where a mistake gets made.
 *
 * Production gets the university's logo. Development gets a flat amber tile
 * with a «D» — deliberately not the logo, because at 16px a badge or a tint on
 * a detailed mark is invisible in a crowded tab strip, and a different colour
 * is not.
 *
 * Amber for the same reason it means «pending» everywhere else in the app: this
 * is the state that wants your attention, not an error.
 *
 * Next generates this at build time (no request-time API is used), so the
 * branch is decided once per build — `next build` runs with NODE_ENV set to
 * production, `next dev` with development. Nothing decides it at runtime.
 */

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

export default function Icon() {
  if (process.env.NODE_ENV === 'production') {
    // Inlined as a data URI: Satori resolves no relative URLs, and there is no
    // origin to fetch from while the icon is being generated at build time.
    const logo = readFileSync(path.join(PUBLIC_DIR, 'logo.png')).toString('base64');

    return new ImageResponse(
      // Satori's <img>, not the DOM's — `next/image` has nothing to optimise
      // in a 32px PNG that is rendered once at build time and never requested
      // by a browser.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`data:image/png;base64,${logo}`} width={size.width} height={size.height} alt="" />,
      { ...size }
    );
  }

  // Roboto rather than Geist: Satori needs a real TTF, and `next/font` produces
  // woff2. The same file the PDF export already depends on — see
  // `public/fonts/README.md`.
  const roboto = readFileSync(path.join(PUBLIC_DIR, 'fonts', 'roboto-700.ttf'));

  return new ImageResponse(
    // `display: flex` is not decoration — Satori refuses a <div> holding text
    // without an explicit display.
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: '#f59e0b',
        color: '#1c1917',
        fontFamily: 'Roboto',
        fontSize: 26,
        fontWeight: 700,
      }}
    >
      D
    </div>,
    {
      ...size,
      fonts: [{ name: 'Roboto', data: roboto, weight: 700, style: 'normal' }],
    }
  );
}
