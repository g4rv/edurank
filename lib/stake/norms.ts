// Норматив чисельності здобувачів на 1 ставку — додаток 5 of the ПОЛОЖЕННЯ про
// систему розподілу ставок, which in turn derives from постанова КМУ 1134-2002.
//
// The whole table is ONE number per speciality. Verified against all 38 rows of
// `edu-reference/Рейтинг_Профорієнтація.xlsx`, sheet «НормативЧисельності»:
// every printed column follows the law's own multipliers off a single base, with
// no exceptions. So the model stores one `base` and derives the rest — four
// stored columns would be four chances to disagree with each other.

/** Освітній рівень of a recruited student */
export type StudentDegree = 'BACHELOR' | 'MASTER';

/** Форма навчання */
export type StudyForm = 'FULL_TIME' | 'PART_TIME';

/** Держзамовлення — бюджет чи контракт */
export type Funding = 'STATE' | 'CONTRACT';

/**
 * The норматив for one kind of student.
 *
 * ```
 * norm = base × (магістр ? 0.5 : 1) × (заочна ? 4 : 1)
 * ```
 *
 * Постанова 1134 also defines ×2 for вечірня, −10% for спеціаліст and −15% for
 * foreign full-time students. None apply here today — there is no evening form
 * and no спеціаліст level — but they are the reason this is a function over a
 * base rather than four stored columns.
 */
export function normFor(base: number, degree: StudentDegree, form: StudyForm): number {
  return base * (degree === 'MASTER' ? 0.5 : 1) * (form === 'PART_TIME' ? 4 : 1);
}

/**
 * What one recruited student adds to their recruiter's ставка — the second term
 * of the formula, per student.
 *
 * ```
 * value = 1 / norm(speciality, degree, form)      бюджет
 *       = that × contractCoefficient              контракт
 * ```
 *
 * **This is the measured behaviour, not the положення's.** The положення prints
 * `Nзд / (2·Nд)` for денна; the university does not apply that factor of 2, and
 * the owner confirmed the measurement is right (2026-08-07). 1389 rows of
 * `Рейтинг_Профорієнтація.xlsx` show денна бюджет recorded at exactly `1/Nд`.
 *
 * Full precision on purpose — round only for display and export. Summing
 * rounded values is what produced the old system's negative «нерозподілено».
 */
export function studentValue(
  base: number,
  degree: StudentDegree,
  form: StudyForm,
  funding: Funding,
  contractCoefficient: number
): number {
  const norm = normFor(base, degree, form);
  if (!Number.isFinite(norm) || norm <= 0) return 0;
  const value = 1 / norm;
  return funding === 'CONTRACT' ? value * contractCoefficient : value;
}

/**
 * The узгоджуючий коефіцієнт for контракт students, as of 2026: **0.175**.
 *
 * Confirmed by the owner 2026-08-07 and measured independently — every 2026 row
 * of «бакалавр денна контракт» is exactly 0.175 of the budget value. It is a
 * per-year setting the вчена рада can move, so this is only the seed.
 */
export const DEFAULT_CONTRACT_COEFFICIENT = 0.175;

/**
 * Додаток 5, verbatim — speciality name and its base норматив.
 *
 * **A speciality belongs to no кафедра.** An НПП may recruit a student onto any
 * programme in the university, not only the ones their own кафедра teaches
 * (confirmed 2026-08-10), and the bonus follows the RECRUITER wherever the
 * student ends up studying. That is why there is no `departmentId` on
 * `Speciality` and why the picker on «Мої залучені здобувачі» must offer the
 * whole list — filtering it to the recruiter's own кафедра would silently make
 * most of their work unclaimable.
 *
 * Seed data, not constants: the вчена рада approves this table every year and
 * the app must follow whatever it approves, so at runtime the `SpecialityNorm`
 * rows decide.
 *
 * Two things NOT to "fix" against постанова 1134 (both confirmed 2026-08-07):
 *
 * - **Менеджмент is 12 here and 13 in the law.** Додаток 5 wins. A smaller
 *   норматив makes each recruited student worth more, so this is not cosmetic.
 * - **Соціальна робота (11.5) and Публічне управління (12.5) have no row in the
 *   law at all** — post-2015 specialities, assigned by analogy. Use these.
 *
 * Names are kept exactly as the sheet has them, spacing tidied only, because
 * they are what a claim is matched against.
 */
export const SPECIALITY_NORMS_2026: readonly (readonly [name: string, base: number])[] = [
  ['Дошкільна освіта', 10.5],
  ['Початкова освіта', 10.5],
  ['Середня освіта (трудове навчання і технології)', 11.5],
  ['Соціальна робота', 11.5],
  ['Середня освіта (фізична культура)', 9.5],
  ['Середня освіта (музичне мистецтво)', 5],
  ['Середня освіта (образотворче мистецтво)', 5.5],
  ['Середня освіта (історія)', 13],
  ['Середня освіта (українська мова і література)', 13.5],
  ['Середня освіта (іноземна мова і література)', 9],
  ['Філологія (переклад)', 9],
  ['Психологія', 12.5],
  ['Середня освіта (природничі науки)', 12],
  ['Політологія', 12.5],
  ['Економіка', 12.5],
  ['Фінанси, банківська справа та страхування', 12.5],
  ['Облік і оподаткування', 12.5],
  ['Середня освіта (біологія та здоров’я людини)', 10.5],
  ['Середня освіта (географія)', 12],
  ['Середня освіта (математика)', 11.5],
  ['Професійна освіта (сфера обслуговування)', 12.5],
  ['Професійна освіта (товарознавство)', 12.5],
  ['Професійна освіта (документознавство)', 12.5],
  ['Професійна освіта (цифрові технології)', 12.5],
  ['Професійна освіта (видавничо-поліграфічна справа)', 12.5],
  ['Професійна освіта (транспорт)', 12.5],
  ['Професійна освіта (охорона праці)', 12.5],
  ['Освітні, педагогічні науки', 10.5],
  ['Менеджмент', 12],
  ['Публічне управління та адміністрування', 12.5],
  ['Інформаційна, бібліотечна та архівна справа', 12],
  ['Фізична культура і спорт', 9.5],
  ['Історія та археологія', 13],
  ['Туризм і рекреація', 13.5],
  ['Журналістика', 12],
  ['Філософія', 12.5],
  ['Середня освіта (інформатика)', 11.5],
  ['Середня освіта (захист України)', 11.5],

  // ── Not in додаток 5. Taken from постанова 1134 itself (added 2026-08-13) ──
  //
  // The university admitted 8 people in 2026 onto two programmes додаток 5 does
  // not list, so there was no норматив to score them by and nobody who recruited
  // them could record it. Both have a row in the law:
  //
  //   0804  Комп'ютерні науки   9,5 → 10
  //   0202  музичне мистецтво   4,5 → 3,5
  //
  // The right-hand column is the 2004/05 one, and that it is the right column is
  // not a guess: додаток 5's own «Середня освіта (образотворче мистецтво)» = 5.5
  // and «(музичне мистецтво)» = 5 are that column's values for 0202 verbatim.
  //
  // «Музичне мистецтво» is NOT «Середня освіта (музичне мистецтво)». The law
  // separates them — «музична педагогіка і виховання» (5) is the teacher, this
  // row (3.5) is the performer — and the ЄДЕБО export codes them B5 and A4.13.
  // 3.5 is low, so each such student is worth roughly three times an ordinary
  // one; that is the law's number, not a rounding of ours.
  //
  // CONFIRM WITH ННВ before the year is closed. Додаток 5 wins wherever it
  // speaks (see Менеджмент above) — it simply does not speak here, and the
  // вчена рада may set its own value when it next approves the table.
  ["Комп'ютерні науки", 10],
  ['Музичне мистецтво', 3.5],
];
