# Open questions & feature status

Written 2026-07-27, after analysing `edu-reference/csv/` — the exported sheets from the
Google Apps Script system we are replacing. Several questions that were open before are
now answered by that data and are marked as such below.

Purpose: a single page to take into the meeting with the boss.

---

## 1. Feature status

### Done

| Feature                                                                         | Where                                    |
| ------------------------------------------------------------------------------- | ---------------------------------------- |
| Rating catalogue, scoring, freeze-at-save                                       | `lib/rating/`                            |
| Indicators editable by ADMIN, no code change                                    | `/admin/rating/[year]`                   |
| Rating years: activate / clone / close / reopen                                 | `/admin/rating`                          |
| Profile-derived indicators (synced from Staff)                                  | `lib/rating/profile-derived.ts`          |
| НПП self-submission                                                             | `/achievements/[section]`                |
| Division-managed entry, staff-first grid                                        | `/division-data`                         |
| Division-managed entry, entity-first (programmes, projects, councils, journals) | `lib/rating/entity-entry.ts`             |
| Post-moderation: discard with a reason the НПП sees                             | `/moderation`                            |
| Publication «Перевірено» flag                                                   | `/moderation`                            |
| Moderation sort by item number + faculty/indicator filters                      | `/moderation` (2026-07-27)               |
| Per-НПП rating workbook export («Рейтинг» sheet)                                | `lib/rating/export-workbook.ts`          |
| Zip of all per-staff Excel forms                                                | `/api/export/ratings`                    |
| Charts and PDF chart export                                                     | `/dashboard`, `/api/export/rating-chart` |
| Audit log                                                                       | `/admin/audit-log`                       |
| Auth, invites, password reset, permissions per division                         | `lib/auth.ts`, `lib/permissions.ts`      |

The `Staff` model already carries every column in `УГСП_Дані - НПП.csv`: ставка,
науково-педагогічний стаж, вчене звання, науковий ступінь, email, WoS / Scopus /
Google Scholar counts and profile URLs, ORCID.

### Not done

| Feature                                       | Source file                                  | Blocked on                       |
| --------------------------------------------- | -------------------------------------------- | -------------------------------- |
| Staff import                                  | `УГСП_Дані - НПП.csv`                        | Nothing — best defined, do first |
| Розподіл ставок (pool + distribution)         | `Розподіл ставок - 2025.csv`                 | Q1                               |
| Характеристика_РНПАВ report                   | `Каменська … - Характеристика_РНПАВ.csv`     | Q2                               |
| Публікації report                             | `Звіти ННВ - Публікації_2025.csv`            | Q7                               |
| Підвищення кваліфікації registration form     | `Template_Form_Certificate - ШАБЛОН.csv`     | Q8                               |
| «Повідомити» — notify an НПП without deleting | `nnv rating.txt`                             | Q6                               |
| Student recruitment → ставка bonus            | `Рейтинг_Профорієнтація.xlsx` (not yet read) | Q3, Q4                           |
| Head of department / dean permissions         | —                                            | Q5                               |
| Historical import 2021–2025                   | old Google system                            | Q9                               |

---

## 2. Already answered by the reference data — no need to ask

Recording these so we don't waste meeting time on them.

- **Where the ставки pool comes from** — it is `totalPositions`, a number set per
  department. Staff are listed in rating order, descending.
- **Is there a per-person cap** — yes, `maxStake` already exists in their data.
  Values seen: 1.5, 1, 0.75, 0.5, 0.25, 0.1, and **0 = excluded**.
- **Negative `undistributed`** — a bug in the old system (float drift from 0.05 steps),
  not a deliberate tolerance. We will store rate as integer hundredths and block
  over-distribution.
- **What goes in the Характеристика evidence cell** — the same evidence summary our
  `summarizeEvidence` already produces, with ` (YYYY)` appended, entries separated by a
  blank line.
- **Empty Характеристика criteria** — printed as an empty cell; the row still appears.
- **Характеристика window** — rolling last 5 years («за останні 5 років (2021–2025)»).
- **Whether the note-on-decline exists** — it does. `removeReason` is required and the
  НПП sees it on `/achievements`.

---

## 3. Questions

### Blockers

**Q1. When the head's split and the vice-rector's split differ, which one is real?**

The data shows both existing at the same time. Where the pool total agrees, the two
disagree only on how to divide it:

| Кафедра                             | Head               | Vice-rector (Дудар)        |
| ----------------------------------- | ------------------ | -------------------------- |
| Української і зарубіжної літератури | Бродюк — pool 4.95 | pool 4.95, different split |
| Української лінгвістики             | Кулик — pool 3     | pool 3, different split    |
| Практичної психології               | Вінс — pool 8.5    | pool 5.7                   |
| Математики, інформатики             | Шевчук — pool 0    | pool 5                     |

_Why it matters:_ decides whether we build an approval step (head proposes →
vice-rector approves) or just several saved drafts. Different amount of work.

**Q2. Which rating indicators feed each of the 20 ЛУ-38 criteria?**

Partly derivable already — criterion 1 ← publications (3.8 / 3.9 / 3.10),
4 ← навчально-методичні посібники, 8 ← 3.5 ініціативна тематика,
11 ← 3.19 наукове консультування, 12 ← тези. The rest need confirming.

_Suggested shortcut:_ ask for 3–4 more filled Характеристики from different people
instead of going criterion by criterion in the meeting.

**Q3. Is this app the official source of ставка, or does the real number stay in 1С?**

Previously answered: real values live in 1С. Confirm this still holds once the app
starts calculating bonuses, because it changes how strict the audit trail must be.

**Q4. Does the student-recruitment bonus come out of the department pool, or on top?**

_Why it matters:_ on top = two independent features. Out of the pool = a head's budget
shrinks whenever his own staff recruit students, and the two features become coupled.

**Q5. May a head of department see their own staff's ставка?**

Today only ADMIN can (`lib/permissions.ts` — `CONFIDENTIAL_STAFF_FIELDS`). Needs a
firm yes or no, it is a policy decision and not a technical one.

### Important — changes the build, can start with an assumption

**Q6. Do we need «Повідомити» (notify without deleting)?**

The old ННВ form has it as a separate action from «Вилучити». We only have delete-with-
reason. If yes: email only, in-app only, or both? And does it flag the entry as
«потребує виправлення», or is it purely a message?

**Q7. The Публікації report — is the column set fixed?**

Current columns: 3.7 монографія (укр), 3.7 монографія (ЄС), 3.8 категорія А,
3.9 категорія Б, Одноосібно, 3.10 статті. Header carries a running count. Confirm this
is what they still want.

**Q8. Підвищення кваліфікації — is the registration form a separate approval flow?**

`Template_Form_Certificate` collects ПІБ, ступінь/звання, посада, заклад, програма,
кредити/години, період, документ (номер і дата), телефон, email. We have 1.11 and 1.12
as rating indicators. Is this form a separate «визнання результатів» step, or just how
the indicator's evidence gets submitted?

**Q9. Do we import 2021–2025 history?**

Needed for the Характеристика to be useful on day one — it is a 5-year report and the
app has no history. Recommended shape: one flat CSV,
`staff_email, year, item_number, evidence_text, score, division`, loaded into a
read-only archive table. Do **not** try to rebuild structured evidence from old free
text — it would be guesswork.

**Q10. Recruitment bonus specifics.**

- Is +0.1 per student the real number? Same for everyone, or does it vary by
  faculty / specialty / budget vs contract?
- Who confirms the student actually enrolled, and at which moment — заява, контракт,
  or наказ про зарахування?
- How long does the bonus last — exactly one academic year, 1 Sep to 31 Aug?
- Is there a cap? Can one НПП collect +1.0 from ten students?

**Q11. May a head allocate rate to themselves?**

The data says yes in practice — heads appear in their own distribution rows. Confirm
that is intended.

### Good to know — we can pick a default

**Q12.** Сумісництво — if an НПП works in two departments, which one gets a bonus?
Primary only?

**Q13.** Can a granted bonus be cancelled? By whom, and does it need a written reason?

**Q14.** What does a dean (head of faculty) get — the same powers across all their
departments, or something narrower?

**Q15.** Do we store the recruited student's name? That is personal data of someone who
is not a system user.

**Q16.** What happens if a person leaves or changes department mid-year — does the
bonus follow them?

**Q17.** What should the head's "summary about workers" contain, and who reads it —
department meeting, HR, or the rector?

### Later

**Q18.** Does HR need an export of ставка numbers for payroll? What format, how often?

**Q19.** Who resolves a dispute when an НПП claims a student and the confirmer says no?

**Q20.** Should previous years' ставки stay visible, or only the current year?

---

## 4. Suggested order of work

1. **Staff import** from `УГСП_Дані - НПП.csv` — no unknowns, and it makes everything
   else testable against real data.
2. **Розподіл ставок** — spec is clear apart from Q1.
3. **Характеристика_РНПАВ** — needs Q2; most of the map can be derived from more
   filled examples.
4. **Публікації report** — small once Q7 is confirmed.
5. **Підвищення кваліфікації form** — smallest, standalone.

The recruitment bonus and the head/dean permission layer are the two large ones, and
both are blocked on questions rather than on code.
