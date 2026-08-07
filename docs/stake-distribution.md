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
     <Rк>    Кнпп     ⎝i=1  Nд     i=1  Nз  ⎠

0.1 ≤ Vc            per-person floor, see «Nobody gets zero» below
```

**This is the corrected formula, not the положення's.** The положення prints
`Nзд / (2·Nд)` for денна and clamps `0.5 ≤ Vc ≤ 1.5`. Both are wrong and the
owner confirmed it: the денна divisor is **`Nд`**, with no factor of 2 (2026-08-07),
and the floor is **0.1**, not 0.5 (2026-08-06). Do not "restore" either from the
PDF.

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

### The pool bounds the first term only (decided 2026-08-07)

This is the single most load-bearing fact about the whole feature, and the
положення does not say it — it prints one `Vc` and leaves the impression that the
pool covers all of it. It does not:

```
term 1  — the pool share       Σ over the кафедра = Кст     HARD CEILING
term 2  — the recruitment bonus  paid ON TOP of Кст          not bounded by it
```

So the order of operations is:

1. **ADMIN/проректор sets `Кст`** — the кафедра's pool.
2. **The formula spreads that pool**, `0.5 · (Rнпп/<Rк>) · (Кст/Кнпп)` per person.
   This is the _initial, fair_ split: proportional to rating, nobody's opinion in it.
3. **The head adjusts by hand** who gets what — and **the sum may never exceed
   `Кст`**. This is a hard block, not a warning: the head cannot save or submit a
   distribution that overspends the pool.
4. **Recruitment bonuses are added afterwards, outside the pool.** A person who
   brought in students gets their `Σ Nзд/Nд + Σ Nзз/Nз` on top. This money does
   not come out of `Кст` and does not compete with colleagues.

**Consequence — a person's total ставка can exceed their pool share, and the
кафедра's total can exceed `Кст`, but only ever through term 2.** Never through
the head's pen. If you are looking at a sum bigger than `Кст`, the difference must
be exactly the recruitment bonuses; anything else is a bug.

This retracts the earlier open question «чи може сума перевищувати Кст», which
was malformed — it asked about one number where there are two, and the answer
differs per term.

**Consequence for the UI.** The grid needs two columns, not one: the pool share
(editable by the head, with a live «нерозподілено» against `Кст`) and the
recruitment bonus (read-only, computed from confirmed students). A single merged
number would make the hard ceiling impossible to enforce or explain.

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
exceptions — neither of them a bug to "fix" in code:

- **Менеджмент — 12 in додаток 5, 13 in the law. Use 12** (confirmed 2026-08-07).
  Додаток 5 wins over постанова 1134 where they disagree. The norm is a per-year
  setting anyway, so this is seed data, not a constant — but seed it with 12 and
  do not "correct" it against the law later. A smaller norm makes each recruited
  student worth more, so this is not cosmetic.
- **Соціальна робота (11.5) and Публічне управління (12.5) have no row in the
  law** — they are post-2015 specialities, assigned by analogy.

This is exactly why the norms are **editable yearly data**, not constants in code:
the вчена рада approves the table each year, and the app must follow whatever it
approves.

### Which students count

Both contract and state-funded, with contract multiplied by the **узгоджуючий
коефіцієнт** that the вчена рада sets each year (додаток 5 footnote). The
coefficient's value is not in the положення; for 2026 it is **0.175**, confirmed
by the owner on 2026-08-07. It stays a per-year setting — confirmed, not frozen.

### How a recruited student gets into the system (decided 2026-08-04)

The order of events matters and is not what the формула alone suggests:

```
вересень: наказ про зарахування    ← the official list of accepted students
     ↓
НПП adds their students            ← free text, silently, no duplicate warning
     ↓
завідувач / ADMIN inspects         ← per кафедра, sees duplicates and who was first
     ↓
confirmed claims count             ← only these reach the formula
```

**Adding is silent on purpose.** An НПП never learns that someone else already
claimed the same student, and nothing is blocked at save. The duplicate is the
evidence, and it is shown only to the person who can judge it. Blocking the
second claim was considered and rejected: it would hand the ставка to whoever
typed first rather than to whoever did the work, and would leave the head with
one row and no conflict to see.

**What the завідувач / ADMIN sees**, per кафедра (ADMIN picks the кафедра from a
select, the same pattern as `/division-data`):

- every claim with its author and its timestamp;
- duplicates grouped, with **who added first** marked;
- **per-НПП duplicate count** — one contested claim is noise, «7 of this person's
  9 claims are contested» is a pattern;
- confirm / reject per claim, and the decision about that person's rate.

**What the НПП sees** on their own list: each student with the ставка that claim
would add, and the total — shown even for a claim that is secretly a duplicate,
because they are not told about conflicts. It must be clearly labelled as
potential, not earned:

```
Мої залучені здобувачі — 2026
  Петренко О. І.   Дошкільна освіта, Б, денна, контракт   +0.048
  Іваненко С. М.   Психологія, М, заочна, бюджет          +0.020
  ───────────────────────────────────────────────────────────────
  Можливе збільшення ставки                                +0.068
  (після підтвердження завідувачем)
```

The per-student figure comes from the formula's second term — but **what they
actually apply differs from what the положення says**, and the difference was
measured, not guessed.

`Рейтинг_Профорієнтація.xlsx` records the ставка each recruited student was worth,
1389 rows over 2025 and 2026. Expressed as a multiple of `1 / base(speciality)`:

|              | денна бюджет | денна контракт | заочна бюджет | заочна контракт |
| ------------ | ------------ | -------------- | ------------- | --------------- |
| **бакалавр** | 1.0          | 0.175          | 0.25          | 0.0375          |
| **магістр**  | 2.0          | 0.35           | 0.5           | 0.0875          |

Read off that table:

- **Заочна matches the положення** (`1/Nз`), and the магістр halving matches
  (`Nд` halved → contribution doubled).
- **Денна does not.** Budget денна students are recorded at `1/Nд`, exactly twice
  what `Nзд/(2·Nд)` produces. The factor of 2 is simply not applied in practice.
- **One cell breaks the pattern**: бакалавр/заочна/контракт is 0.0375 where the
  rest of the table implies 0.04375.
- **2025 was adjusted by hand, 2026 was not**: in 2025 «бакалавр денна контракт»
  ranges 0.120–0.230; in 2026 every value is exactly 0.175.

### The measured values are the correct ones (confirmed 2026-08-07)

The owner confirmed both open points, and in the same direction the data pointed:
the положення is wrong and the spreadsheets are right.

```
per student = multiplier / base(speciality)          budget
            = multiplier / base(speciality) × 0.175  contract
```

Worked through on the example given — a speciality with `base = 10.5`:

| Здобувач                | Значення                 |
| ----------------------- | ------------------------ |
| бакалавр денна бюджет   | `1/10.5` = 0.095         |
| бакалавр денна контракт | `1/10.5 × 0.175` = 0.017 |

So: **no factor of 2 anywhere**, and the **узгоджуючий коефіцієнт is 0.175**,
applied as a plain multiplier on the budget value. The remaining multipliers
(магістр ×2, заочна ×0.25) already agreed with the положення and are unchanged.
The stray 0.0375 cell stays a rounding artefact, not a rule — see «Precision».

**Consequence for the model is unchanged.** These are still **per-year settings**,
seeded with the values above, not constants in code. They are confirmed for 2026,
not fixed forever, and the вчена рада can move them.

**Сумісництво (Q12) — assumed, not confirmed.** A student lands in the recruiter's
**primary** кафедра, and a сумісник gets one Vc, computed on their primary кафедра
only. Reason: `Кст`, `Кнпп` and `<Rк>` are all per кафедра, so counting someone in
two кафедри would put them in two averages and two pools and produce two Vc values
that nothing reconciles before 1С. Revisit if сумісники turn out to recruit often.

**Working assumptions** (correct these if wrong):

- A duplicate means the same student claimed by **different** НПП. The same НПП
  adding the same person twice is their own mistake and is blocked.
- Matching is on normalised ПІБ (trim, case, collapsed spaces) plus спеціальність.
  Near-matches are surfaced to the head rather than hidden — people mistype even
  when copying from the наказ.
- An НПП may edit or delete their own claim while it is PENDING, and sees the
  reason when one is rejected, exactly as with a discarded rating entry.

### This is the app's first approval queue — deliberately

The rating system has none: submissions are APPROVED on save and oversight is
post-moderation. Student claims are the opposite — nothing counts until a human
confirms it. That inconsistency is intended, because a rating entry only affects
its own author while a student claim takes points away from a colleague.
`ActivityStatus.PENDING` still stays unused; this is a separate model with its
own status.

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

## Per-person caps (decided 2026-08-05)

The formula alone cannot produce what the university actually did. Checking the
2025 distribution (`Розподіл ставок - 2025.csv`) against it: fewer than a fifth
of people land within 0.1 of the formula, median gap 0.30.

That file holds **25 saved drafts but only 20 кафедри** — five appear twice, once
from the завідувач and once from Дудар. Deduplicated, it covers **175 people**,
and three mechanisms explain the gap, none of which the формула mentions:

| Found in 2025                              | Count                       | The formula                      |
| ------------------------------------------ | --------------------------- | -------------------------------- |
| ставка = 0                                 | 37 (21 %)                   | cannot go below 0.5              |
| ставка between 0 and 0.5                   | 34 (19 %)                   | same                             |
| sitting exactly on a per-person `maxStake` | 68 (39 %)                   | has no per-person cap            |
| exceeding `maxStake`                       | **0** — the cap is absolute | —                                |
| кафедра with `Кст = 0`                     | 2 of 20                     | everyone would land on the floor |

A caution about that last row: a third кафедра also shows `Кст = 0`, but it has
a second draft from Дудар with `Кст = 5` — so the zero is an **unfilled draft**,
not a decision. In the old data «never filled in» and «given nothing» look
identical. That is an argument for the DRAFT / SUBMITTED / APPROVED status
already decided: an untouched draft will never be read as a refusal.

2025 almost certainly predates the formula (the положення is 2024, and the 2026
recruitment values are exactly computed while 2025's vary by hand). But the
mechanisms are real and the owner has confirmed they stay:

- **Every НПП has an editable min and max**, applied after the formula:
  `final = clamp(Vc, person.min, person.max)`.
- **The lowest a cap may go is 0.1**, not 0 — a deliberate override of the
  положення's «менше 0,5 → встановлюється 0,5».
- **Only ADMIN edits caps.** The завідувач distributes inside limits they cannot
  change, which is what stops a head capping colleagues down and themselves up.

Still open: where the ставки freed by a cap go (proposal: shown as
«нерозподілено» for the head to place, matching the old system's `undistributed`
field).

## Nobody gets zero, and the pool must be able to pay for that (decided 2026-08-06)

Two answers that close the two blocking questions about zero.

**No НПП may end on 0.** The floor of 0.1 is absolute — there is no «excluded
entirely» route, no zero cap, no leaving a person out of the distribution to the
same effect. Every person on the кафедра receives at least 0.1.

**Therefore `Кст = 0` cannot be entered at all.** A pool that cannot pay the
floor for everyone is not a decision, it is bad input, and the system rejects it
when the проректор/ADMIN types it:

```
Кст ≥ 0.1 × (people on the кафедра)
```

10 people → the smallest permitted `Кст` is 1.0; 25 people → 2.5. The 2025 file's
two кафедри with `Кст = 0` become impossible to reproduce, which is the point:
in that data a zero pool and an untouched draft were indistinguishable, and both
zeroed 100 % of the кафедра.

Consequences to carry into the implementation:

- The floor is a **validation on the Кст input**, not a silent correction. The
  message must say what the minimum is and why (`N осіб × 0,1`), so the person
  entering it knows whether to raise the pool or check the roster.
- It moves with the roster. Archiving a person lowers the minimum; adding one
  raises it and can put an already-saved `Кст` below the floor — that has to
  surface on the кафедра's distribution page, not fail silently at approval time.
- It largely dissolves the old «ставок менше, ніж людей» worry. With a per-person
  floor of 0.1 rather than the положення's 0.5, `Кст = 4` across 8 people needs
  only 0.8 — the pool can no longer be structurally too small to satisfy the
  floor, because the floor is what defines the pool's minimum.

**`N` is every НПП on the кафедра, not `Кнпп`** (confirmed 2026-08-07). The two
counts differ — `Кнпп` is only those meeting п.37 and ≥4 of п.38 — and it is the
wider one that applies here. The stated reason is the rule's whole purpose: the
pool must be big enough that **everyone can get a working rate**, and staff who
do not qualify under п.38 still receive a row in the distribution. So `N` is the
roster count, exactly the set of people the grid renders.

Note the two counts play different roles and must not be conflated in code:
`Кнпп` is a **divisor inside the formula** (it scales each person's share);
`N` is a **validation bound on the input** (it sets the pool's minimum).

**The bound is one-sided.** `Кст` may freely exceed `N` — a кафедра of 20 people
can hold a pool of 25 ставок (confirmed 2026-08-07). There is no ceiling tied to
headcount, and an average above 1.0 ставка per person is normal, not an error to
warn about. Only the floor is enforced.

## Rounding: ставки move in steps of 0.05

Confirmed against the 2025 file, not assumed: **all 226 ставки and all 226
`maxStake` values are exact multiples of 0.05**, forming a clean ladder
`0 · 0.1 · 0.15 · 0.2 … 1.45 · 1.5`.

The pool is **not** on that ladder — `Кст` is computed from student numbers, and
two of the 25 drafts hold `2.16` and `7.56`. So the distributed total can never
equal the pool exactly. Кафедра «Політології»: pool `2.16`, distributed `2.15`,
`undistributed: 0.01` — a remainder smaller than the step and therefore
impossible to hand out.

Rules for the implementation:

- a person's ставка is rounded to the nearest 0.05, halves going up
  (`0.02 → 0.00`, `0.03 → 0.05`);
- store integer hundredths and snap in multiples of 5, never round floats — the
  old system's negative `undistributed` came from exactly this;
- a remainder below 0.05 stays undistributed and is shown as such, rather than
  being forced onto somebody.

Still to confirm with the owner's boss: the rounding direction at an exact half,
and that the sub-step remainder is genuinely meant to stay unallocated.

## Precision

Their recorded per-student values are rounded to **3 decimals**, which for a
заочний контрактний здобувач (~0.004) leaves barely one significant digit.
Compute at full precision and round only for display — summing rounded values is
what produced the old system's negative «undistributed».

This also retracts an earlier finding of ours: a supposed anomaly where the
contract coefficient looked like 0.15 for бакалавр/заочна instead of 0.175. At
that precision the data cannot tell the two apart, and the apparent pattern came
from база 12.5 specialities dominating the sample. **Assume 0.175 everywhere.**

## Data model sketch

Rate is stored as **integer hundredths**, never a float — the old system's
negative «undistributed» values came from float drift on 0.05 steps.

```prisma
Speciality        { id, code ("014", "015.05"), name }
SpecialityNorm    { specialityId, year, base Float }      // one number, see above
StakeYearSettings { year, contractCoefficient Float, minVc, maxVc }

DepartmentStake   { departmentId, year, kst Int, knpp Int }   // Кст, Кнпп

StudentClaim      { staffId, year,                    // who claims, which year
                    studentName, studentNameNormalised, // matching key
                    specialityId,
                    degree:  BACHELOR | MASTER,
                    form:    FULL_TIME | PART_TIME,
                    funding: CONTRACT | STATE,
                    status:  PENDING | CONFIRMED | REJECTED,
                    rejectReason?,
                    confirmedById?, confirmedAt?,
                    createdAt }                        // «who was first» — evidence

StaffStakeLimits  { staffId, year, minHundredths, maxHundredths }  // ADMIN only

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

| #   | Decision                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Approval step.** Head proposes → комісія/віце-ректор approves. Only the approved version is official.                                                                                                                                                                                                   |
| Q3  | **1С stays the payroll truth.** EduRank plans and approves; the result is exported for 1С as **Excel** (confirmed 2026-08-07). Column set still to be specified.                                                                                                                                          |
| Q4  | **Bonus on top — the original reading was right** (confirmed 2026-08-07). An earlier note here called it "superseded" on the grounds that both terms belong to one formula. They do, but only term 1 is bounded by `Кст`; the recruitment sum is paid over it. See «The pool bounds the first term only». |
| Q5  | **A head sees their own кафедра properly**: staff, profiles, ставка, rating results, plus the distribution grid. Derived from `Department.headId`, **not** a new `Role` — one person can be head, НПП and editor at once.                                                                                 |
| Q11 | **A head may allocate to themselves**, as an ordinary row. Approval and the audit log are the control.                                                                                                                                                                                                    |
| Q14 | **A dean gets the same, across every кафедра of their faculty.** One `scopeOf(person) → departmentIds[]`.                                                                                                                                                                                                 |
| —   | **Кст is set centrally** (віце-ректор/admin), never by the head.                                                                                                                                                                                                                                          |
| —   | **Both contract and state students count**, contract × узгоджуючий коефіцієнт.                                                                                                                                                                                                                            |
| —   | **`Кнпп` comes from the Характеристика dataset**, not a typed number.                                                                                                                                                                                                                                     |

## Still open

See [`questions-for-boss-ua.md`](./questions-for-boss-ua.md) — the five ставки
questions are written there in Ukrainian, ready to ask.

- The **узгоджуючий коефіцієнт**: observed as 0.175, needs confirming.
- The **Менеджмент 12 vs 13** discrepancy — ask, do not "fix".
- Who enters recruited students. Додаток 3 is signed by завідувач, декан **and**
  відповідальний секретар приймальної комісії, which suggests the приймальна
  комісія is the source.
- Q2 — the full criteria → indicator map for the auto-filled half of Характеристика.
- Q9 — the 2021–2025 history import, needed for the five-year window.
- Whether `Характеристика` imposes a harder rule than the положення (see the
  misreading note above); check when building that report.
- Whether a student accepted to two programmes may be claimed twice by the same
  НПП. After the наказ this should be rare; assumed not, and blocked.
- What «decide what to do with the rate» means concretely when a claim is
  rejected — does the head simply reject the claim, or also record something
  against the person who filed it?
- Whether the наказ list can ever reach the app as data. If it can, claims stop
  being free text and duplicate matching becomes exact. Worth revisiting after
  the first campaign shows how bad the typing is.
