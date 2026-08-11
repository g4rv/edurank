/**
 * Two concepts in the glass / Stripe register — the direction «Панель» and
 * «Скло» pointed at, taken further.
 *
 *   Аврора  — light. Stripe's gradient wash under frosted panels.
 *   Кристал — deep. The same construction over a night sky.
 *
 * The craft is in the layering, and it is the same in both: a coloured mesh at
 * the bottom, a fine grain over it so the gradient does not band, then panels
 * that are genuinely translucent — a blur, a specular hairline along the top
 * edge, and a shadow that is tight and wide at once. Glass fails when it is
 * merely a pale rectangle; it works when you can tell there is something behind
 * it.
 *
 * Both keep the university's #4472C4 as the anchor of the gradient, so the
 * screen still belongs to the same institution as the printed reports.
 */

import { PEOPLE, TOP_RATING, FUND, n, initials, sparkPath } from './concept-data';

/**
 * Fractal noise as a data URI. Three per cent of it over a wide gradient is the
 * difference between «designed» and «banded» — screens quantise a slow colour
 * ramp into visible steps, and grain hides the steps.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* ══════════════════════════════════════════════════════════════════════════
   1. АВРОРА — light glass over a Stripe wash
   ══════════════════════════════════════════════════════════════════════════ */

const L = {
  ink: '#0f1729',
  soft: '#5b6478',
  faint: '#8b93a7',
  accent: '#4472c4',
  accentDeep: '#3455a0',
  violet: '#7c5cd6',
  teal: '#2bb3a3',
  green: '#0ea472',
  amber: '#e08a00',
};

/** Frosted plane: blur, specular top edge, contact shadow over an ambient one */
const GLASS: React.CSSProperties = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(24px) saturate(1.6)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
  boxShadow:
    '0 1px 2px rgba(15,23,41,0.05), 0 16px 40px -14px rgba(15,23,41,0.22), inset 0 1px 0 rgba(255,255,255,0.85), inset 0 0 0 1px rgba(255,255,255,0.5)',
};

function Ring({ pct, over }: { pct: number; over: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg width="118" height="118" viewBox="0 0 118 118">
      <defs>
        <linearGradient id="augrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8fb0ee" />
          <stop offset="60%" stopColor={L.accent} />
          <stop offset="100%" stopColor={L.violet} />
        </linearGradient>
      </defs>
      <circle cx="59" cy="59" r={r} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="11" />
      <circle
        cx="59"
        cy="59"
        r={r}
        fill="none"
        stroke={L.amber}
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={`${(over / 100) * c} ${c}`}
        transform={`rotate(${-90 + 360 * (pct / 100)} 59 59)`}
        opacity="0.4"
      />
      <circle
        cx="59"
        cy="59"
        r={r}
        fill="none"
        stroke="url(#augrad)"
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 59 59)"
      />
    </svg>
  );
}

export function ConceptAurora() {
  const pct = (FUND.spent / FUND.pool) * 100;
  const over = ((FUND.formula - FUND.pool) / FUND.pool) * 100;

  return (
    <div
      className="relative overflow-hidden px-6 py-6"
      style={{ color: L.ink, fontFamily: 'var(--dc-manrope)' }}
    >
      {/* ── The wash: three blooms, then grain over the lot ── */}
      <div className="pointer-events-none absolute inset-0" style={{ background: '#f7f8fb' }} />
      <div
        className="pointer-events-none absolute -top-40 -left-24 h-[26rem] w-[36rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(68,114,196,0.38), transparent 62%)',
          filter: 'blur(28px)',
        }}
      />
      <div
        className="pointer-events-none absolute -top-32 left-1/3 h-[22rem] w-[30rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(124,92,214,0.30), transparent 62%)',
          filter: 'blur(30px)',
        }}
      />
      <div
        className="pointer-events-none absolute -top-24 -right-20 h-[20rem] w-[28rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(43,179,163,0.26), transparent 62%)',
          filter: 'blur(30px)',
        }}
      />
      {/* Two more, low down. Without light behind the roster its panel has
          nothing to refract and frosted glass just reads as grey plastic. */}
      <div
        className="pointer-events-none absolute -bottom-32 -left-16 h-[24rem] w-[34rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(124,92,214,0.24), transparent 62%)',
          filter: 'blur(34px)',
        }}
      />
      <div
        className="pointer-events-none absolute -right-28 -bottom-40 h-[26rem] w-[34rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(68,114,196,0.26), transparent 62%)',
          filter: 'blur(34px)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-multiply"
        style={{ backgroundImage: GRAIN }}
      />

      <div className="relative">
        {/* ── Top bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px]">
            <span style={{ color: L.faint }}>Кафедри</span>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke={L.faint} strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="font-semibold">Вищої математики</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center gap-0.5 rounded-full p-1"
              style={{
                background: 'rgba(255,255,255,0.6)',
                backdropFilter: 'blur(16px)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.7), 0 1px 2px rgba(15,23,41,0.05)',
              }}
            >
              {['2024', '2025', '2026'].map((y) => (
                <button
                  key={y}
                  className="rounded-full px-3 py-1 text-[12.5px] font-semibold tabular-nums"
                  style={
                    y === '2026'
                      ? {
                          background: '#fff',
                          color: L.ink,
                          boxShadow: '0 1px 3px rgba(15,23,41,0.12)',
                        }
                      : { color: L.soft }
                  }
                >
                  {y}
                </button>
              ))}
            </div>
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-[11.5px] font-bold text-white"
              style={{ background: `linear-gradient(140deg, ${L.accent}, ${L.violet})` }}
            >
              ДВ
            </span>
          </div>
        </div>

        {/* ── Headline ── */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[27px] leading-tight font-bold tracking-[-0.028em]">
              Розподіл ставок
            </h2>
            <p className="mt-0.5 text-[13px]" style={{ color: L.soft }}>
              18 НПП · Кнпп 8 · оновлено сьогодні о 14:22
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-xl px-3.5 py-2 text-[13px] font-semibold"
              style={{
                background: 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(16px)',
                color: L.ink,
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.8), 0 1px 3px rgba(15,23,41,0.08)',
              }}
            >
              До формули
            </button>
            <button
              className="rounded-xl px-4 py-2 text-[13px] font-semibold text-white"
              style={{
                background: `linear-gradient(135deg, ${L.accent}, ${L.violet})`,
                boxShadow:
                  '0 1px 2px rgba(15,23,41,0.10), 0 8px 20px -6px rgba(90,100,205,0.55), inset 0 1px 0 rgba(255,255,255,0.28)',
              }}
            >
              Зберегти
            </button>
          </div>
        </div>

        {/* ── Fund ring beside three figures, in one frosted plane ── */}
        <div className="mt-4 grid grid-cols-[auto_1fr] gap-4">
          <div className="flex items-center gap-5 rounded-2xl px-6 py-5" style={GLASS}>
            <div className="relative shrink-0">
              <Ring pct={pct} over={over} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[26px] leading-none font-bold tracking-[-0.03em] tabular-nums">
                  {n(FUND.spent)}
                </span>
                <span className="mt-0.5 text-[11.5px]" style={{ color: L.faint }}>
                  з {n(FUND.pool)}
                </span>
              </div>
            </div>
            <div>
              <div
                className="text-[11px] font-semibold tracking-[0.05em] uppercase"
                style={{ color: L.faint }}
              >
                Нерозподілено
              </div>
              <div
                className="mt-1 text-[30px] leading-none font-bold tracking-[-0.03em] tabular-nums"
                style={{ color: L.green }}
              >
                {n(FUND.pool - FUND.spent)}
              </div>
              <div
                className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                style={{ background: 'rgba(224,138,0,0.12)', color: L.amber }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: L.amber }} />
                формула дає {n(FUND.formula)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 rounded-2xl px-2 py-5" style={GLASS}>
            {[
              ['Середній рейтинг', '5 101', '+12,4%', true, [30, 33, 31, 38, 42, 45, 50, 56]],
              ['Ставок роздано', '3,10', '77,5%', true, [20, 34, 30, 48, 55, 60, 68, 78]],
              ['Без бонусу', '11', '−2', false, [40, 38, 36, 34, 33, 30, 29, 28]],
            ].map(([label, value, delta, up, trend], i) => {
              const { line, last } = sparkPath(trend as number[], 62, 22);
              const tone = up ? L.green : L.amber;
              return (
                <div
                  key={String(label)}
                  className={`px-4 ${i > 0 ? 'border-l' : ''}`}
                  style={{ borderColor: 'rgba(15,23,41,0.08)' }}
                >
                  <div
                    className="text-[11px] font-semibold tracking-[0.05em] uppercase"
                    style={{ color: L.faint }}
                  >
                    {String(label)}
                  </div>
                  <div className="mt-1.5 flex items-end justify-between gap-2">
                    <span className="text-[24px] leading-none font-bold tracking-[-0.03em] tabular-nums">
                      {String(value)}
                    </span>
                    <svg width="62" height="22" viewBox="0 0 62 22">
                      <polyline
                        points={line}
                        fill="none"
                        stroke={tone}
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx={last[0]} cy={last[1]} r="2" fill={tone} />
                    </svg>
                  </div>
                  <div className="mt-2 text-[11.5px] font-semibold" style={{ color: tone }}>
                    {String(delta)}{' '}
                    <span className="font-normal" style={{ color: L.faint }}>
                      проти 2025
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Roster ── */}
        <div className="mt-4 overflow-hidden rounded-2xl" style={GLASS}>
          <div
            className="grid grid-cols-[1.7fr_1fr_auto_auto_auto] items-center gap-4 px-5 py-3 text-[11px] font-semibold tracking-[0.05em] uppercase"
            style={{ color: L.faint, borderBottom: '1px solid rgba(15,23,41,0.07)' }}
          >
            <span>НПП</span>
            <span>Рейтинг</span>
            <span className="w-[70px] text-right">Ставка</span>
            <span className="w-14 text-right">Бонус</span>
            <span className="w-14 text-right">Разом</span>
          </div>

          {PEOPLE.map((p, i) => (
            <div
              key={p.name}
              className="grid grid-cols-[1.7fr_1fr_auto_auto_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-white/45"
              style={{ borderTop: i > 0 ? '1px solid rgba(15,23,41,0.055)' : undefined }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold text-white"
                  style={{
                    background:
                      p.state === 'warn'
                        ? `linear-gradient(140deg, #f0b45e, ${L.amber})`
                        : `linear-gradient(140deg, #8fb0ee, ${L.accent})`,
                    boxShadow: '0 2px 6px -1px rgba(15,23,41,0.25)',
                  }}
                >
                  {initials(p.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[11.5px]" style={{ color: L.faint }}>
                    {p.role}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="relative h-1.5 flex-1 rounded-full"
                  style={{ background: 'rgba(15,23,41,0.09)' }}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${(p.rating / TOP_RATING) * 100}%`,
                      background:
                        p.state === 'warn'
                          ? `linear-gradient(90deg, #f0b45e, ${L.amber})`
                          : `linear-gradient(90deg, ${L.accent}, ${L.violet})`,
                    }}
                  />
                </span>
                <span
                  className="w-11 shrink-0 text-right text-[12px] tabular-nums"
                  style={{ color: L.soft }}
                >
                  {p.rating.toLocaleString('uk-UA')}
                </span>
              </div>

              <input
                readOnly
                value={n(p.stake)}
                className="w-[70px] rounded-lg px-2.5 py-1.5 text-right text-[13px] font-semibold tabular-nums outline-none"
                style={{
                  background: 'rgba(255,255,255,0.75)',
                  color: L.ink,
                  boxShadow:
                    'inset 0 0 0 1px rgba(15,23,41,0.10), inset 0 1px 2px rgba(15,23,41,0.05)',
                }}
              />

              <span
                className="w-14 text-right text-[13px] tabular-nums"
                style={{ color: p.bonus ? L.ink : L.faint }}
              >
                {p.bonus ? `+${n(p.bonus, 3)}` : '—'}
              </span>
              <span className="w-14 text-right text-[14px] font-bold tabular-nums">
                {n(p.stake + p.bonus, 3)}
              </span>
            </div>
          ))}

          <div
            className="flex items-center justify-between px-5 py-3 text-[12.5px]"
            style={{
              borderTop: '1px solid rgba(15,23,41,0.07)',
              background: 'rgba(255,255,255,0.35)',
            }}
          >
            <span style={{ color: L.soft }}>Показано 4 з 18</span>
            <span className="font-bold tabular-nums">3,100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   2. КРИСТАЛ — the same construction over a night sky

   Dark glass is harder than light glass: a translucent white panel on a dark
   ground goes muddy grey unless the light behind it is coloured. So the mesh
   below is richer here, the panel is white at only 6 %, and the specular edge
   does most of the work of saying «this is a surface».
   ══════════════════════════════════════════════════════════════════════════ */

const D = {
  ink: '#eaedf6',
  soft: '#9aa3bd',
  faint: '#6b748f',
  accent: '#6d9bf5',
  violet: '#a184f0',
  green: '#3ddc9a',
  amber: '#f6b93b',
};

const DARK_GLASS: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(26px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(26px) saturate(1.4)',
  boxShadow:
    '0 18px 44px -18px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.16), inset 0 0 0 1px rgba(255,255,255,0.08)',
};

export function ConceptCrystal() {
  const spentPct = (FUND.spent / FUND.formula) * 100;
  const poolPct = (FUND.pool / FUND.formula) * 100;

  return (
    <div
      className="relative overflow-hidden px-6 py-6"
      style={{ color: D.ink, fontFamily: 'var(--dc-manrope)' }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: '#0a0e1c' }} />
      <div
        className="pointer-events-none absolute -top-44 -left-24 h-[28rem] w-[38rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(68,114,196,0.55), transparent 62%)',
          filter: 'blur(34px)',
        }}
      />
      <div
        className="pointer-events-none absolute -top-36 left-1/2 h-[24rem] w-[32rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(140,100,240,0.42), transparent 62%)',
          filter: 'blur(36px)',
        }}
      />
      <div
        className="pointer-events-none absolute top-1/3 -right-24 h-[22rem] w-[30rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(43,179,163,0.28), transparent 62%)',
          filter: 'blur(36px)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: GRAIN }}
      />

      <div className="relative">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[12.5px]" style={{ color: D.soft }}>
              Кафедра вищої математики · 2026
            </div>
            <h2 className="mt-1 text-[27px] leading-tight font-bold tracking-[-0.028em]">
              Розподіл ставок
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-xl px-3.5 py-2 text-[13px] font-semibold"
              style={{
                ...DARK_GLASS,
                color: D.ink,
                boxShadow:
                  'inset 0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 0 rgba(255,255,255,0.14)',
              }}
            >
              До формули
            </button>
            <button
              className="rounded-xl px-4 py-2 text-[13px] font-semibold text-white"
              style={{
                background: `linear-gradient(135deg, ${D.accent}, ${D.violet})`,
                boxShadow:
                  '0 8px 22px -6px rgba(120,140,245,0.6), inset 0 1px 0 rgba(255,255,255,0.3)',
              }}
            >
              Зберегти
            </button>
          </div>
        </div>

        {/* Summary plane */}
        <div className="mt-4 rounded-2xl px-6 py-5" style={DARK_GLASS}>
          <div className="flex flex-wrap items-end gap-10">
            {[
              ['Виділено', n(FUND.pool), D.ink],
              ['Розподілено', n(FUND.spent), D.ink],
              ['Нерозподілено', n(FUND.pool - FUND.spent), D.green],
              ['Понад фонд', `+${n(FUND.formula - FUND.pool)}`, D.amber],
            ].map(([label, value, tone]) => (
              <div key={label}>
                <div
                  className="text-[11px] font-semibold tracking-[0.05em] uppercase"
                  style={{ color: D.faint }}
                >
                  {label}
                </div>
                <div
                  className="mt-1.5 text-[28px] leading-none font-bold tracking-[-0.03em] tabular-nums"
                  style={{ color: tone }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="relative mt-5 mb-1 h-2">
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: 'rgba(255,255,255,0.09)' }}
            />
            <div
              className="absolute inset-y-0 rounded-r-full"
              style={{ left: `${poolPct}%`, right: 0, background: 'rgba(246,185,59,0.18)' }}
            />
            <div
              className="absolute inset-y-[-3px] w-px"
              style={{ left: `${poolPct}%`, background: D.amber }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${spentPct}%`,
                background: `linear-gradient(90deg, ${D.accent}, ${D.violet})`,
                boxShadow: '0 0 14px rgba(109,155,245,0.6)',
              }}
            />
            <span
              className="absolute top-[12px] -translate-x-1/2 text-[10.5px] font-semibold whitespace-nowrap tabular-nums"
              style={{ left: `${poolPct}%`, color: D.amber }}
            >
              фонд {n(FUND.pool)}
            </span>
          </div>
        </div>

        {/* Roster */}
        <div className="mt-9 overflow-hidden rounded-2xl" style={DARK_GLASS}>
          {PEOPLE.map((p, i) => (
            <div
              key={p.name}
              className="grid grid-cols-[1.7fr_1fr_auto_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-white/[0.045]"
              style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.07)' : undefined }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold text-white"
                  style={{
                    background:
                      p.state === 'warn'
                        ? `linear-gradient(140deg, ${D.amber}, #d98a12)`
                        : `linear-gradient(140deg, ${D.accent}, ${D.violet})`,
                  }}
                >
                  {initials(p.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[11.5px]" style={{ color: D.faint }}>
                    {p.role}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="relative h-1.5 flex-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.10)' }}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${(p.rating / TOP_RATING) * 100}%`,
                      background:
                        p.state === 'warn'
                          ? D.amber
                          : `linear-gradient(90deg, ${D.accent}, ${D.violet})`,
                    }}
                  />
                </span>
                <span
                  className="w-11 shrink-0 text-right text-[12px] tabular-nums"
                  style={{ color: D.soft }}
                >
                  {p.rating.toLocaleString('uk-UA')}
                </span>
              </div>

              <input
                readOnly
                value={n(p.stake)}
                className="w-[70px] rounded-lg bg-transparent px-2.5 py-1.5 text-right text-[13px] font-semibold tabular-nums outline-none"
                style={{ color: D.ink, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)' }}
              />
              <span className="w-14 text-right text-[14px] font-bold tabular-nums">
                {n(p.stake + p.bonus, 3)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
