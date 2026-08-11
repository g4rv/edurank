/**
 * «Панель» — a modern product dashboard, in the Stripe / Linear register.
 *
 * What separates this from the shadcn default is not the palette, it is the
 * surface craft: layered elevation instead of a single flat border, an inset
 * hairline on every raised plane, a segmented control that actually slides, a
 * delta chip beside each headline figure, and a sparkline carrying the trend so
 * the number does not have to. Chrome stays quiet; the accent appears perhaps
 * six times on the whole screen and every one of them is load-bearing.
 *
 * The accent is the university's own #4472C4 — the blue their circulated Word
 * reports already use for a chart series (see CLAUDE.md). Adopting it as the
 * product accent means screen, print and PDF finally read as one system,
 * instead of the app borrowing a generic SaaS indigo that appears nowhere else
 * in the institution.
 *
 * Self-contained hex, not theme tokens: this is a proposal to look at, not a
 * skin that has to survive the dark-mode toggle yet.
 */

import { PEOPLE, TOP_RATING as TOP, FUND, n, initials } from './concept-data';

const A = {
  bg: '#f6f7f9',
  card: '#ffffff',
  ink: '#101828',
  soft: '#667085',
  faint: '#98a2b3',
  line: '#e4e7ec',
  hair: '#f2f4f7',
  accent: '#4472c4',
  accentDeep: '#3a5aa8',
  accentTint: '#eef2fb',
  ok: '#12b76a',
  okTint: '#ecfdf3',
  warn: '#f79009',
  warnTint: '#fffaeb',
};

/** Stripe-style elevation: a tight contact shadow over a wider ambient one */
const RAISED = {
  boxShadow: '0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.10)',
};
const LIFTED = {
  boxShadow: '0 1px 3px rgba(16,24,40,0.08), 0 8px 24px -6px rgba(16,24,40,0.10)',
};

/** Inline trend line with a soft area beneath — no chart library for 72×24px */
function Spark({ points, tone }: { points: number[]; tone: string }) {
  const w = 68;
  const h = 22;
  const hi = Math.max(...points);
  const lo = Math.min(...points);
  const span = hi - lo || 1;
  const xy = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - 2 - ((p - lo) / span) * (h - 5);
    return [x, y] as const;
  });
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const id = `sp${points.join('')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.22" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={tone}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="2" fill={tone} />
    </svg>
  );
}

/** Small delta pill — the one place besides status where hue is allowed */
function Delta({ value, up }: { value: string; up: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
      style={{
        color: up ? A.ok : A.warn,
        background: up ? A.okTint : A.warnTint,
      }}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" style={{ transform: up ? '' : 'rotate(180deg)' }}>
        <path d="M4 0.5 L7.5 6 L0.5 6 Z" fill="currentColor" />
      </svg>
      {value}
    </span>
  );
}

function Stat({
  label,
  value,
  delta,
  up,
  trend,
  primary,
}: {
  label: string;
  value: string;
  delta?: string;
  up?: boolean;
  trend?: number[];
  primary?: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl px-4 py-3.5"
      style={{
        ...RAISED,
        background: primary
          ? `linear-gradient(160deg, ${A.accent} 0%, ${A.accentDeep} 100%)`
          : A.card,
        // The inset hairline is what makes a raised plane read as a plane
        boxShadow: primary
          ? '0 1px 2px rgba(16,24,40,0.10), 0 6px 20px -6px rgba(68,114,196,0.45), inset 0 1px 0 rgba(255,255,255,0.16)'
          : `${RAISED.boxShadow}, inset 0 1px 0 #ffffff`,
      }}
    >
      <div
        className="text-[11px] font-medium tracking-[0.04em] uppercase"
        style={{ color: primary ? 'rgba(255,255,255,0.72)' : A.soft }}
      >
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div
          className="text-[26px] leading-none font-semibold tabular-nums"
          style={{
            color: primary ? '#fff' : A.ink,
            fontFamily: 'var(--dc-geologica)',
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </div>
        {trend && <Spark points={trend} tone={primary ? 'rgba(255,255,255,0.85)' : A.accent} />}
      </div>
      {delta && (
        <div className="mt-2.5 flex items-center gap-1.5">
          {primary ? (
            <span className="rounded-full bg-white/18 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              {delta}
            </span>
          ) : (
            <Delta value={delta} up={!!up} />
          )}
          <span
            className="text-[11.5px]"
            style={{ color: primary ? 'rgba(255,255,255,0.7)' : A.faint }}
          >
            проти 2025
          </span>
        </div>
      )}
    </div>
  );
}

export function ConceptPanel() {
  // The bar's axis runs to the formula total, not to the pool, so the overspend
  // has somewhere to be drawn. A track that stops at the pool can only ever show
  // «full», which is exactly the fact this screen needs to communicate.
  const { pool, spent, formula } = FUND;
  const spentPct = (spent / formula) * 100;
  const poolPct = (pool / formula) * 100;

  return (
    <div
      className="relative px-6 py-5"
      style={{ background: A.bg, color: A.ink, fontFamily: 'var(--dc-onest)' }}
    >
      {/* A single soft wash behind the header — atmosphere, not decoration */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{
          background:
            'radial-gradient(60% 100% at 20% 0%, rgba(68,114,196,0.10) 0%, rgba(68,114,196,0) 70%)',
        }}
      />

      <div className="relative">
        {/* ── Top bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px]">
            <span style={{ color: A.faint }}>Кафедри</span>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke={A.faint} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="font-medium">Вищої математики</span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Segmented control — the white pill is what makes it feel modern */}
            <div
              className="flex items-center gap-0.5 rounded-lg p-0.5"
              style={{ background: A.hair, boxShadow: 'inset 0 0 0 1px rgba(16,24,40,0.04)' }}
            >
              {['2024', '2025', '2026'].map((y) => (
                <button
                  key={y}
                  className="rounded-[6px] px-2.5 py-1 text-[12.5px] font-medium tabular-nums"
                  style={
                    y === '2026'
                      ? { background: A.card, color: A.ink, ...RAISED }
                      : { color: A.soft }
                  }
                >
                  {y}
                </button>
              ))}
            </div>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-[11.5px] font-semibold"
              style={{ background: A.accentTint, color: A.accentDeep }}
            >
              ДВ
            </div>
          </div>
        </div>

        {/* ── Headline ── */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              className="text-[22px] leading-tight font-semibold"
              style={{ fontFamily: 'var(--dc-geologica)', letterSpacing: '-0.02em' }}
            >
              Розподіл ставок
            </h2>
            <p className="mt-0.5 text-[13px]" style={{ color: A.soft }}>
              18 НПП · Кнпп 8 · оновлено 10 серпня, 14:22
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg px-3 py-2 text-[13px] font-medium"
              style={{ background: A.card, color: A.ink, ...RAISED }}
            >
              До формули
            </button>
            <button
              className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white"
              style={{
                background: `linear-gradient(180deg, ${A.accent} 0%, ${A.accentDeep} 100%)`,
                boxShadow:
                  '0 1px 2px rgba(16,24,40,0.12), 0 4px 12px -2px rgba(68,114,196,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
              }}
            >
              Зберегти
            </button>
          </div>
        </div>

        {/* ── Stat row ── */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          <Stat label="Виділені ставки" value="4,00" delta="без змін" primary />
          <Stat
            label="Розподілено"
            value="3,10"
            delta="77,5%"
            up
            trend={[20, 34, 30, 48, 55, 60, 68, 78]}
          />
          <Stat
            label="Нерозподілено"
            value="0,90"
            delta="−0,35"
            up={false}
            trend={[55, 50, 44, 40, 36, 30, 26, 22]}
          />
          <Stat
            label="Середній рейтинг"
            value="5 101"
            delta="+12,4%"
            up
            trend={[30, 33, 31, 38, 42, 45, 50, 56]}
          />
        </div>

        {/* ── Pool meter: one bar answers «скільки лишилось» ── */}
        <div
          className="mt-3 rounded-xl px-4 py-3.5"
          style={{
            background: A.card,
            ...RAISED,
            boxShadow: `${RAISED.boxShadow}, inset 0 1px 0 #fff`,
          }}
        >
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="font-medium">Заповнення фонду</span>
            <span className="tabular-nums" style={{ color: A.soft }}>
              3,10 з 4,00 · лишилось <span style={{ color: A.ok, fontWeight: 600 }}>0,90</span>
            </span>
          </div>
          <div className="relative mt-3 mb-1 h-2.5">
            <div className="absolute inset-0 rounded-full" style={{ background: A.hair }} />
            {/* Everything past the pool is overspend territory */}
            <div
              className="absolute inset-y-0 rounded-r-full"
              style={{
                left: `${poolPct}%`,
                right: 0,
                background: A.warnTint,
                borderLeft: `2px solid ${A.warn}`,
              }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${spentPct}%`,
                background: `linear-gradient(90deg, ${A.accent} 0%, ${A.accentDeep} 100%)`,
              }}
            />
            {/* The pool edge, labelled — the number a head must not cross */}
            <span
              className="absolute top-[14px] -translate-x-1/2 text-[10.5px] font-medium whitespace-nowrap tabular-nums"
              style={{ left: `${poolPct}%`, color: A.warn }}
            >
              фонд 4,00
            </span>
          </div>
          <div className="mt-5 flex items-center gap-1.5 text-[11.5px]" style={{ color: A.faint }}>
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: A.warn }}
            />
            Формула без правок дала б 4,90 — на 0,90 більше за фонд
          </div>
        </div>

        {/* ── The table ── */}
        <div className="mt-3 overflow-hidden rounded-xl" style={{ background: A.card, ...LIFTED }}>
          <div
            className="grid grid-cols-[1.6fr_0.9fr_0.7fr_0.6fr_0.6fr] items-center gap-3 px-4 py-2.5 text-[11px] font-medium tracking-[0.04em] uppercase"
            style={{ color: A.faint, borderBottom: `1px solid ${A.line}` }}
          >
            <span>НПП</span>
            <span>Рейтинг</span>
            <span className="text-right">Ставка</span>
            <span className="text-right">Бонус</span>
            <span className="text-right">Разом</span>
          </div>

          {PEOPLE.map((p, i) => (
            <div
              key={p.name}
              className="grid grid-cols-[1.6fr_0.9fr_0.7fr_0.6fr_0.6fr] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#fafbfc]"
              style={{ borderBottom: i < PEOPLE.length - 1 ? `1px solid ${A.hair}` : undefined }}
            >
              {/* Identity: avatar, name, and the qualification underneath */}
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={{ background: A.accentTint, color: A.accentDeep }}
                >
                  {initials(p.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium">{p.name}</span>
                  <span className="block truncate text-[11.5px]" style={{ color: A.faint }}>
                    {p.role}
                  </span>
                </span>
              </div>

              {/* Rating: the bar does the comparing, the figure confirms it */}
              <div className="flex items-center gap-2.5">
                <span className="relative h-1.5 flex-1 rounded-full" style={{ background: A.hair }}>
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${(p.rating / TOP) * 100}%`,
                      background: p.state === 'warn' ? A.warn : A.accent,
                    }}
                  />
                </span>
                <span
                  className="w-11 shrink-0 text-right text-[12px] tabular-nums"
                  style={{ color: A.soft }}
                >
                  {p.rating.toLocaleString('uk-UA')}
                </span>
              </div>

              {/* Editable cell reads as editable even at rest */}
              <div className="flex justify-end">
                <input
                  readOnly
                  value={n(p.stake)}
                  className="w-[68px] rounded-lg px-2 py-1 text-right text-[13px] font-medium tabular-nums outline-none"
                  style={{
                    background: A.card,
                    color: A.ink,
                    boxShadow: `inset 0 0 0 1px ${A.line}, 0 1px 2px rgba(16,24,40,0.04)`,
                  }}
                />
              </div>

              <span
                className="text-right text-[13px] tabular-nums"
                style={{ color: p.bonus ? A.ink : A.faint }}
              >
                {p.bonus ? `+${n(p.bonus, 3)}` : '—'}
              </span>

              <span
                className="text-right text-[13.5px] font-semibold tabular-nums"
                style={{ fontFamily: 'var(--dc-geologica)' }}
              >
                {n(p.stake + p.bonus, 3)}
              </span>
            </div>
          ))}

          <div
            className="flex items-center justify-between px-4 py-2.5 text-[12.5px]"
            style={{ background: '#fcfcfd', borderTop: `1px solid ${A.line}` }}
          >
            <span style={{ color: A.soft }}>Показано 4 з 18</span>
            <span className="font-semibold tabular-nums">3,100</span>
          </div>
        </div>
      </div>
    </div>
  );
}
