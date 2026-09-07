# «Аврора» — the design rules

The visual system for EduRank. **Follow this rather than deciding per screen.**
Every rule below was paid for once already, mostly on 2026-09-04, when the same
tab bar was redrawn four times because nothing was written down.

If a rule produces something odd or unpleasant on a real screen, **change the
rule here** and then change the code. What must not happen is a screen quietly
doing its own thing.

---

## 1. Surfaces

There are exactly four. Nothing else is invented per screen.

| Surface    | What                                         | Where                                  |
| ---------- | -------------------------------------------- | -------------------------------------- |
| **Ground** | `--background` + `<AuroraWash />`            | The page. Never white, never plain.    |
| **Card**   | `bg-card` + `border` + `shadow-card`         | Everything that holds content.         |
| **Glass**  | `.glass` — translucent **and blurred**       | A small panel floating over the wash.  |
| **Chrome** | `.glass-chrome` — translucent, **unblurred** | The sidebar, and full-bleed furniture. |

### The separation rule

**On a light page, a surface separates by getting LIGHTER and taking a border.
Never by getting darker.**

This is the one that cost the most. Three wrong attempts at a tab bar:

- `bg-muted/70` — measured **1.01:1** against the page. `--muted` is
  `rgb(245,245,245)` and the ground is `rgb(246,247,250)`: the same colour.
  **`--muted` cannot be used to separate anything.**
- `bg-foreground/7` — separated, but a black tint on a white page is grey by
  definition. That is the shadcn-default look this design exists to escape.
- `bg-brand/8` — carried hue, but was a one-off treatment invented for one
  control.

The answer was `bg-card`: the same white surface every other element already
uses. **When something needs to stand out, make it a card.**

### `--card` stays solid

`bg-card` is used ~113 times and 23 of those are data tables. Glass is **opt-in**
and never the default: a translucent table is unreadable, and 113
`backdrop-filter` layers is a broken machine.

---

## 2. Elevation

| Token               | Use                                      |
| ------------------- | ---------------------------------------- |
| none                | Anything nested **inside** a card.       |
| `shadow-xs`         | Controls — buttons, the tab bar, fields. |
| `shadow-card`       | Cards.                                   |
| `shadow-card-hover` | A card that is a link.                   |

Every shadow is **two layers** — a tight contact shadow plus a wide ambient one.
Аврора's own words: «tight and wide at once». One flat shadow reads as a sticker.

Shadows are tinted toward the ink (`oklch(… 0.02 265)`), never pure black, so
they sit on a coloured wash without going muddy.

---

## 3. Colour

**Chrome and data are neutral. Colour means something.**

| Colour              | Means                                                                            |
| ------------------- | -------------------------------------------------------------------------------- |
| `--brand` (#4472C4) | The primary action · the active tab or nav item · a link · **one** accent figure |
| amber               | Pending / needs attention — **badges only**, never chrome                        |
| `--destructive`     | Destructive or error — nothing else                                              |
| `--chart-*`         | Charts, and only charts                                                          |

### Brand text on a brand tint

`--brand` on `bg-brand/10` measures **4.24:1** — under AA — because the tint
lifts the background toward the text. Use **`--brand-strong`** there (6.76:1):
the НПП badge, a tab's hover state, anything where the accent sits on its own
wash. On a plain card `--brand` reads 4.8 and is correct as it is.

Dark mode needs no deepening, so `--brand-strong` equals `--brand` there — the
brand is the light half of the pair, and a tint darkens its background instead
of lifting it.

### Links come in two colours, and the split is deliberate

| Link                                                     | Colour                |
| -------------------------------------------------------- | --------------------- |
| **Inside the app** — a факультет, a кафедра, a відділ    | ink, underlined       |
| **Leaving the app** — Scopus, WoS, Google Scholar, ORCID | `--brand`, underlined |

Colouring the internal ones blue was tried and «ruins the mood» (owner,
2026-09-07): a card of five blue phrases reads as a link farm, and inside a
Ukrainian record most of the proper nouns ARE navigable, so blue would be
everywhere and mean nothing. The underline already says «this is a link»; the
colour is then free to say **where it takes you**, which is the more useful
distinction and the one a reader actually acts on.

Blue therefore means «this leaves EduRank». Keep it that way.

### Contrast targets

**AA is the bar: 4.5 for text, 3.0 for icons and UI boundaries.** AAA (7:1) is
not the target and failing it is not a finding.

Measure by compositing the alpha yourself — browser contrast inspectors report
nonsense for a semi-transparent background, comparing the text against the raw
`rgba()` rather than against what is painted. A reading of ~1.0 under a tinted
element is that bug, not a real result.

**Tint with `--brand`, not with `--foreground`.** A foreground tint on a light
page is grey, and grey chrome is the look we are getting away from. If a neutral
really is wanted, use a card.

The gold in the logo (`#f5c518`) is the university crest's second colour. It is
brand, not status, and appears in the mark only.

---

## 4. Type

**Manrope**, everywhere. Geist is gone — it has **no Cyrillic glyphs at all**, so
every Ukrainian word in the app was falling back to a system font.

| Role          | Size                                                 |
| ------------- | ---------------------------------------------------- |
| Page title    | `text-2xl font-semibold tracking-[-0.01em]`          |
| Card title    | `text-sm font-semibold uppercase tracking-wide`      |
| Body / values | `text-sm`                                            |
| Labels, meta  | `text-xs text-muted-foreground`                      |
| Micro-label   | `text-[11px] font-semibold uppercase tracking-wider` |

The app is built almost entirely at 12–14px (514 uses of `text-xs`/`text-sm`
against 19 above). A **modest** step up is right; doubling everything is not —
that was tried, and rejected as «soooo ugly». See
`docs/work-remaining.md` on who these users are.

---

## 5. Empty values

**A blank field is not rendered.** What is missing is collected and named once,
at the foot of the page, with an action — see `lib/staff/profile-completeness.ts`.

A column of «—» is the same information in the form least likely to make anybody
do anything about it, and the project's real risk is that ~200 НПП never fill
anything in.

The exception is a **zero that is a fact**: a rating section scoring 0 keeps its
row, because that gap is the point.

---

## 6. Motion

- **Animate `transform` and `opacity` only.**
- **Never `scale()` on a layer carrying a filter** — it re-rasterises the blur
  every frame. Translate composites; scale does not.
- **Never change `filter` on hover inside a `backdrop-filter` panel** — it
  repaints the panel's whole backdrop. Fade an `::after` overlay instead.
- **Never blur a radial gradient.** A gradient fading to transparent is already
  soft; use `ellipse closest-side` and let the falloff do it.
- Theme changes go through `startViewTransition`, which cross-fades the rendered
  frame. Per-property transitions **do not work** for this: `color` arrives
  through a custom property on `:root` and is inherited, so icons snap while
  backgrounds fade.
- Everything above stops under `prefers-reduced-motion`.

**Assume no GPU.** Hardware acceleration is off on more machines than you would
think — see `docs/work-remaining.md`. `backdrop-filter` is affordable on one
small panel and ruinous on a full-height sidebar.

---

## 7. Traps that have already caught us

**Tailwind only generates classes that appear in a source file.** Probing with a
hand-typed class name proves nothing — `bg-foreground/4` is transparent unless
something writes exactly that string. Test the real component.

**Hand-written CSS in `globals.css` must be inside `@layer components`.** A bare
top-level `@media` block is silently dropped from the build. It compiles, it
stays in the file, and it is simply absent from the served stylesheet.

**Measure colour through a canvas, not a regex.** `getComputedStyle().color`
serialises to `lab()`/`oklab()` in current Chrome, so scraping numbers out of it
yields lab components pretending to be RGB. Fill a 1×1 canvas, read
`getImageData`, and sanity-check that `#ffffff` comes back as `255,255,255`.

**A component never decides a permission.** It is handed `showStake`; it does not
work out who may see a ставка. A component has no session, and a permission
written in two places will eventually disagree.
