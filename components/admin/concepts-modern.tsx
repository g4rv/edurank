/**
 * Three more concepts in the «Панель» family — modern product surfaces, each
 * with a different idea about what a dashboard is.
 *
 *   Скло  — Apple. Materials instead of lines: translucency, big radii, a ring.
 *   Ніч   — Linear / Vercel. Dark, dense, keyboard-first, chrome nearly invisible.
 *   Бенто — Apple's product grid. Tiles of unequal size, one of them a real chart.
 *
 * All three keep the university's own #4472C4 as the accent so they stay in the
 * same system as the printed reports, and all three share the sample rows from
 * concept-data.ts. Self-contained hex rather than theme tokens: these are
 * proposals to look at, not skins that must survive the dark-mode toggle yet.
 */

import { PEOPLE, TOP_RATING, FUND, n, initials, sparkPath } from './concept-data';

/* ══════════════════════════════════════════════════════════════════════════
   1. СКЛО — Apple

   Apple separates things with material and space, almost never with a line. So:
   panels are white held at 72% over a soft colour bloom with a blur behind them,
   corners are large, and the only «borders» are a white inner highlight and a
   hairline at 6%. The fund becomes an activity ring, because a ring is how that
   family shows a quantity against a goal. The roster is an iOS grouped inset
   list — one rounded container, rows divided by inset hairlines, a chevron at
   the end of each. Fewer elements, much more air.
   ══════════════════════════════════════════════════════════════════════════ */

const G = {
  ink: '#1d1d1f',
  soft: '#6e6e73',
  faint: '#8e8e93',
  accent: '#4472c4',
  accentSoft: '#7ea0e0',
  green: '#30d158',
  orange: '#ff9f0a',
  hair: 'rgba(0,0,0,0.07)',
};

function Ring({ pct, over }: { pct: number; over: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg width="132" height="132" viewBox="0 0 132 132">
      <defs>
        <linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={G.accentSoft} />
          <stop offset="100%" stopColor={G.accent} />
        </linearGradient>
      </defs>
      <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="13" />
      {/* Overspend arc sits behind, in the goal's own track */}
      <circle
        cx="66"
        cy="66"
        r={r}
        fill="none"
        stroke={G.orange}
        strokeWidth="13"
        strokeLinecap="round"
        strokeDasharray={`${(over / 100) * c} ${c}`}
        transform={`rotate(${-90 + 360 * (pct / 100)} 66 66)`}
        opacity="0.28"
      />
      <circle
        cx="66"
        cy="66"
        r={r}
        fill="none"
        stroke="url(#ringg)"
        strokeWidth="13"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 66 66)"
      />
    </svg>
  );
}

export function ConceptGlass() {
  const pct = (FUND.spent / FUND.pool) * 100;
  const over = ((FUND.formula - FUND.pool) / FUND.pool) * 100;

  return (
    <div
      className="relative overflow-hidden px-7 py-7"
      style={{ background: '#f5f5f7', color: G.ink, fontFamily: 'var(--dc-manrope)' }}
    >
      {/* Two soft blooms — the light the glass is catching */}
      <div
        className="pointer-events-none absolute -top-24 -left-16 h-72 w-96 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(68,114,196,0.20), transparent 65%)' }}
      />
      <div
        className="pointer-events-none absolute -top-16 right-0 h-64 w-80 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,159,10,0.14), transparent 65%)' }}
      />

      <div className="relative">
        {/* ── Header: a pill segmented control, nothing else ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[13px]" style={{ color: G.soft }}>
              Кафедра вищої математики
            </div>
            <h2 className="mt-1 text-[30px] leading-tight font-bold tracking-[-0.025em]">
              Розподіл ставок
            </h2>
          </div>
          <div
            className="flex items-center gap-1 rounded-full p-1"
            style={{
              background: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(255,255,255,0.8)',
            }}
          >
            {['2024', '2025', '2026'].map((y) => (
              <button
                key={y}
                className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold tabular-nums"
                style={
                  y === '2026'
                    ? { background: '#fff', color: G.ink, boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }
                    : { color: G.soft }
                }
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* ── The ring panel ── */}
        <div
          className="mt-6 flex flex-wrap items-center gap-8 rounded-[26px] px-7 py-6"
          style={{
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(30px)',
            boxShadow:
              '0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -8px rgba(0,0,0,0.10), inset 0 0 0 1px rgba(255,255,255,0.9)',
          }}
        >
          <div className="relative shrink-0">
            <Ring pct={pct} over={over} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[30px] leading-none font-bold tracking-[-0.03em] tabular-nums">
                {n(FUND.spent)}
              </div>
              <div className="mt-1 text-[12px]" style={{ color: G.faint }}>
                з {n(FUND.pool)}
              </div>
            </div>
          </div>

          <div className="min-w-52 flex-1 space-y-4">
            {[
              // A glyph in the tinted square, the way that family always sets it —
              // an empty tinted square reads as an icon that failed to load.
              ['Нерозподілено', n(FUND.pool - FUND.spent), G.green, 'M3 8.5l3.5 3.5L13 4'],
              [
                'Понад фонд за формулою',
                `+${n(FUND.formula - FUND.pool)}`,
                G.orange,
                'M8 3.5v5.5M8 12h.01',
              ],
            ].map(([label, value, tone, path]) => (
              <div key={label} className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                  style={{ background: `${tone}22`, boxShadow: `inset 0 0 0 1px ${tone}33` }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d={path}
                      stroke={tone}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>
                  <span className="block text-[12.5px]" style={{ color: G.soft }}>
                    {label}
                  </span>
                  <span
                    className="block text-[19px] leading-tight font-bold tabular-nums"
                    style={{ color: tone }}
                  >
                    {value}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <button
            className="shrink-0 rounded-full px-6 py-3 text-[14px] font-semibold text-white"
            style={{
              background: G.accent,
              boxShadow: '0 4px 14px -2px rgba(68,114,196,0.45)',
            }}
          >
            Зберегти
          </button>
        </div>

        {/* ── Grouped inset list ── */}
        <div
          className="mt-4 overflow-hidden rounded-[22px]"
          style={{
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(30px)',
            boxShadow:
              '0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -8px rgba(0,0,0,0.10), inset 0 0 0 1px rgba(255,255,255,0.9)',
          }}
        >
          {PEOPLE.map((p, i) => (
            <div key={p.name} className="flex items-center gap-3.5 pr-5 pl-5">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold text-white"
                style={{ background: `linear-gradient(150deg, ${G.accentSoft}, ${G.accent})` }}
              >
                {initials(p.name)}
              </span>
              <div
                className="flex flex-1 items-center gap-4 py-3.5"
                style={{ borderTop: i > 0 ? `1px solid ${G.hair}` : undefined }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[12.5px]" style={{ color: G.faint }}>
                    {p.role} · {p.rating.toLocaleString('uk-UA')} балів
                  </span>
                </span>
                <span className="text-[17px] font-bold tabular-nums">
                  {n(p.stake + p.bonus, 3)}
                </span>
                <svg width="9" height="15" viewBox="0 0 9 15" fill="none" className="shrink-0">
                  <path
                    d="M1.5 1.5L7 7.5l-5.5 6"
                    stroke={G.faint}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 px-2 text-[12px]" style={{ color: G.faint }}>
          Показано 4 з 18. Кнпп кафедри — 8; це дільник у формулі, а не кількість людей.
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   2. НІЧ — Linear / Vercel

   Chrome is turned nearly all the way down so the data is the only thing with
   contrast. Borders are white at 6–8%, panels barely lift off the ground, and
   the summary card is ringed by Linear's signature gradient hairline that fades
   as it goes round. Dense — 13px, tight rows — and keyboard-first: a ⌘K field
   and filter chips instead of a toolbar of buttons.
   ══════════════════════════════════════════════════════════════════════════ */

const N = {
  bg: '#09090b',
  panel: '#121215',
  ink: '#ededf0',
  soft: '#8b8b94',
  faint: '#5c5c66',
  line: 'rgba(255,255,255,0.07)',
  accent: '#5b8def',
  green: '#3fcf8e',
  orange: '#f5a623',
};

export function ConceptNight() {
  const spentPct = (FUND.spent / FUND.formula) * 100;
  const poolPct = (FUND.pool / FUND.formula) * 100;

  return (
    <div
      className="px-5 py-4"
      style={{ background: N.bg, color: N.ink, fontFamily: 'var(--dc-onest)' }}
    >
      {/* ── Command row ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div
          className="flex flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5"
          style={{ background: N.panel, boxShadow: `inset 0 0 0 1px ${N.line}` }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke={N.faint} strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke={N.faint} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-[12.5px]" style={{ color: N.faint }}>
            Пошук по кафедрі…
          </span>
          <kbd
            className="ml-auto rounded px-1.5 py-0.5 text-[10.5px]"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: N.faint,
              fontFamily: 'var(--dc-jet)',
            }}
          >
            ⌘K
          </kbd>
        </div>
        {['Усі 18', 'Понад норму 3', 'Без бонусу 11'].map((chip, i) => (
          <button
            key={chip}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px]"
            style={
              i === 0
                ? {
                    background: 'rgba(91,141,239,0.12)',
                    color: N.accent,
                    boxShadow: `inset 0 0 0 1px rgba(91,141,239,0.25)`,
                  }
                : { color: N.soft, boxShadow: `inset 0 0 0 1px ${N.line}` }
            }
          >
            {chip}
          </button>
        ))}
      </div>

      {/* ── Summary card with the fading gradient hairline ── */}
      <div
        className="relative mt-3 overflow-hidden rounded-xl p-[1px]"
        style={{
          background: `linear-gradient(140deg, rgba(91,141,239,0.55) 0%, ${N.line} 45%, ${N.line} 100%)`,
        }}
      >
        <div className="rounded-[11px] px-4 py-3.5" style={{ background: N.panel }}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-7">
              {[
                ['Виділено', n(FUND.pool), N.ink],
                ['Розподілено', n(FUND.spent), N.ink],
                ['Залишок', n(FUND.pool - FUND.spent), N.green],
              ].map(([label, value, tone]) => (
                <div key={label}>
                  <div className="text-[11px]" style={{ color: N.faint }}>
                    {label}
                  </div>
                  <div
                    className="mt-1 text-[22px] leading-none font-semibold tabular-nums"
                    style={{ color: tone, fontFamily: 'var(--dc-jet)' }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg px-3 py-1.5 text-[12.5px]"
                style={{ color: N.soft, boxShadow: `inset 0 0 0 1px ${N.line}` }}
              >
                До формули
              </button>
              <button
                className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium text-white"
                style={{
                  background: N.accent,
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.10) inset',
                }}
              >
                Зберегти
              </button>
            </div>
          </div>

          <div className="relative mt-4 mb-0.5 h-1.5">
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            />
            <div
              className="absolute inset-y-0 rounded-r-full"
              style={{ left: `${poolPct}%`, right: 0, background: 'rgba(245,166,35,0.14)' }}
            />
            <div
              className="absolute inset-y-[-2px] w-px"
              style={{ left: `${poolPct}%`, background: N.orange }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${spentPct}%`, background: N.accent }}
            />
          </div>
          <div className="mt-2 text-[11px]" style={{ color: N.faint }}>
            Формула без правок дала б {n(FUND.formula)} — на {n(FUND.formula - FUND.pool)} більше за
            фонд
          </div>
        </div>
      </div>

      {/* ── Dense roster ── */}
      <div
        className="mt-3 overflow-hidden rounded-xl"
        style={{ background: N.panel, boxShadow: `inset 0 0 0 1px ${N.line}` }}
      >
        {PEOPLE.map((p, i) => {
          const { line, last } = sparkPath(p.trend, 56, 18);
          return (
            <div
              key={p.name}
              className="grid grid-cols-[1.5fr_auto_auto_auto_auto] items-center gap-4 px-4 py-2.5 transition-colors hover:bg-white/[0.03]"
              style={{ borderTop: i > 0 ? `1px solid ${N.line}` : undefined }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: p.state === 'warn' ? N.orange : N.green }}
                />
                <span className="truncate text-[13px]">{p.name}</span>
                <span className="truncate text-[11.5px]" style={{ color: N.faint }}>
                  {p.role}
                </span>
              </div>

              <svg width="56" height="18" viewBox="0 0 56 18">
                <polyline
                  points={line}
                  fill="none"
                  stroke={p.state === 'warn' ? N.orange : N.accent}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx={last[0]}
                  cy={last[1]}
                  r="1.8"
                  fill={p.state === 'warn' ? N.orange : N.accent}
                />
              </svg>

              <span
                className="w-12 text-right text-[12px] tabular-nums"
                style={{ color: N.soft, fontFamily: 'var(--dc-jet)' }}
              >
                {p.rating}
              </span>

              <input
                readOnly
                value={n(p.stake)}
                className="w-16 rounded-md bg-transparent px-2 py-1 text-right text-[12.5px] tabular-nums outline-none"
                style={{
                  color: N.ink,
                  fontFamily: 'var(--dc-jet)',
                  boxShadow: `inset 0 0 0 1px ${N.line}`,
                }}
              />

              <span
                className="w-14 text-right text-[13px] font-semibold tabular-nums"
                style={{ fontFamily: 'var(--dc-jet)' }}
              >
                {n(p.stake + p.bonus, 3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   3. БЕНТО — Apple's product grid

   Tiles of deliberately unequal size, so the layout itself states what matters
   most. The largest tile is a real chart rather than a number, the roster is a
   wide tile beneath, and the small tiles carry single figures. It suits the
   Огляд page far better than the кафедра grid — it is the shape of a summary,
   not of a form — but it is shown on the same data so it can be compared.
   ══════════════════════════════════════════════════════════════════════════ */

const B = {
  bg: '#f2f2f4',
  card: '#ffffff',
  ink: '#16161a',
  soft: '#6b6b76',
  faint: '#9a9aa6',
  accent: '#4472c4',
  accentSoft: '#93b0e6',
  green: '#1eb980',
  orange: '#f59e0b',
};

const TILE = {
  background: B.card,
  borderRadius: 20,
  boxShadow: '0 1px 2px rgba(16,24,40,0.05), 0 8px 24px -10px rgba(16,24,40,0.14)',
};

export function ConceptBento() {
  return (
    <div
      className="px-6 py-6"
      style={{ background: B.bg, color: B.ink, fontFamily: 'var(--dc-manrope)' }}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] leading-tight font-bold tracking-[-0.025em]">
            Вищої математики
          </h2>
          <p className="mt-0.5 text-[13px]" style={{ color: B.soft }}>
            Розподіл ставок · 2026
          </p>
        </div>
        <button
          className="rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white"
          style={{ background: B.accent, boxShadow: '0 4px 14px -3px rgba(68,114,196,0.5)' }}
        >
          Зберегти
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {/* Big tile: the distribution as a chart, which is what a summary owes you */}
        <div className="col-span-2 row-span-2 p-5" style={TILE}>
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-semibold">Ставки по людях</span>
            <span className="text-[11.5px]" style={{ color: B.faint }}>
              4 з 18
            </span>
          </div>
          <div className="mt-5 flex h-[132px] items-end gap-4">
            {PEOPLE.map((p) => {
              // Pixels, not percent: the column has no definite height of its
              // own, so a percentage would resolve to nothing and the bar would
              // silently disappear.
              const h = ((p.stake + p.bonus) / 0.75) * 96;
              return (
                <div
                  key={p.name}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                >
                  <span className="text-[11.5px] font-semibold tabular-nums">
                    {n(p.stake + p.bonus, 2)}
                  </span>
                  <div
                    className="w-full rounded-t-[7px]"
                    style={{
                      height: `${h}px`,
                      background:
                        p.state === 'warn'
                          ? `linear-gradient(180deg, ${B.orange}, ${B.orange}bb)`
                          : `linear-gradient(180deg, ${B.accentSoft}, ${B.accent})`,
                    }}
                  />
                  <span className="text-[10.5px]" style={{ color: B.faint }}>
                    {initials(p.name)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Two small figure tiles */}
        <div className="p-5" style={TILE}>
          <div className="text-[12px]" style={{ color: B.soft }}>
            Виділено
          </div>
          <div className="mt-2 text-[32px] leading-none font-bold tracking-[-0.03em] tabular-nums">
            {n(FUND.pool)}
          </div>
        </div>
        <div
          className="p-5"
          style={{ ...TILE, background: `linear-gradient(155deg, ${B.accent}, #3a5aa8)` }}
        >
          <div className="text-[12px] text-white/70">Нерозподілено</div>
          <div className="mt-2 text-[32px] leading-none font-bold tracking-[-0.03em] text-white tabular-nums">
            {n(FUND.pool - FUND.spent)}
          </div>
          <div className="mt-3 inline-flex rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white">
            можна роздати
          </div>
        </div>

        {/* Wide tile spanning the two right columns */}
        <div className="col-span-2 p-5" style={TILE}>
          <div className="text-[12px]" style={{ color: B.soft }}>
            Понад фонд за формулою
          </div>
          <div className="mt-2 flex items-end gap-3">
            <span
              className="text-[32px] leading-none font-bold tracking-[-0.03em] tabular-nums"
              style={{ color: B.orange }}
            >
              +{n(FUND.formula - FUND.pool)}
            </span>
            <span className="pb-1 text-[12px]" style={{ color: B.faint }}>
              формула дає {n(FUND.formula)} при фонді {n(FUND.pool)}
            </span>
          </div>
        </div>

        {/* Roster tile, full width */}
        <div className="col-span-4 px-5 py-2" style={TILE}>
          {PEOPLE.map((p, i) => (
            <div
              key={p.name}
              className="flex items-center gap-4 py-2.5"
              style={{ borderTop: i > 0 ? '1px solid rgba(0,0,0,0.06)' : undefined }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: `linear-gradient(150deg, ${B.accentSoft}, ${B.accent})` }}
              >
                {initials(p.name)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{p.name}</span>
              <span
                className="relative h-1.5 w-32 shrink-0 rounded-full"
                style={{ background: '#ececed' }}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${(p.rating / TOP_RATING) * 100}%`,
                    background: p.state === 'warn' ? B.orange : B.accent,
                  }}
                />
              </span>
              <span
                className="w-12 shrink-0 text-right text-[12px] tabular-nums"
                style={{ color: B.soft }}
              >
                {p.rating.toLocaleString('uk-UA')}
              </span>
              <span className="w-14 shrink-0 text-right text-[14px] font-bold tabular-nums">
                {n(p.stake + p.bonus, 3)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
