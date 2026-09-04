/**
 * «Поділ» — the screen drawn around what it actually does.
 *
 * Every other concept on /admin/design treats «Розподіл ставок» as a table with
 * a total on top. But the head of a кафедра is not reading a total: they are
 * **cutting one pool into named pieces**, and the interesting question is always
 * relative — who got more, how much is still uncut, how far past the фонд the
 * формула wants to go. A number and a ring both answer that badly. A single bar
 * split into named segments answers it before you have read anything.
 *
 * The form is deliberately one your users already know: the **iPhone storage
 * bar**. Whole thing, divided into labelled parts, the remainder pale at the
 * end. Nobody has to be taught what it means, and it does not look like it is
 * teaching them either — which matters for an audience of 25–60-year-olds who
 * use good software all day and can tell when an app is talking down to them.
 *
 * Everything else follows from keeping that bar honest:
 *
 * - **One hue, stepped.** The four segments are tints of the university's own
 *   #4472C4, not four different colours. They are parts of one quantity, so
 *   they get one hue — which is also this project's existing rule («colour
 *   marks a series»), and it stays readable for a colour-blind head.
 * - **The chip is the index.** Each person's tint reappears as a small square at
 *   the head of their row, so the bar and the table are one object rather than
 *   two views that happen to sit near each other.
 * - **Depth, not glass.** A hairline, a tight contact shadow and a wide ambient
 *   one. It reads as a real surface on any panel and costs no `backdrop-filter`,
 *   so the oldest laptop on the кафедра renders it identically.
 *
 * Type is **Wix Madefor** — Display for the figures and headings, Text for the
 * interface. A genuine superfamily with proper Cyrillic, drawn recently, and
 * warmer than the geometric grotesques every dashboard reaches for.
 *
 * Scale is a **modest** step up from the app today: body 15px against the
 * current 13–14, names 15px, table figures 16px. The hero is 46px because it is
 * the one number the whole screen is about. This is not an accessibility
 * concept — it is simply drawn at the size good software is drawn at.
 */

import { PEOPLE, TOP_RATING, FUND, n } from './concept-data';

const C = {
  bg: '#f5f6f8',
  card: '#ffffff',
  ink: '#101422',
  soft: '#596076',
  faint: '#878fa3',
  line: '#e6e8ee',
  accent: '#4472c4',
  accentInk: '#2f55a0',
  rest: '#e6e9f0',
  over: '#e8833b',
  overWash: '#fdf1e6',
  good: '#1f8a5b',
};

/** Tints of the one accent — deepest first, so rank reads down the bar */
const TINT = ['#2f55a0', '#4472c4', '#6b93dc', '#a9c4ee'];

/** Real surface: hairline, contact shadow, ambient shadow, top highlight */
const CARD: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.line}`,
  borderRadius: 16,
  boxShadow:
    '0 1px 2px rgba(16,20,34,0.04), 0 12px 32px -16px rgba(16,20,34,0.16), inset 0 1px 0 rgba(255,255,255,0.9)',
};

function Micro({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.085em',
        textTransform: 'uppercase',
        color: C.faint,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The pool, cut up.
 *
 * The track is scaled to what the формула asks for rather than to the фонд, so
 * the excess has somewhere to be drawn. The фонд itself is a marked edge partway
 * along; the hatched tail past it is the part the формула wants and the fund
 * cannot pay for. Overspending is legal here — the university's own sheet does
 * it — so it is drawn as a fact, not an error.
 */
function SplitBar({ shown, others }: { shown: number[]; others: number }) {
  const s = 100 / FUND.formula;
  const pool = FUND.pool * s;

  return (
    <div style={{ position: 'relative', marginTop: 22, paddingBottom: 22 }}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          gap: 2,
          height: 44,
          borderRadius: 12,
          background: C.rest,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {shown.map((v, i) => (
          <div
            key={i}
            style={{
              width: `${v * s}%`,
              background: TINT[i],
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
            }}
          />
        ))}
        <div
          style={{
            width: `${others * s}%`,
            background: '#c8d8f2',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
          }}
        />
        {/* the формула's excess, past the фонд */}
        <div
          style={{
            position: 'absolute',
            left: `${pool}%`,
            right: 0,
            top: 0,
            bottom: 0,
            background: `repeating-linear-gradient(115deg, ${C.overWash} 0 6px, #f8ddc2 6px 12px)`,
          }}
        />
      </div>

      {/* The фонд edge sits OUTSIDE the track: the track clips its own children
          so the segments keep the rounded ends, and this marker has to overhang
          them to read as a boundary rather than one more stripe inside the bar. */}
      <div
        style={{
          position: 'absolute',
          left: `${pool}%`,
          top: -4,
          height: 52,
          width: 2,
          background: C.ink,
          borderRadius: 2,
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: `${pool}%`,
          top: 54,
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: C.soft,
        }}
      >
        ФОНД {n(FUND.pool)}
      </div>
    </div>
  );
}

export function ConceptPodil() {
  // The four rows are a sample of a larger кафедра, so what they hold does not
  // add up to what is spent. The gap is drawn as «Інші» rather than quietly
  // rescaled — a bar that lies about its own total is worse than no bar.
  const shown = PEOPLE.map((p) => p.stake);
  const others = FUND.spent - shown.reduce((a, b) => a + b, 0);
  const left = FUND.pool - FUND.spent;

  return (
    <div
      style={{
        background: C.bg,
        color: C.ink,
        fontFamily: 'var(--dc-madefor-text)',
        fontSize: 15,
        padding: '22px 22px 26px',
      }}
    >
      {/* ── header ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span style={{ color: C.faint }}>Кафедри</span>
          <span style={{ color: '#c3c8d4' }}>/</span>
          <span style={{ fontWeight: 600 }}>Вищої математики</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              gap: 2,
              padding: 3,
              borderRadius: 10,
              background: '#eceef3',
              border: `1px solid ${C.line}`,
            }}
          >
            {['2024', '2025', '2026'].map((y) => {
              const on = y === '2026';
              return (
                <button
                  key={y}
                  style={{
                    padding: '5px 13px',
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                    border: 'none',
                    background: on ? C.card : 'transparent',
                    color: on ? C.ink : C.soft,
                    boxShadow: on ? '0 1px 2px rgba(16,20,34,0.10)' : undefined,
                  }}
                >
                  {y}
                </button>
              );
            })}
          </div>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: C.accentInk,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ДВ
          </span>
        </div>
      </div>

      {/* ── the pool, cut up ── */}
      <div style={{ ...CARD, padding: '22px 24px 18px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 24,
          }}
        >
          <div>
            <Micro>Роздано з фонду</Micro>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 7 }}>
              <span
                style={{
                  fontFamily: 'var(--dc-madefor-display)',
                  fontSize: 46,
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: '-0.03em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {n(FUND.spent)}
              </span>
              <span style={{ fontSize: 17, fontWeight: 500, color: C.faint }}>
                з {n(FUND.pool)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 30 }}>
            <div>
              <Micro>Нерозподілено</Micro>
              <div
                style={{
                  marginTop: 7,
                  fontSize: 22,
                  fontWeight: 600,
                  color: C.good,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {n(left)}
              </div>
            </div>
            <div>
              <Micro>За формулою</Micro>
              <div
                style={{
                  marginTop: 7,
                  fontSize: 22,
                  fontWeight: 600,
                  color: C.over,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {n(FUND.formula)}
              </div>
            </div>
          </div>
        </div>

        <SplitBar shown={shown} others={others} />

        {/* legend — the bar named, and the link to the table below */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px 20px',
            marginTop: 26,
            paddingTop: 15,
            borderTop: `1px solid ${C.line}`,
          }}
        >
          {PEOPLE.map((p, i) => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: TINT[i],
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 13.5, color: C.soft }}>{p.name.split(' ')[0]}</span>
              <span style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {n(p.stake)}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: '#c8d8f2',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 13.5, color: C.soft }}>Інші (11)</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {n(others)}
            </span>
          </div>
        </div>
      </div>

      {/* ── the people ── */}
      <div style={{ ...CARD, marginTop: 16, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px,1fr) minmax(130px,180px) auto',
            gap: 18,
            alignItems: 'center',
            padding: '11px 22px',
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          <Micro>Працівник</Micro>
          <Micro>Рейтинг 2025</Micro>
          <div style={{ textAlign: 'right' }}>
            <Micro>Ставка 2026</Micro>
          </div>
        </div>

        {PEOPLE.map((p, i) => (
          <div
            key={p.name}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(200px,1fr) minmax(130px,180px) auto',
              gap: 18,
              alignItems: 'center',
              padding: '13px 22px',
              borderTop: i === 0 ? undefined : `1px solid ${C.line}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              {/* the same chip as the bar — one object, two places */}
              <span
                style={{
                  width: 8,
                  height: 34,
                  borderRadius: 4,
                  background: TINT[i],
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{p.name}</div>
                <div style={{ fontSize: 13, color: C.faint, marginTop: 1 }}>{p.role}</div>
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.2,
                }}
              >
                {p.rating.toLocaleString('uk-UA')}
              </div>
              <div
                style={{
                  marginTop: 6,
                  height: 5,
                  borderRadius: 3,
                  background: C.rest,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${(p.rating / TOP_RATING) * 100}%`,
                    height: '100%',
                    background: TINT[i],
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>

            {/* one control, not three — the value lives inside the stepper */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                borderRadius: 10,
                border: `1px solid ${C.line}`,
                background: C.card,
                boxShadow: '0 1px 2px rgba(16,20,34,0.04)',
                overflow: 'hidden',
              }}
            >
              <button
                aria-label={`Зменшити: ${p.name}`}
                style={{
                  width: 34,
                  height: 36,
                  border: 'none',
                  background: 'transparent',
                  color: C.soft,
                  fontSize: 17,
                  lineHeight: 1,
                }}
              >
                −
              </button>
              <div
                style={{
                  minWidth: 58,
                  textAlign: 'center',
                  fontSize: 16,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  borderLeft: `1px solid ${C.line}`,
                  borderRight: `1px solid ${C.line}`,
                  padding: '8px 0',
                }}
              >
                {n(p.stake)}
              </div>
              <button
                aria-label={`Збільшити: ${p.name}`}
                style={{
                  width: 34,
                  height: 36,
                  border: 'none',
                  background: 'transparent',
                  color: C.soft,
                  fontSize: 17,
                  lineHeight: 1,
                }}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── footer ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          marginTop: 16,
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: C.soft }}
        >
          <span
            aria-hidden
            style={{ width: 7, height: 7, borderRadius: '50%', background: C.over, flexShrink: 0 }}
          />
          Формула просить {n(FUND.formula)} — на {n(FUND.formula - FUND.pool)} більше за фонд
        </div>

        <button
          style={{
            height: 40,
            padding: '0 20px',
            borderRadius: 10,
            border: 'none',
            background: C.accent,
            color: '#fff',
            fontSize: 14.5,
            fontWeight: 600,
            boxShadow: '0 1px 2px rgba(16,20,34,0.10), 0 6px 16px -8px rgba(68,114,196,0.7)',
          }}
        >
          Зберегти ставки
        </button>
      </div>
    </div>
  );
}
