# Розподіл ставок — specification

Written 2026-08-04, after reading the university's own положення. **This supersedes
the earlier design notes**, which assumed a head divides a pool by hand. They do
not: the ставка is computed by a formula, and the head's role is to propose
deviations from it with a written justification.

## Source documents

| Document                                                                                      | What it gives                                                         |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `edu-reference/formula.pdf` — ПОЛОЖЕННЯ про систему розподілу ставок, затв. вченою радою 2024 | the formula, the process, додатки 1–6                                 |
| постанова КМУ 1134-2002                                                                       | норматив чисельності здобувачів на 1 ставку (the source of додаток 5) |
| постанова КМУ 1187-2015 (ред. 365 від 24.03.2021)                                             | Ліцензійні умови, п.37 and the 20 positions of п.38                   |
| `edu-reference/csv/Розподіл ставок - 2025.csv`                                                | how it was done before the formula                                    |
| `edu-reference/csv/… Характеристика_РНПАВ.csv`                                                | the п.38 positions as the university fills them in                    |

---

## The formula

```
      Rнпп     Кст      ⎛ n  Nзд      n  Nзз ⎞
Vc = 0.5 ⋅ ──── ⋅ ──── + ⎜ Σ ────  +  Σ ──── ⎟
     <Rк>    Кнпп     ⎝i=1 2·Nд    i=1  Nз  ⎠

0.5 ≤ Vc ≤ 1.5      below 0.5 → set to 0.5
```

**Two terms, computed at different times.** The first needs the rating year to be
closed; the second needs the admission campaign to be over. The model must store
them separately and combine, not compute once.

| Symbol        | Meaning                                                     | Where it comes from                       |
| ------------- | ----------------------------------------------------------- | ----------------------------------------- |
| `Vc`          | this person's ставка                                        | computed                                  |
| `Rнпп`        | personal rating                                             | ✅ `RatingEntry.totalScore` for the year  |
| `<Rк>`        | average rating of the кафедра                               | ✅ computed from the same table           |
| `Кст`         | ставки allocated to the кафедра                             | input, set centrally per кафедра per year |
| `Кнпп`        | staff on the кафедра meeting п.37 + ≥4 of п.38 over 5 years | from the Характеристика data (see below)  |
| `Nзд` / `Nзз` | students this person recruited — денна / заочна             | new records, one per student              |
| `Nд` / `Nз`   | норматив здобувачів на 1 ставку                             | norms table, per speciality per year      |

### The norms table is one number per speciality

Verified across all 34 parsed rows of додаток 5: every row follows the law's own
multipliers, so the four printed columns are derived from a single base.

```
norm(speciality, degree, form) = base(speciality)
                               × (магістр  ? 0.5 : 1)
                               × (заочна   ? 4   : 1)
```

Постанова 1134 also defines ×2 for вечірня, −10% for спеціаліст and −15% for
foreign full-time students. None apply here today — no evening form, no
спеціаліст level — but the model should not make them impossible to add.

Their base numbers match постанова 1134's 2004/05 column throughout, with two
exceptions worth raising with the boss, **not** worth "fixing" in code:

- **Менеджмент — 12 in додаток 5, 13 in the law.** Either a deliberate вчена рада
  decision or a typo. It matters: a smaller norm makes each recruited student
  worth more.
- **Соціальна робота (11.5) and Публічне управління (12.5) have no row in the
  law** — they are post-2015 specialities, assigned by analogy.

This is exactly why the norms are **editable yearly data**, not constants in code:
the вчена рада approves the table each year, and the app must follow whatever it
approves.

### Which students count

Both contract and state-funded, with contract multiplied by the **узгоджуючий
коефіцієнт** that the вчена рада sets each year (додаток 5 footnote). The
coefficient's value is not in the положення — it becomes a per-year setting, and
we need this year's number before the first real calculation.

### Кнпп comes from the Характеристика data

`Характеристика_РНПАВ` is literally the 20 positions of п.38 — same list, same
order, plus a «Дані підтвердження показника» column. Confirmed against постанова
1187 (20 positions) and against their own додаток 1.

So one dataset — the 20 positions per person per year, each with evidence text —
produces four things:

1. the **Характеристика_РНПАВ** report (docs/open-questions Q2), made by hand today;
2. **`Кнпп`** — the count of people on the кафедра with ≥4 positions;
3. додаток 3's column «Досягнення у професійній діяльності (позицій із 20)»;
4. most of додаток 6, the per-person мотивований висновок.

About half the positions can be pre-filled from rating data we already hold:
п.1 ← publications 3.8/3.9/3.10 · п.3 ← монографії/підручники · п.4 ←
навчально-методичні посібники · п.7 ← спецради · п.8 ← НДР, редколегії ·
п.10 ← міжнародні проєкти · п.11 ← 3.19 наукове консультування · п.12 ← тези ·
п.19 ← професійні об'єднання. The evidence cell is what `summarizeEvidence`
already produces, with the year appended.

The rest is manual. The five-year window is only fully accurate after the
historical import (Q9); until then the ≥4 check works on current data plus manual
entry.

**Note on a common misreading:** the положення does _not_ say that someone below
4/20 gets no ставка. `Кнпп` only sizes the divisor. Everyone still receives a Vc,
and nobody falls below 0.5 — which is why staff who do not meet the licence
positions keep working normally.

---

## Process and who does what

```
вчена рада        approves the norms + the узгоджуючий коефіцієнт for the year
     ↓
ADMIN / вице-ректор   enters Кст per кафедра, the norms, the coefficient
     ↓
завідувач кафедри     sees each person's formula result; proposes the actual
                      split, justifying any deviation (додаток 2)
     ↓
комісія               approves. Only the approved version is official.
     ↓
1С                    payroll truth — EduRank plans, 1С records (Q3)
```

Додаток 2 has **two columns** — «Розподілений обсяг ставки» and «Обсяг ставки за
формулою» — plus «Обґрунтування». The grid must show the formula result beside
the proposed number, because that is the document it produces.

Leftover ставки after the formula go by priority to **гаранти освітніх програм**,
which we already track as rating indicator 1.7 (`program_guarantor`).

---

## Data model sketch

Rate is stored as **integer hundredths**, never a float — the old system's
negative «undistributed» values came from float drift on 0.05 steps.

```prisma
Speciality        { id, code ("014", "015.05"), name }
SpecialityNorm    { specialityId, year, base Float }      // one number, see above
StakeYearSettings { year, contractCoefficient Float, minVc, maxVc }

DepartmentStake   { departmentId, year, kst Int, knpp Int }   // Кст, Кнпп

RecruitedStudent  { staffId, year, specialityId,
                    degree: BACHELOR | MASTER,
                    form:   FULL_TIME | PART_TIME,
                    funding: CONTRACT | STATE,
                    studentName? }

StakeDistribution { departmentId, year,
                    status: DRAFT | SUBMITTED | APPROVED,
                    authorId, approvedById, approvedAt }
StakeAllocation   { distributionId, staffId,
                    formulaHundredths Int,     // what the formula said
                    proposedHundredths Int,    // what the кафедра asks for
                    justification String? }    // required when they differ
```

**One rule to keep the workflow cheap to change:** "which row is official" lives
behind a single function. Downstream code asks that function, never
`status === 'APPROVED'` scattered in ten places. If the approval step is ever
dropped (see Q1), that is one edit.

---

## Decisions taken (2026-08-04, with the owner)

| #   | Decision                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Approval step.** Head proposes → комісія/віце-ректор approves. Only the approved version is official.                                                                                                                   |
| Q3  | **1С stays the payroll truth.** EduRank plans and approves; the result is exported for 1С.                                                                                                                                |
| Q4  | **Superseded.** Not "bonus on top" vs "out of the pool" — the recruitment sum is the second term of one formula, computed in a different period.                                                                          |
| Q5  | **A head sees their own кафедра properly**: staff, profiles, ставка, rating results, plus the distribution grid. Derived from `Department.headId`, **not** a new `Role` — one person can be head, НПП and editor at once. |
| Q11 | **A head may allocate to themselves**, as an ordinary row. Approval and the audit log are the control.                                                                                                                    |
| Q14 | **A dean gets the same, across every кафедра of their faculty.** One `scopeOf(person) → departmentIds[]`.                                                                                                                 |
| —   | **Кст is set centrally** (віце-ректор/admin), never by the head.                                                                                                                                                          |
| —   | **Both contract and state students count**, contract × узгоджуючий коефіцієнт.                                                                                                                                            |
| —   | **`Кнпп` comes from the Характеристика dataset**, not a typed number.                                                                                                                                                     |

## Still open

- The value of the **узгоджуючий коефіцієнт** for the current year.
- The **Менеджмент 12 vs 13** discrepancy — ask, do not "fix".
- Who enters recruited students. Додаток 3 is signed by завідувач, декан **and**
  відповідальний секретар приймальної комісії, which suggests the приймальна
  комісія is the source.
- Q2 — the full criteria → indicator map for the auto-filled half of Характеристика.
- Q9 — the 2021–2025 history import, needed for the five-year window.
- Whether `Характеристика` imposes a harder rule than the положення (see the
  misreading note above); check when building that report.
