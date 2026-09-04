/**
 * «Аврора»'s background — the colour wash the glass panels sit on.
 *
 * **One element, fixed to the viewport, painted once.** Not a background on
 * each panel, and not a gradient on the page: Аврора's own note says «a panel
 * with no light behind it reads as grey plastic», and painted onto the page the
 * wash ends where the first screenful does — so on `/rating` (~330 rows)
 * everything below the fold would sit over flat grey. Fixed to the viewport,
 * the light is always behind whatever is on screen, and it is paid for once.
 *
 * ## Written for a slow machine, after it was measured on one
 *
 * The first version of this file was genuinely expensive, and every reason was
 * a wrong assumption on my part. What changed, and why:
 *
 * 1. **No `filter: blur()` at all.** Each bloom used to be a radial gradient
 *    with a 26–36px blur on top of it, some of them 768×544. But a radial
 *    gradient fading to `transparent` is *already* a soft blob — the blur was
 *    re-softening something soft, at full cost. The falloff now does the whole
 *    job. This was the single largest saving here.
 * 2. **Translate only, never `scale()`.** Scaling forces the layer to be
 *    re-rasterised every frame at its new size. Translation is pure compositor
 *    work — the layer is drawn once and then moved. The claim «transform
 *    animations are cheap» is only true of the transforms that do not resize.
 * 3. **Five blooms, not seven.** Each is a separate composited layer, and on
 *    integrated graphics layer count costs real memory.
 * 4. **Grain without `mix-blend-mode`.** A blend mode forces a compositing pass
 *    over everything beneath it, across the whole viewport, forever. Plain low
 *    opacity is close enough to the same look for what is a 3.5 % texture.
 *
 * `aria-hidden` and `pointer-events-none` throughout: this is atmosphere, and
 * it must never take a click or reach a screen reader.
 */

/**
 * Fractal noise as a data URI, ~4 % over the wash.
 *
 * Now doing real work rather than polish: with the blur filters gone, the
 * gradients are the only thing softening the colour, and a screen quantises a
 * slow ramp into visible bands. The grain hides the steps.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * Five blooms, small and pushed off the edges.
 *
 * Twice this was wrong in opposite directions — blurred and washed out, then
 * big and saturated enough to read as blobs — and the lesson was that **size
 * matters more than alpha**. A bloom wide enough to fill the viewport IS the
 * background; a smaller one hanging off a corner reads as light falling into
 * it. So the footprint stays compact and anchored outside the frame, with only
 * the edges showing, and the colour is carried by saturation instead. The
 * middle of the screen, where the card sits, stays quiet either way.
 *
 * Blue #4472C4 · violet #7C5CD6 · teal #2BB3A3 · one rose #D46BA8 low right,
 * which keeps the bottom half from reading as flat lilac. The two largest are
 * the institutional blue, so the wash still belongs to the same family as the
 * university's printed reports.
 *
 * **`ellipse closest-side`, not `circle`.** A circular gradient inside a wide
 * box still carries colour where the box ends, and the old `rounded-full` then
 * cut it off — a hard elliptical seam across the wash. The 30px blur used to
 * smear that away, so removing the blur is what exposed it. `closest-side`
 * makes the falloff finish exactly at the edge, so there is nothing left to
 * clip, and the alphas can go back up without the seam coming with them.
 */
const BLOOMS = [
  { c: '68,114,196', a: 0.44, anim: 'a', dur: 38, cls: '-top-44 -left-36 h-[30rem] w-[38rem]' },
  { c: '124,92,214', a: 0.34, anim: 'c', dur: 47, cls: '-top-36 left-1/4 h-[22rem] w-[28rem]' },
  { c: '43,179,163', a: 0.34, anim: 'b', dur: 41, cls: '-top-28 -right-20 h-[20rem] w-[26rem]' },
  { c: '124,92,214', a: 0.36, anim: 'd', dur: 53, cls: '-bottom-40 -left-28 h-[30rem] w-[38rem]' },
  {
    c: '212,107,168',
    a: 0.28,
    anim: 'a',
    dur: 59,
    cls: '-bottom-32 -right-24 h-[24rem] w-[30rem]',
  },
];

export function AuroraWash() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* The ground. --background carries the same tint, so a browser that
          refuses the blooms still lands on the right colour rather than white. */}
      <div className="absolute inset-0 bg-background" />

      {BLOOMS.map((b, i) => (
        <div
          key={i}
          className={`aurora-bloom absolute ${b.cls}`}
          style={{
            background: `radial-gradient(ellipse closest-side, rgba(${b.c},${b.a}), rgba(${b.c},0) 100%)`,
            animationName: `aurora-drift-${b.anim}`,
            animationDuration: `${b.dur}s`,
            // Negative delay starts each bloom part-way along its own cycle, so
            // they are already scattered on the first paint instead of setting
            // off together from identical positions.
            animationDelay: `-${b.dur / (i + 2)}s`,
          }}
        />
      ))}

      {/* Dark mode keeps the construction and drops the brightness, so text on a
          dark card still reads. «Кристал» is this wash with the lights down.

          Faded with `opacity`, not switched with `hidden`/`block`: `display`
          cannot be transitioned, so on a theme change this one layer would snap
          while the whole rest of the page cross-fades around it. */}
      <div className="absolute inset-0 bg-background opacity-0 dark:opacity-80" />

      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
        style={{ backgroundImage: GRAIN }}
      />
    </div>
  );
}
