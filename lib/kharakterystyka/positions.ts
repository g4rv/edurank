// The 20 positions of п.38 of the Ліцензійні умови (постанова КМУ 1187-2015,
// ред. 365 від 24.03.2021) — the document the university calls
// «Характеристика рівня наукової та професійної активності викладача».
//
// The Ukrainian titles are the law's own wording, copied verbatim from the
// filled document at `edu-reference/csv/… - Характеристика_РНПАВ.csv`. They are
// DATA, not UI text, and must not be reworded: the printed report is read
// against the law, and a paraphrase there is a defect.
//
// ── What lives here, and what does not ──────────────────────────────────────
//
// Here:   what each position REQUIRES — five publications, three навчально-
//         методичні праці, one patent or five свідоцтва. That is the law's text
//         and it is identical for every template year.
//
// Not here: WHICH indicators feed a position. That is `ActivityType.
//         licencePositions`, a JSON column an admin edits in /admin/rating/[year].
//         Keeping it out of code is deliberate: `requiresVerification` and
//         `entityFirstEntry` were both code lists once, and each silently
//         excluded any indicator an admin built themselves. A вчена рада that
//         votes in a new publication indicator must be able to point it at
//         position 1 without a deploy.

import { PAGES_PER_AUTHOR_SHEET } from '@/lib/rating/scoring';

/** How a position gets its content */
export type PositionFill =
  /** From rating entries, via ActivityType.licencePositions */
  | 'DERIVED'
  /** From a Staff profile column (only п.5, the defence date) */
  | 'PROFILE'
  /** Typed by hand — the rating genuinely does not hold it */
  | 'MANUAL'
  /** «для вищих військових навчальних закладів» — never applies here */
  | 'NOT_APPLICABLE';

/** The part of an activity a position rule is allowed to look at */
export interface PositionRow {
  year: number;
  evidence: Record<string, unknown>;
}

/**
 * One way of satisfying a position. A position is met when ANY of its
 * alternatives is — п.2 asks for one patent OR five свідоцтва, which is two
 * different thresholds over two different sets of indicators.
 *
 * `group` is matched against `LicencePositionLink.group` on the indicator, so
 * which indicators belong to which alternative stays admin-editable while the
 * threshold stays here.
 */
export interface PositionAlternative {
  group: string;
  /**
   * The alternative's name, for the one screen that has to ask which of them a
   * row belongs to — the hand-typed evidence form. `group` is a JSON key on the
   * indicator and must not change; this is the sentence a person reads.
   */
  label: string;
  /** How many qualifying entries the law asks for */
  min: number;
  /**
   * An extra per-entry condition the law imposes and the evidence can answer.
   * Only п.3 has one; everything else counts every matched row.
   */
  rowTest?: (row: PositionRow) => boolean;
  /** Shown next to an unmet position, so «why does this not count?» is answerable */
  rowTestNote?: string;
}

export interface LicencePositionDef {
  /** 1–20, the printed «№ з/п» */
  number: number;
  /** The law's wording, verbatim */
  title: string;
  fill: PositionFill;
  /** Empty for every fill mode but DERIVED */
  alternatives: PositionAlternative[];
  /** Why a non-derived position is not auto-filled — shown on screen */
  note?: string;
}

/** The default alternative an indicator lands in when it names no group */
export const DEFAULT_GROUP = 'main';

// ─── The indicator → position link (stored on ActivityType.licencePositions) ──

/**
 * Restricts a link to entries whose evidence field holds one of these values.
 *
 * Exists for indicator 2.2 «Видання, затверджені вченою радою університету»,
 * which is a single indicator whose chosen `option` decides which position it
 * feeds: підручник / навчальний посібник satisfy п.3, while навчально-методичний
 * посібник / методичні рекомендації satisfy п.4. Without a condition the same
 * методичка would count towards a підручник requirement.
 */
export interface LicencePositionCondition {
  /** Machine name of the evidence field to read (usually `option`) */
  field: string;
  /** Values that qualify; anything else does not feed this position */
  in: readonly string[];
}

/**
 * One indicator satisfying one position. Stored as JSON on the ActivityType row
 * — see `validations/licence-positions.ts` for the schema and why it is a
 * column rather than a list in code.
 */
export interface LicencePositionLink {
  position: number;
  /**
   * Which alternative inside the position. Positions with a single threshold
   * leave it out; п.2 needs it, because one patent and five свідоцтва are
   * different bars over different indicators.
   */
  group?: string;
  when?: LicencePositionCondition;
}

/** The alternative this link belongs to */
export function groupOf(link: LicencePositionLink): string {
  return link.group ?? DEFAULT_GROUP;
}

/**
 * Does this entry's evidence satisfy the link's condition? A link with no
 * condition accepts every entry of its indicator.
 */
export function linkMatches(link: LicencePositionLink, evidence: Record<string, unknown>): boolean {
  if (!link.when) return true;
  const value = evidence[link.when.field];
  return typeof value === 'string' && link.when.in.includes(value);
}

/**
 * п.3: «загальним обсягом не менше 5 авторських аркушів, в тому числі видані у
 * співавторстві (обсягом не менше 1,5 авторського аркуша на кожного співавтора)».
 *
 * Two conditions on one row, and the evidence already carries both halves —
 * `pages` and `coAuthors` are what the page-based scoring rule reads. Total
 * volume is `pages / 24`; this person's share of it is that divided by the
 * number of co-authors, which is exactly `authorSheets` in the scoring engine.
 *
 * A row missing `pages` fails rather than throwing: the Характеристика is a
 * read-only view over data somebody else typed, and one malformed row must not
 * take the whole document down.
 */
function hasFiveAuthorSheets(row: PositionRow): boolean {
  const pages = Number(row.evidence.pages);
  if (!Number.isFinite(pages) || pages <= 0) return false;

  const total = pages / PAGES_PER_AUTHOR_SHEET;
  if (total < 5) return false;

  const coAuthors = Number(row.evidence.coAuthors);
  const share = Number.isFinite(coAuthors) && coAuthors > 1 ? total / coAuthors : total;
  return share >= 1.5;
}

// Nineteen of the twenty positions have a single way of being met, so nothing
// ever asks the reader to choose between alternatives there. The label is still
// required, so that adding a second alternative cannot leave the first nameless.
const MAIN_LABEL = 'Основний показник';

const FIVE_SHEETS_NOTE = 'Зараховуються лише видання обсягом ≥ 5 авт. арк. (≥ 1,5 на співавтора)';

export const LICENCE_POSITIONS: readonly LicencePositionDef[] = [
  {
    number: 1,
    title:
      'Наявність не менше п’яти публікацій у періодичних наукових виданнях, що включені до переліку фахових видань України, до наукометричних баз, зокрема Scopus, Web of Science Core Collection',
    fill: 'DERIVED',
    alternatives: [{ group: DEFAULT_GROUP, label: MAIN_LABEL, min: 5 }],
  },
  {
    number: 2,
    title:
      'Наявність одного патенту на винахід або п’яти деклараційних патентів на винахід чи корисну модель, включаючи секретні, або наявність не менше п’яти свідоцтв про реєстрацію авторського права на твір',
    fill: 'DERIVED',
    // Three thresholds in one sentence, and the law's own order. A патент на
    // винахід is examined and counts alone; a деклараційний is not, and five are
    // asked for — which is why indicator 3.25 carries a «Вид патенту» select
    // rather than feeding the first bar with every patent it holds. Before that
    // select existed one патент на корисну модель printed as «Виконано»
    // (owner, 2026-09-01).
    alternatives: [
      { group: 'patent', label: 'Патент на винахід', min: 1 },
      {
        group: 'declarative',
        label: 'Деклараційний патент на винахід чи корисну модель',
        min: 5,
      },
      {
        group: 'copyright',
        label: 'Свідоцтво про реєстрацію авторського права на твір',
        min: 5,
      },
    ],
  },
  {
    number: 3,
    title:
      'Наявність виданого підручника чи навчального посібника (включаючи електронні) або монографії (загальним обсягом не менше 5 авторських аркушів), в тому числі видані у співавторстві (обсягом не менше 1,5 авторського аркуша на кожного співавтора)',
    fill: 'DERIVED',
    alternatives: [
      {
        group: DEFAULT_GROUP,
        label: MAIN_LABEL,
        min: 1,
        rowTest: hasFiveAuthorSheets,
        rowTestNote: FIVE_SHEETS_NOTE,
      },
    ],
  },
  {
    number: 4,
    title:
      'Наявність виданих навчально-методичних посібників / посібників для самостійної роботи здобувачів вищої освіти та дистанційного навчання, електронних курсів на освітніх платформах ліцензіатів, конспектів лекцій/практикумів/методичних вказівок/рекомендацій / робочих програм, інших друкованих навчально-методичних праць загальною кількістю три найменування',
    fill: 'DERIVED',
    alternatives: [{ group: DEFAULT_GROUP, label: MAIN_LABEL, min: 3 }],
  },
  {
    number: 5,
    title: 'Захист дисертації на здобуття наукового ступеня',
    fill: 'PROFILE',
    alternatives: [],
    // One date, for the highest degree only (decided 2026-08-07). That is enough
    // for a «within the last five years» test: the highest degree is also the
    // most recent one, so if it falls outside the window no earlier defence
    // falls inside it either.
    note: 'Заповнюється з профілю — дата захисту дисертації',
  },
  {
    number: 6,
    title:
      'Наукове керівництво (консультування) здобувача, який одержав документ про присудження наукового ступеня',
    fill: 'DERIVED',
    alternatives: [{ group: DEFAULT_GROUP, label: MAIN_LABEL, min: 1 }],
  },
  {
    number: 7,
    title:
      'Участь в атестації наукових кадрів як офіційного опонента або члена постійної спеціалізованої вченої ради, або члена не менше трьох разових спеціалізованих вчених рад',
    fill: 'DERIVED',
    alternatives: [{ group: DEFAULT_GROUP, label: MAIN_LABEL, min: 1 }],
  },
  {
    number: 8,
    title:
      'Виконання функцій (повноважень, обов’язків) наукового керівника або відповідального виконавця наукової теми (проекту), або головного редактора/члена редакційної колегії/експерта (рецензента) наукового видання, включеного до переліку фахових видань України, або іноземного наукового видання, що індексується в бібліографічних базах',
    fill: 'DERIVED',
    alternatives: [{ group: DEFAULT_GROUP, label: MAIN_LABEL, min: 1 }],
  },
  {
    number: 9,
    title:
      'Робота у складі експертної ради з питань проведення експертизи дисертацій МОН або у складі галузевої експертної ради як експерта Національного агентства із забезпечення якості вищої освіти, або у складі Акредитаційної комісії, або міжгалузевої експертної ради з вищої освіти Акредитаційної комісії, або трьох експертних комісій МОН/зазначеного Агентства, або Науково-методичної ради/науково-методичних/експертних рад органів державної влади та органів місцевого самоврядування, або у складі комісій Державної служби якості освіти із здійснення планових (позапланових) заходів державного нагляду (контролю)',
    fill: 'DERIVED',
    alternatives: [{ group: DEFAULT_GROUP, label: MAIN_LABEL, min: 1 }],
  },
  {
    number: 10,
    title:
      'Участь у міжнародних наукових та/або освітніх проектах, залучення до міжнародної експертизи, наявність звання “суддя міжнародної категорії”',
    fill: 'DERIVED',
    alternatives: [{ group: DEFAULT_GROUP, label: MAIN_LABEL, min: 1 }],
  },
  {
    number: 11,
    title:
      'Наукове консультування підприємств, установ, організацій не менше трьох років, що здійснювалося на підставі договору із закладом вищої освіти (науковою установою)',
    fill: 'DERIVED',
    // The «не менше трьох років» condition lives inside indicator 3.18 itself,
    // so a row existing already means the condition held.
    alternatives: [{ group: DEFAULT_GROUP, label: MAIN_LABEL, min: 1 }],
  },
  {
    number: 12,
    title:
      'Наявність апробаційних та/або науково-популярних, та/або консультаційних (дорадчих), та/або науково-експертних публікацій з наукової або професійної тематики загальною кількістю не менше п’яти публікацій',
    fill: 'DERIVED',
    alternatives: [{ group: DEFAULT_GROUP, label: MAIN_LABEL, min: 5 }],
  },
  {
    number: 13,
    title:
      'Проведення навчальних занять із спеціальних дисциплін іноземною мовою (крім дисциплін мовної підготовки) в обсязі не менше 50 аудиторних годин на навчальний рік',
    fill: 'DERIVED',
    // Indicator 2.3 carries its own hours condition — but at 30 hours, where the
    // law asks 50. The rating rewards a lower bar than the licence requires, so
    // a row here is necessary and not sufficient; flagged rather than silently
    // trusted. See the note rendered beside the position.
    alternatives: [{ group: DEFAULT_GROUP, label: MAIN_LABEL, min: 1 }],
    note: 'Показник 2.3 враховує від 30 годин, а ліцензійна умова вимагає 50 — перевірте обсяг',
  },
  {
    number: 14,
    title:
      'Керівництво студентом, який зайняв призове місце на I або ІІ етапі Всеукраїнської студентської олімпіади (Всеукраїнського конкурсу студентських наукових робіт), або робота у складі організаційного комітету / журі Всеукраїнської студентської олімпіади (Всеукраїнського конкурсу студентських наукових робіт), або керівництво постійно діючим студентським науковим гуртком / проблемною групою; керівництво студентом, який став призером або лауреатом Міжнародних, Всеукраїнських мистецьких конкурсів, (мистецького та спортивного спрямування)',
    fill: 'DERIVED',
    alternatives: [{ group: DEFAULT_GROUP, label: MAIN_LABEL, min: 1 }],
  },
  {
    number: 15,
    title:
      'Керівництво школярем, який зайняв призове місце III—IV етапу Всеукраїнських учнівських олімпіад з базових навчальних предметів, II—III етапу Всеукраїнських конкурсів-захистів науково-дослідницьких робіт учнів — членів Національного центру “Мала академія наук України”; участь у журі III—IV етапу Всеукраїнських учнівських олімпіад з базових навчальних предметів чи II—III етапу Всеукраїнських конкурсів-захистів науково-дослідницьких робіт учнів — членів Національного центру “Мала академія наук України” (крім третього (освітньо-наукового / освітньо-творчого) рівня)',
    fill: 'MANUAL',
    alternatives: [],
    // Such НПП exist (confirmed 2026-08-07), and no rating indicator was added
    // for them on purpose: the catalogue belongs to the вчена рада and moves
    // only by their vote. The work stays invisible to the rating and is typed
    // here by hand.
    note: 'Рейтинг не веде роботу зі школярами — вноситься вручну',
  },
  {
    number: 16,
    title:
      'Наявність статусу учасника бойових дій (для вищих військових навчальних закладів, закладів вищої освіти із специфічними умовами навчання, військових навчальних підрозділів закладів вищої освіти)',
    fill: 'NOT_APPLICABLE',
    alternatives: [],
    note: 'Для вищих військових навчальних закладів',
  },
  {
    number: 17,
    title:
      'Участь у міжнародних операціях з підтримання миру і безпеки під егідою Організації Об’єднаних Націй (для вищих військових навчальних закладів, закладів вищої освіти із специфічними умовами навчання, військових навчальних підрозділів закладів вищої освіти)',
    fill: 'NOT_APPLICABLE',
    alternatives: [],
    note: 'Для вищих військових навчальних закладів',
  },
  {
    number: 18,
    title:
      'Участь у міжнародних військових навчаннях (тренуваннях) за участю збройних сил країн — членів НАТО (для вищих військових навчальних закладів, військових навчальних підрозділів закладів вищої освіти)',
    fill: 'NOT_APPLICABLE',
    alternatives: [],
    note: 'Для вищих військових навчальних закладів',
  },
  {
    number: 19,
    title:
      'Діяльність за спеціальністю у формі участі у професійних та/або громадських об’єднаннях',
    fill: 'DERIVED',
    alternatives: [{ group: DEFAULT_GROUP, label: MAIN_LABEL, min: 1 }],
  },
  {
    number: 20,
    title:
      'Досвід практичної роботи за спеціальністю не менше п’яти років (крім педагогічної, науково-педагогічної, наукової діяльності)',
    fill: 'MANUAL',
    alternatives: [],
    // Nobody qualifies today (confirmed 2026-08-07), so no кадри import was
    // built for it. True today, not forever — one hire changes it, and the cost
    // of being wrong is one person typing one field.
    note: 'Кадрові дані — вноситься вручну',
  },
];

/** How many of the 20 must be met for `Кнпп` in the ставка formula */
export const REQUIRED_POSITIONS = 4;

/** The window the document covers: «за останні 5 років» */
export const WINDOW_YEARS = 5;

export function licencePosition(number: number): LicencePositionDef | undefined {
  return LICENCE_POSITIONS.find((p) => p.number === number);
}

/** Inclusive year range ending at `lastYear`, e.g. 2026 → [2022, 2026] */
export function windowFor(lastYear: number): { from: number; to: number } {
  return { from: lastYear - WINDOW_YEARS + 1, to: lastYear };
}

/**
 * The alternatives a hand-typed row must choose between — empty when there is
 * nothing to choose.
 *
 * Nineteen positions have one way of being met, so the form asks nothing and the
 * row lands on that alternative by itself (`group: null`, resolved in `build.ts`).
 * Only п.2 asks: a патент на винахід counts alone, five деклараційних are needed,
 * and five свідоцтв — a row cannot be counted until somebody says which it is.
 */
export function positionChoices(number: number): readonly PositionAlternative[] {
  const def = licencePosition(number);
  return def && def.alternatives.length > 1 ? def.alternatives : [];
}

/**
 * The alternative's name, for listing a typed row back to whoever typed it.
 * Null where there was no choice to make, so the ordinary position shows nothing.
 */
export function alternativeLabel(number: number, group: string | null): string | null {
  const choices = positionChoices(number);
  if (choices.length === 0) return null;
  const chosen = group === null ? choices[0] : choices.find((a) => a.group === group);
  return chosen?.label ?? null;
}

/**
 * May a row of this position carry this group? Null always may — it means «the
 * position's first alternative», which is what every single-alternative position
 * stores. A name that is not one of the position's own alternatives never may:
 * it would land the row in a bucket nothing reads, and the person who typed it
 * would see a save that changed no status.
 */
export function isPositionGroup(number: number, group: string | null): boolean {
  if (group === null) return true;
  return licencePosition(number)?.alternatives.some((a) => a.group === group) ?? false;
}
