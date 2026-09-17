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

| Surface    | What                                         | Where                                   |
| ---------- | -------------------------------------------- | --------------------------------------- |
| **Ground** | `--background` + `<AuroraWash />`            | The page. Never white, never plain.[^1] |
| **Card**   | `bg-card` + `border` + `shadow-card`         | Everything that holds content.          |
| **Glass**  | `.glass` — translucent **and blurred**       | A small panel floating over the wash.   |
| **Chrome** | `.glass-chrome` — translucent, **unblurred** | The sidebar, and full-bleed furniture.  |

[^1]:
    **In light mode.** Dark mode dims the wash almost to nothing — the blooms
    are under a `dark:opacity-80` layer of near-black — and it stays that way
    (owner, 2026-09-09): «it stays minimalistic and serves night mode with less
    visual obstacles». So dark is a quiet utility theme, not «Кристал», and a
    flat dark ground there is the decision rather than an oversight. Worth
    re-opening only if somebody starts working in it all day.

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
| `--warning`         | Pending / needs attention — **badges only**, never chrome                        |
| `--success`         | Done, agreed, verified                                                           |
| `--error`           | Destructive or error — nothing else                                              |
| `--chart-*`         | Charts, and only charts                                                          |

**Every colour in the app is a token. There are no Tailwind palette classes.**
`/admin/style-guide` renders the whole set, painted from the live custom
properties, with each value and its measured contrast beside it.

### One hue, and chroma says what a colour is for

Everything that is not a status sits on hue **264**, the university's #4472C4.
Lightness gives the ramp — ink `0.145`, soft `0.42`, muted `0.52`, border `0.87`, surface
`0.97`, card `1.0` — and chroma gives the ROLE:

| chroma      | role                                                     |
| ----------- | -------------------------------------------------------- |
| 0.00 – 0.02 | chrome: text, borders, fills you read past               |
| 0.13        | accent: the brand, the one thing you are meant to notice |

The neutrals were chroma **0** until 2026-09-11 — flat grey, a different family
from the blue bolted on beside it, which is why a subtitle read as belonging to
some other application. They now carry 0.02 at the widest point of the ramp,
tapering to nothing at both ends because near-black and near-white cannot show
chroma anyway.

**The tint costs no contrast.** OKLCH lightness is perceptual, so adding chroma
at a fixed L barely moves a ratio: `--muted-foreground` measured 4.74 on a card
at chroma 0 and measures 4.76 at 0.02. That is what makes this safe to do across
the whole ramp at once rather than one token at a time.

Two things stay pure, deliberately:

- **`--card` and `--popover` are `oklch(1 0 0)`.** §1 says a surface separates by
  getting LIGHTER than the page; the card is the lightest thing on screen and
  tinting it takes that away.
- **Status hues leave 264**, because their whole job is to not belong to the
  brand.

### A status is a PAIR, and two of them need a `-strong`

Each status is `--x` for the text and `--x-surface` for the tint it sits on.
Before these existed there were **160 hardcoded Tailwind classes** doing the
job: «ok» was written eight ways (`green-600`, `green-500`, `green-700`,
`green-400`, `emerald-700`, `emerald-600`, `emerald-500`, `emerald-400` — green
and emerald are not even the same hue) and «pending» twelve. No call site was
wrong on its own; there was simply nothing to point at.

**`--brand` and `--error` each need a `-strong` twin, for one measured reason: a
tint LIFTS the background toward the text.** On its own surface `--brand`
measures 4.24 and `--error` 3.98, both under AA; `--brand-strong` and
`--error-strong` read 6.76 and 5.15 there. `--success` and `--warning` are dark
enough already (4.55 and 4.87) and have no twin.

So: **red text on a red tint is `text-error-strong`, never `text-error`.** That
was wrong in eighteen places before the tokens existed, as `text-destructive` on
`bg-destructive/10`.

In dark mode there is no `-strong` anywhere: a tint on a dark ground darkens the
background instead of lifting it, so the pair never loses contrast.
`--error-strong` is aliased to `--error` there, and call sites need no `dark:`
variant for any status.

### Token names say what a colour is FOR, never where it sits in a ramp

Two alternatives were weighed on 2026-09-11 and both refused (owner):

- **`primary` / `secondary` / `accent` / `neutral`**, the daisyUI and Bootstrap
  convention. It survives only because a general-purpose library cannot know an
  application's semantics. In daisyUI's own default theme `primary` is grey,
  `secondary` is cyan and `accent` is purple — none of which is predictable from
  the name. An application knows what its colours mean and should say so.
- **Ordered ramps** — `--surface-1/2/3`, `--text-1/2/3`, as Radix does. Better
  than the first, because at least the order is legible. Refused for the same
  reason in the end: a number tells you a position, not a purpose. «Is this the
  right grey for a label» is not answered by `--text-3`.

So the names stay descriptive — `--muted-foreground`, `--card`, `--brand`,
`--success` — even where that means keeping a shadcn name we did not choose.

One idea from daisyUI **is** worth copying if the chance comes: every colour that
can be a background gets exactly one partner for text on it, with no exceptions.
We follow that for `--brand` and not for `--success` or
`--warning`, which is an inconsistency rather than a decision.

### Three text strengths, not two

| token                | on a card | worn by                                    |
| -------------------- | --------- | ------------------------------------------ |
| `--foreground`       | 19.8      | body, values, names                        |
| `--foreground-soft`  | 8.49      | labels, column headings, secondary values  |
| `--muted-foreground` | 5.51      | meta, counts, hints — glanced at, not read |

Until 2026-09-11 the middle one did not exist and muted sat at 4.76, so
everything that was not body text had **one** place to go and it was the
faintest thing on the page: a column heading, a field label and a row count all
landed on the same grey, and labels people needed to READ were as quiet as the
meta they were meant to skip.

`--muted-foreground` moved in the same change. Adding a tier above it settles
what labels should use; it does nothing for the meta that stays, which was the
other half of the complaint.

Below these sit `--placeholder` (4.50) and `--mask-ghost` (2.12), which are not
text strengths at all — they say «nothing here yet», and §7 keeps them separate
for that reason.

In dark mode the ramp is 17.18 / 9.60 / 6.91 and **`--muted-foreground` does not
move**: lifting it there would squeeze it against the new tier, and the dark
ramp is already the tighter of the two.

### Two tokens that were renamed or removed, and why

**`--destructive` became `--error`** so the three statuses read as one set. The
shadcn button VARIANT is still called `destructive`, and that is correct — the
variant describes what the action does, the token describes the colour it is
painted in.

**`--primary` is gone.** It was shadcn's name for «the default button's fill»,
which here was near-black — so the app had a `--primary` that was not the brand
and a `--brand` that was not primary, and a name meaning «the important one»
sitting on a colour nobody chose for importance. With no `--secondary` or
`--tertiary` worth the name beside it, the ladder said nothing.

Its 52 call sites split cleanly, and **the split is the interesting part: almost
all of them meant the accent and were rendering grey.** Links written
`text-primary underline`, selected rows, and «this counts» badges like
`APPROVED: bg-primary/10 text-primary`. `rating-table.tsx` had already noticed —
«`bg-primary/10` was a GREY tint, which §3 rules out» — and `orcid-field.tsx`
records fixing one instance by hand. All of them are `--brand` now, including
the legacy `Button`'s `default` variant, which is the one site that genuinely
was «the primary action». That makes it match «Аврора»'s own button, which has
been the brand from the start, so the two sets stop disagreeing while the
migration finishes.

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

**Every crumb is ink, and only the links are underlined** (owner, 2026-09-10).
The fix above reached the linked crumbs and left the ancestors that are NOT
pages — «Особисте», «Управління», the sidebar groups — at `--muted-foreground`,
so a trail like «Особисте › Мої здобувачі» still opened with the faintest word
on it. They are ink now too.

That makes the underline the only thing separating a crumb you can follow from
one you cannot, which is the split this section already asks it to carry: the
underline says «this is a link», the colour says where it goes. A group with no
route of its own gets neither, and is no longer disguised as faint chrome
either.

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

| Role          | Size and colour                                 |
| ------------- | ----------------------------------------------- |
| Page title    | `text-2xl font-semibold tracking-[-0.01em]`     |
| Page subtitle | `text-sm text-foreground-soft` — prose          |
| Card title    | `text-sm font-semibold uppercase tracking-wide` |
| Body / values | `text-sm` — full ink, the default               |
| Field label   | `text-sm font-medium` — ink, like its value     |
| Meta, counts  | `text-xs text-muted-foreground`                 |
| Micro-label   | ~~`text-[11px]`~~ — retired, see below          |

### `--foreground-soft` is for PROSE, and for nothing else

**Ink is the default. It needs no class.** Headings, labels, values, names,
figures, column headings and table cells are all ink, because every one of them
either names a thing or IS the thing.

`text-foreground-soft` is applied deliberately, and only to writing that
**explains**: a page's description under its title, a form's instruction, a
footnote about how something works. On «Мої залучені здобувачі» that is exactly
three paragraphs, and everything else on the screen is ink.

The test: **would removing this sentence lose any data?** If no, it is prose and
it recedes. If yes — a label, a count, a cell — it is ink.

Two wrong versions were built first, on 2026-09-11, and both are worth
recording because each sounded right:

- **Labels soft, values ink.** The argument was that the eye should land on the
  answers while the questions recede. On a real form it read as a half-finished
  screen: a label names its field and belongs with it, and greying every label
  made the form look disabled.
- **Everything soft except headings**, set as the `body` default. That took
  «not a heading» to mean «not important», and softened the entire claims table
  — names, programmes, ставки. A table of real data came out switched off while
  the sentence above it kept full weight. What recedes is not
  everything-that-is-not-a-heading; it is the explaining.

`--muted-foreground` stays below both, for meta: counts, row numbers, hints —
things glanced at rather than read.

**An intention that lives only in a comment is not expressed.** `TableHead`
carried a note saying a column heading «earns full contrast» and set no colour
at all, inheriting the body's ink. The moment the default was flipped, every
column heading in the app lost that contrast silently. It writes out
`text-foreground` now.

The scale is **Tailwind's default, unmodified**: 12 · 14 · 16 · 18 · 20 · 24.
Nothing is redefined in `@theme`, and there is no per-page override anywhere.

The **11px micro-label is retired** — a hardcoded arbitrary size cannot follow a
scale, and two call sites (the sidebar's group headings, `bonus-cell`) were
quietly below any floor the theme set. Both are `text-xs` now.

### The bigger scale was built, tried and abandoned (owner, 2026-09-11)

НПП said they could not read the screen. Between 2026-09-10 and 2026-09-11 the
answer was a larger scale — first as `.type-comfortable` on one page, then
briefly app-wide at 14 · 16 · 18 · 20 · 24 · 28. **Both are gone.** Do not
rebuild either without reading what follows.

**Browser zoom is the answer to «I cannot read this», not the type scale.**
Ctrl+= scales the whole page — type, controls, spacing, images — in the
proportions the design was drawn in, it is per-reader, it persists per-site, and
it costs nothing to anybody who does not need it. A larger built-in scale
charges every user density so that some users can read, and it still cannot go
far enough for somebody who genuinely needs 150%. The operating system's own
display scaling does the same job one level up. These users are ~200 НПП aged
25–60, mostly 40–50, and iPhone users — see `docs/work-remaining.md`. This is
not an impaired cohort, and designing as though it were made the app worse for
all of them.

Three things the attempt established, worth keeping so the next person does not
re-derive them:

**1. Move every tier or none.** The first trial raised only the bottom two —
12→14 and 14→16 — and left the four above alone. `text-sm` and `text-base` came
out the same size, `text-lg` landed 2px above the body, and the page title fell
from 24/14 = 1.71 of the body to 24/16 = **1.50**, so a heading barely led the
text under it. A scale is relative: you cannot raise the floor and keep the
ceiling. The owner's word for the result was «unproportional», and it was
measurably so.

**2. There is no half-step.** Every design metric here is an **even** number —
sizes come off 2 · 4 · 8 · 12 · 14 · 16 · 18 · 20 · 24 · 28 · 32 · 36 · 42 · 48,
never 13, 15, 17 or 23. So the body is 14 or it is 16; 15 does not exist. That
is what makes a partial retreat incoherent and the choice binary.

**3. It does not fix scrolling, which is what people actually notice.** Measured
across every list screen, the larger scale added 10–25% to page height and
**moved not one page from fitting to scrolling**. `/rating` scrolled 16730px
before it and 21348px after; `/admin/invites` 13436 → 17356. Those pages are
long because they put a whole list on the page instead of in a height-bounded
card — see the `fill` pattern on `/staff` and `/admin/students`, which fit at
every viewport under both scales. Type was never the cause.

### Never go below `text-sm` inside a field

iOS Safari zooms the page when a focused input is under 16px. That is what
shadcn's `text-base md:text-sm` on every control is for — 16px on a phone,
14px on the desktop. It looks like an inversion and is not: it is the smallest
size that avoids the zoom on the device that enforces it. Leave it alone.

---

## 5. Empty values

**Every field is rendered, and a blank one shows «—»** (owner, 2026-09-09,
reversing the rule below).

The original rule was the opposite — hide a blank row, and collect what is
missing into one note at the foot of the page with an action. The argument was
that a column of «—» is the same information in the form least likely to make
anybody do anything about it, and the project's real risk is that ~200 НПП never
fill anything in.

**What that missed is that a card is a shape, not a list.** «Академічна
інформація» has six fields. On a full record it is three tidy rows of two; on a
sparse one it collapsed to a single row and the card read as broken rather than
as empty — and no two people's cards were the same shape, so the eye had to
re-learn the layout on every record. Hiding the row also hid the LABEL, so a
reader could not tell «this person has no ORCID» from «this app does not track
ORCID».

A dash says the field exists and is empty, which is the thing worth knowing —
and once every row is on screen it is the ONLY thing needed. The note went with
the old rule (owner, 2026-09-10): «Не заповнено: Телефон · WoS профіль» named,
in a panel at the foot, exactly the rows the cards were already showing as «—».
Two statements of one fact, and the second one arrived after the reader had
scrolled past the first. `missing-fields.tsx` and `lib/staff/profile-completeness.ts`
are gone with it.

What that costs, recorded so it is a decision and not an oversight: the note's
second line, «Заповнює кадровий відділ: Науковий ступінь · …», said something no
card says — that those particular blanks are not yours to fix. The cards show
every blank alike. If people start asking why «Науковий ступінь» has no field on
their edit form, the answer belongs on the FORM, next to what is missing, not in
a panel on the page before it.

Two exceptions.

**A zero that is a fact**: a rating section scoring 0 keeps its row, because
that gap is the point.

**A field that records a POST somebody holds** — «Керівні посади» is the whole
card: адміністративна посада, завідувач кафедри, декан факультету. A dash works
for a field everybody has some value for; it does not work for one almost nobody
has. Of ~300 people there are 31 завідувачі and 8 деканів, so «Декан факультету
—» would sit on nearly every profile in the app, and it does not read as «not a
декан» — it reads as a record somebody forgot to finish. An unheld post is
absent, and somebody holding none has no card at all (owner, 2026-09-09).

The test between the two: **would a reader expect a value here?** If yes, a
blank is missing data and says so with «—». If no, a blank is simply the normal
case and belongs off the screen.

---

## 6. Motion

**Nothing animates on arrival** (owner, 2026-09-09). There is no entrance
animation anywhere: no page slide-up, no staggered table rows, no list items
easing in. `motion` is not a dependency any more.

What went, and why it is not coming back:

| was                 | did                                     |
| ------------------- | --------------------------------------- |
| `AnimatedPage`      | slid every one of 35 pages up 10px      |
| `AnimatedTableBody` | staggered the rows of nine tables       |
| `AnimatedRow`       | slid each row in from the left          |
| `AnimatedList`      | the same, for the field-permission list |

The cost is paid on every navigation and the benefit is paid once, on the
first: after a week nobody sees a flourish, they see the delay before their
data. A staggered table is worse still — the rows a reader wants are the ones
that arrive last, and `staggerContainerFor` existed purely to stop a 200-row
list still revealing itself seconds after the reader had scrolled past it. When
a component's job is to keep its own effect from being intolerable, the effect
is the problem.

Three kinds of motion **stay**, because each answers something the reader did:

- **A spinner on a button that is working** — the one case where motion is the
  message. Same for a skeleton's pulse.
- **Dialogs, sheets, popovers, selects and tooltips** opening and closing
  (`animate-in` / `animate-out`). These are a direct answer to a click, and
  something that snaps into existence over the page reads as a fault.
- **The wash's drift**, which is ambient and belongs to no element.

The rules below govern those, and anything added later.

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

A masked field keeps saying what is missing **while you type** — the part still
to come stays on screen behind the caret
(`components/aurora/ui/mask-ghost.tsx`).

**Every mask is drawn in zeros, not underscores** (owner, 2026-09-08).
Underscores were tried first, on the argument that `0000-0000-0000-0000` looks
like a value already in the box while `____-____-____-____` cannot be mistaken
for one. That much is true and it is still the wrong trade: a row of underscores
reads as damage. The ghost's own muted colour is what says «not yet typed» — the
character never had to.

**All three changed together** — phone, ORCID, ISBN. Converting one leaves the
others as the odd fields out on a form, which is the problem being fixed rather
than a smaller version of it.

**A mask ghost is not a placeholder, and they do not share a colour.** The two
were briefly merged into `--placeholder` on the grounds that both are «the
hint». What that misses is _where each one is read_:

| token           | on a card | worn by                                     |
| --------------- | --------- | ------------------------------------------- |
| `--mask-ghost`  | 2.12:1    | the unfilled tail behind a caret, only      |
| `--placeholder` | 4.48:1    | `::placeholder`, and a Radix select trigger |

A mask sits inside a field whose fill, border and inner shadow already say the
control is live, with the value being typed directly on top of it. **A select
trigger has neither** — no caret, no typed text, so its placeholder is the
_entire_ content of the control. At the ghost's 2.07 a row of unchosen filters
on `/staff` and `/rating` read as **disabled**, which is the one thing §7 spends
its length making a different state. «Nothing chosen yet» and «you may not touch
this» must not look alike.

The column says **on a card**, and that matters: a filter bar sits on the page
ground instead, where `--placeholder` measures 4.18. It is not raised to cover
that, because doing so would take it past `--muted-foreground` (0.556) and a
placeholder darker than the muted text beside it is a worse fault than the one
being fixed. The whole neutral ramp is tuned to the card — `--muted-foreground`
itself is only 4.43 on the ground — so this is a property of the palette, not of
this token. If it is ever worth fixing it is one change to the ramp, not five
patches at the call sites.

**The phone only looked like it had one.** Until 2026-09-09 `TelInput` set a
native `placeholder` and drew no ghost at all, so its mask vanished at the first
keystroke while ORCID's stayed. Nobody saw it, because the two colours happened
to match — and the moment `--mask-ghost` split from `--placeholder` the phone's
mask came out visibly darker than ORCID's beside it, which is how it surfaced.
**A shared colour is not evidence of a shared implementation**; if a field's
mask does not survive typing, it does not have a `MaskGhost`.

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
- **The panel is its trigger's width, and a long row WRAPS.** A menu that sizes
  to its widest row leaves the screen: п.3.12 opened a 1083px panel from a 463px
  trigger, which on a phone ran 693px past the edge with no way to scroll to it.
  Truncating instead of wrapping is refused — п.3.7 is two indicators whose
  labels differ only in their last words, and one clamped line made them the
  same row.
- **A floating list shows its scrollbar.** Both controls wear it, because a bar
  is the only thing that says how long the list is and where in it you stand.

  It is no longer a special skin: since 2026-09-17 **every scrollbar in the app
  wears it**, set on `:root` with `scrollbar-width` and `scrollbar-color`, which
  inherit. The class `.slim-scrollbar` survives only as the escape hatch for the
  trap below.

  Two traps live here, and both cost an afternoon. Radix Select **hides** the
  scrollbar at runtime — it injects `[data-radix-select-viewport]` rules setting
  `scrollbar-width: none` — because its own design replaces the bar with
  up/down arrow buttons. And those buttons are **flow siblings of the scroll
  area**, so each time Radix mounted one the viewport lost 24px and its top
  moved down by the same, which is a list that jumps under the cursor mid-scroll.

  So: no arrow buttons (the combobox never had them, and §8 says the two are one
  control), and the bar is switched back on. Switching it back needs
  `!important`, and not out of laziness — the rule sits in `@layer components`,
  a layered normal declaration loses to an unlayered one whatever its
  specificity, and Radix's injected rule is unlayered. For important
  declarations that order reverses.

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

## 11. Where a shared component lives

**A shared component lands with its first two callers, in the same commit.**

`Card` was written on 2026-09-07 in `components/aurora/ui/card.tsx`, with this
in its own docstring:

> Nothing has been migrated onto this yet — it is here so the swap, when it
> happens, is one import per file rather than one decision per file.

Two commits later the same day I rebuilt the profile and wrote **`InfoCard`**, a
second card. Two commits after that I rebuilt the staff form and kept
**`SectionCard`**, a third. Three cards, one day, and `Card` still had no users.
The wrapper was identical in all three; the differences were `items-baseline`
against `items-center` and three names — `trailing`, `step`, `action` — for one
slot: the thing opposite the title.

The cause is that first docstring. A component shipped as «a target for the
migration» is filed under _later_, so the next screen reaches for what that
screen needs. **A component with no callers is not a component, it is a
proposal**, and a proposal loses to whatever is already in the file you have
open.

Two consequences, both practical:

- **One caller means it is not shared yet.** Keep it next to its screen, the way
  `SectionCard` correctly lived inside `staff-form-fields.tsx` in July, before
  there was anything to share it with. Local and unexported is the right answer
  to «only this screen needs it».
- **A second screen wanting it is the trigger.** It moves into
  `components/aurora/ui/` **and the first screen is repointed in the same
  commit.** Moving it alone leaves the original copy in place, which is how
  three cards happen.

### A name says what a thing is, never when it was written

The same mistake, one level up, and it caught us the same week.

Every control in `components/aurora/ui/` was exported as `AuroraButton`,
`AuroraInput`, `AuroraSelect` — 62 identifiers. The prefix existed to solve **one
file's** problem: `/admin/style-guide/gallery.tsx` imports both sets side by side to
compare them, and two `Button`s cannot live in one module.

So one file's collision renamed 62 exports that every other file imports. And the
rule it created was accidental, not chosen: `Card`, `EmailInput` and `Fields`
have **no** prefix, because no shadcn component of that name existed to collide
with. «Prefixed if an old one happens to exist» is a fact about the transition,
written permanently into the export names.

**A collision belongs to the importer.** The gallery aliases the legacy side —
`import { Button as LegacyButton } from '@/components/ui/button'` — because the
legacy side is the temporary one. Everything else imports `Button`.

These are the app's controls. When the old set goes, nothing is renamed: the
re-point is a path change, and a path change is what `components/ui/*` can absorb
by re-exporting. Had the prefix stayed, every one of those sites would have
needed an edit, and there would be several hundred by then instead of 46.

`AuroraWash` keeps its name. That one is named **after the design** — it paints
the wash §1 describes — not after a component it had to avoid.

**Screen-scoped commits are what hides this.** «Rebuild the profile» and
«rebuild the form» each look complete on their own, and inside either one the
local helper keeps the diff small and reviewable. Reaching into a shared file
feels like scope creep in that commit and is in fact the job. The differences
between two screens always look real from inside one of them; they are only
props when you have both open.

---

## 12. Traps that have already caught us

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

---

## 13. The scrollbar

**Every scrollbar in the app is the same one**, and it is not the platform's.

`*` sets `scrollbar-width: thin` and `scrollbar-color: var(--scroll-thumb)
transparent`, so it reaches every scroll container — the sidebar, a table, a
record body, a textarea, the document itself. Nothing has to be applied by hand.

**It has to be `*`, not `:root`.** `scrollbar-color` inherits and
`scrollbar-width` does not, and writing both on `:root` fails in the way that
hides: the colour lands, the width silently stays `auto`, and the bar keeps the
platform's chunk while looking styled. Measured when exactly that was written —
the sidebar inherited the colour and computed `scrollbar-width: auto`, gutter
still 15px.

This replaced a narrower rule on 2026-09-17. Until then only the select and
combobox menus were skinned, on the reasoning that one styled bar was enough and
the platform could keep the rest. Looking at the real sidebar killed that
argument:

- the native bar was **the last pure-grey, zero-chroma element** left on screen,
  in a palette where everything else moved to hue 264;
- it painted an **opaque slab down a translucent `.glass-chrome` edge**;
- it wore **stepper arrows** — a 1990s control nothing else in «Аврора» has;
- and it reserved **15px where ours takes 10**, which the sidebar's longest
  labels were already fighting for.

### The colour is chrome, and stays chrome

`--scroll-thumb` sits on **hue 264 at chroma 0.014** — the brand's own hue,
inside §3's chrome band. It is tinted, not grey: `#a0a5ae`, where a true grey
would be `#a5a5a5`.

**Do not make it brand-blue.** §3 says colour means something, and a scrollbar
means nothing. There is also a concrete reason: the active nav item **is**
brand-blue and sits directly beside the sidebar's bar, so a blue scrollbar puts
two blue things together where only one carries meaning.

If it ever needs more presence, **lower its lightness, not raise its chroma.**

Measured on the sidebar: thumb **2.41**, hover **4.20**. (`--border`, tuned to be
only just visible, is 1.45 there for comparison.)

### `.slim-scrollbar` is an escape hatch, not a style

The class exists for one library. Radix Select hides the bar at runtime by
injecting `[data-radix-select-viewport] { scrollbar-width: none }`, and that
declaration is **unlayered**, so it beats any layered rule of ours whatever the
specificity. The class re-asserts the two properties with `!important`, which is
the only thing that reaches the element — important declarations reverse the
layer order.

Wear it on a scroll container a library has hidden. Nowhere else: everything
else already has the bar.
