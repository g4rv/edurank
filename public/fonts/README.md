# Fonts

`roboto-400.ttf` / `roboto-700.ttf` — Roboto, © Google, Apache License 2.0.

They live here, and not in `node_modules`, for two reasons:

- **The PDF export needs a real TTF.** `@react-pdf/renderer` reads font files with
  fontkit, which does not take the `woff2` that `next/font` produces for Geist. Geist's
  Google subset also does not carry Cyrillic, so the app's screen font cannot be reused.
- **`public/` is copied into a standalone build.** A font imported only from
  `node_modules` at runtime is easy to lose when the image is built; this one cannot be.

Roboto covers the whole Ukrainian alphabet — including `і`, `ї`, `є`, `Ґ` and the
apostrophe `’` in «комп’ютерних» — which is why the PDFs render rather than showing
empty boxes.
