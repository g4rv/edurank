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

**The breadcrumb obeys this too, and did not.** It was `--muted-foreground`
with no underline, which over the wash all but disappeared — and a breadcrumb is
the one piece of chrome somebody looks for when they are lost, so faint is
wrong exactly when it matters (owner, 2026-09-07). It is now ink and underlined
like every other internal link; `--brand` stays on the hover.

**Do not draw something as a link unless following it does something useful.**
`mailto:` and `tel:` are the ones that catch people out: on a department desktop
they open whatever is registered, which is often nothing or the wrong client, so
the reader is left wondering what they just clicked. The email and phone in the
identity band are plain text with a copy button, because pasting them elsewhere
is what anybody actually does with them.

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

## 7. Form controls

**One definition, worn by all of them.** `components/aurora/ui/field-surface.ts`
holds every Tailwind part — sizes, focus ring, invalid state, disabled
behaviour. The surface itself (fill, border, inner shadow) is `.aurora-field` in
`globals.css`, because a light and a dark variant of the same thing must sit
next to each other or they drift. There are fourteen controls; written out at
each of them, the first change to any one lands on some and not others.

**The three states differ in KIND, not in degree.** They have to be readable
from across the room, not measured:

| state    | surface                                                    |
| -------- | ---------------------------------------------------------- |
| enabled  | **lighter** than the page, inner shadow — a hollow to fill |
| focused  | brighter still, plus the brand ring                        |
| disabled | **darker** than the page, flat, muted text                 |

Everything you can act on comes forward off the page; the one thing you cannot
sinks into it.

**Never `opacity-50` for disabled.** It was exactly that, over a border already
at 1.24:1 on white — half of almost nothing is still almost nothing, and a
disabled field beside an active one looked identical. Fading also drags the
field's own text down, so the part somebody might still want to read gets harder
while the state stays unclear.

Current numbers: border `/0.26` at rest (**1.67:1** on the page ground), `/0.38`
on hover (**2.26:1**). Both are below the 3.0 a boundary needs _on its own_ —
acceptable here because the fill and the inner shadow also identify the control,
and a 3:1 hairline on every field turns the page into a 1990s form. If it ever
has to move, it is one number.

### A wrapper is focused when its input is

`TelInput` and `OrcidInput` put the surface on a **div** and the focus on an
input inside it. A div is never `:focus-visible`, so those three
took the brand ring from `fieldSurfaceWrapper()` and none of the brightening —
which is the half you actually notice. `.aurora-field` therefore carries
`:has(:focus-visible)` beside `:focus-visible` on both the focused fill and the
hover exclusion. Any new wrapper control gets it for free; a control that
invents its own surface does not.

### Not everything in a form is a field

`fieldSurface()` is for a control you put a VALUE into. The file picker was
wrapped in it so it would match the text fields beside it, and it came out worse
than the plain button it replaced (owner, 2026-09-07): a 24px button inside a
32px box has three pixels of air above and below, and the box claims to be a
hollow you can type into when the only way in is the button.

A control that runs an ACTION and reports a result is shaped like the toolbar it
sits in, not like the fields around it. What it still owes the system is the
brand focus ring and a monochrome result: the chosen file is a chip on
`bg-foreground/6` — the `secondary` button's own fill — with the × inside it,
so the name reads as an object with edges that the × will remove, rather than as
a caption that happens to sit next to a button.

### A checkbox is the switch's rules on a square

There was no checkbox component at all, so three screens grew their own out of
`<input type="checkbox">`: the two permission grids use `accent-primary`, the
licence-position picker beside them uses `accent-foreground`. `accent-color`
styles the box and nothing else — no focus ring, no invalid state, no disabled
surface — so they could not have matched.

- **Unchecked is `.aurora-field`.** The same fill, border and inner shadow as a
  text field, because it is the same thing: a hollow waiting to be filled. The
  disabled surface comes with it.
- **Checked is the brand**, with `border-brand` to close the hairline the
  surface's own border-colour would otherwise leave around the fill.
- **There is no indeterminate state.** It was drawn first, on the assumption
  that the permission grid has a «some of this division's fields» header — it
  does not, and nothing else here selects a whole group at once. A state nobody
  can reach is one more thing to keep working; Radix supports it the day a
  select-all appears.

### A fixed-shape value draws its mask

`0000-0000-0000-0000` as a placeholder is a lie the field tells once: it looks
like a value already in the box. `____-____-____-____` cannot be mistaken for
one, and it keeps saying what is missing **while you type** — the part still to
come stays on screen behind the caret (`components/aurora/ui/mask-ghost.tsx`).

Three things this depends on, all easy to break:

- **The input and the ghost must be `font-mono` at the same size and box.** The
  typed prefix is re-rendered invisibly so the remainder starts exactly at the
  caret; a proportional font puts the tail a few pixels off at every keystroke.
- **The ghost goes AFTER the input** in the DOM whenever the input carries its
  own fill, or the fill paints over it.
- **The real `placeholder` attribute stays**, hidden with
  `placeholder:text-transparent`. The hint then exists once for a screen reader
  and once on screen, never twice on screen.

**A mask is not always a rule.** ORCID is always four groups of four, so its
mask is the format. An ISBN is only ever «thirteen digits starting 978/979» —
where the hyphens fall depends on the registration group, so a Ukrainian book
splits `978-966-…` where the stock example splits `978-3-…`, and an ISBN-10 has
a different shape again. There the mask is drawn and nothing is enforced: the
field keeps whatever hyphenation the book prints, and the checksum ignores
separators.

## 8. Lists that float over the page

A select and a combobox are the same control to somebody filling a form. The
only real difference is that a combobox lets you type. They share
`components/aurora/ui/listbox.ts`; neither styles its own panel or rows.

- **Rows are full-bleed** — no inset, no rounding. The panel's own corners do the
  clipping. Panel padding leaves a pale sliver above and below a single
  highlighted row, which reads as a rendering fault rather than as breathing
  room, and a list of one is common.
- **The highlight is `bg-brand/10` + `text-brand-strong`**, covering `hover`
  (mouse), `data-highlighted` (Radix's keyboard walk) and `focus`.
- **The chosen row is weight and a tick, no second fill.** A tint there competes
  with the hover tint and the two together say less than either alone. The tick
  sits after the text with `ml-auto`, so showing it moves nothing — not pinned
  absolutely with `pr-8` reserved on every row.
- **Overflow belongs to the caller.** The select scrolls on its panel, the
  combobox on the list inside it; baking either into `listPanel` fights the
  other.

## 9. The calendar

**`locale` defaults to `uk`.** react-day-picker ships `en-US` and does **not**
read the browser's locale, so a calendar with no `locale` prop is hardcoded
English. Every one in the app said «September 2026 / Su Mo Tu» — including the
audit-log filter, which formatted its own button label in Ukrainian and then
opened an English calendar under it. The locale also moves the week start to
Monday. The month caption is capitalised («Вересень 2026»); weekday
abbreviations stay lower case, which is the Ukrainian convention.

**A range is picked by clicks that alternate ends** — start, end, start, end.
Each click writes one end and leaves the other alone: 1 → 1–31 → 22–31 → 22–23.
Two invariants hold on every click, and they are what `lib/forms/date-range.ts`
is tested against:

1. the day clicked becomes an endpoint, always;
2. the other endpoint survives.

An inverted write is **redirected, not sorted afterwards**. Clicking 30 when the
range is 1–11 and the cycle says «start» writes the END instead, giving 1–30.
Writing `{from: 30, to: 11}` and swapping the pair looks equivalent and is not —
it overwrites the start and then hands the start slot to the old end, leaving one
endpoint stuck fast.

Two smaller rules, both about shape:

- **Chosen days are circles** (`rounded-full`), matching the capsule band under
  them. Any tighter radius lets the band's tint show past the pill's corners as a
  square block. The cell is `aspect-square`, so the two meet exactly.
- **The band rounds at each week's edges**, so a range that wraps reads as a row
  of capsules rather than as something running off-screen.

**No hover preview.** It was built and taken out. Mailjet's calendar previews the
pending range and it reads well there, because their band is a solid fill; ours
is a pale tint, and a preview of a tint is a faint thing flickering under the
cursor — motion without a message.

## 10. Things that float over everything

A popover, a select panel and a combobox list are surfaces you point at and act
on, so they are `bg-card` + `shadow-float` — see §8. Three more float, and they
are not all the same.

**A modal is a card that happens to float.** The alert dialog and the sheet take
`bg-card` (not `bg-background`: the page ground is not a surface, and a dialog
painted in it is a hole in the middle of the screen) and `shadow-float` (not
`shadow-lg`: a dialog opens over cards, where a card-weight shadow has nothing
to fall on).

**The scrim is one value, in `components/aurora/ui/overlay.ts`.** It was
`bg-black/50` on the alert dialog and `bg-black/40` on the sheet — nobody chose
that, and nobody can see it either, which is exactly why the next one would pick
a third number. Two tints, light and dark, because a scrim's job is relative:
45% black over a pale page says «out of reach» and the same 45% over an already
dark one barely registers.

**No `backdrop-blur` on the scrim.** It is the obvious glass move and the one
place this design cannot afford it: a scrim covers the whole viewport, so with
GPU acceleration off — which some of our machines have — it becomes a
full-screen CPU blur on every open and close of every confirm dialog.

**A tooltip stays dark, and that is a decision.** The temptation is to make the
one remaining floating thing `bg-card` like the rest. It should not be: those
are surfaces you act on, and a tooltip cannot be clicked at all. A card-coloured
tooltip over a card reads as a panel that failed to load. Inverting it is what
says «annotation, not interface». It takes `rounded-lg` and `shadow-float` so it
still sits at the same height above the page.

**A confirm's action button defaults to `destructive`** and accepts a variant.
Almost every confirm here is a deletion or a discard; closing a rating year is
the exception — irreversible without being destructive.

**The page you are on is the accent.** `--secondary` is a grey barely off the
page ground, so on a row of grey ghost buttons the current page was the hardest
one to find. §3 gives the accent to the active tab and the active nav item, and
a pager is the same fact about the same kind of row.

## 11. Traps that have already caught us

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

**A class built by interpolation does not exist.** Tailwind generates only what
it can SEE, so `` `data-[state=checked]:${listRowSelected}` `` produces nothing.
Spell the variant out literally, even when that means the constant appears twice
— `listbox.ts` keeps `listRowSelected` and `listRowSelectedState` side by side
for exactly this.

**A layout is not a guard and cannot read the pathname.** Layouts do not
re-render on navigation, so `auth()` in one runs once and an `active` tab passed
down from one is frozen on whichever tab was opened first. Each page keeps its
own `auth()`; `StaffTabs` reads the pathname itself.
