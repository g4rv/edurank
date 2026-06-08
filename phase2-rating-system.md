---
name: phase2-rating-system
description: 'Full design context for Phase 2 — NPP activity submission, division verification, and auto-computed rating system'
metadata:
  node_type: memory
  type: project
  originSessionId: 9060347f-db3b-47ae-bd5f-92d092afdcad
---

# Phase 2 — Rating System Design Context

Explored on 2026-05-27. Source documents: `edu-reference/Фінансів/Таблиці_Викладачів/Калмиков Олег Валентинович.xlsx` and `edu-reference/sections/розділ 1–5.md` (Google Apps Script HTML forms).

---

## Mental model

The Excel rating form is the **output**, not the input. The actual flow:

```
NPP submits activity (with evidence)
    ↓
Division approves or removes it
    ↓
Approved activities → auto-scored → rating computed per section per year
```

The rating table is a materialized view of all approved activities for a year.

---

## Three input sources feed the rating

### 1. NPP-submitted activities

NPP submits one activity at a time through their profile page. Each submission has typed evidence fields specific to the activity type. Division reviews and approves or removes. Score is computed at submission/approval time and frozen.

### 2. Division-managed values

Certain items are entered directly by the responsible division through their dashboard — not submitted by NPP. Division entry is immediately approved (no workflow). Examples: ННВ enters academic rank, degree, pedagogical experience, citation counts; ННЦЗЯО enters teaching workload; ВА enters specialized academic council membership.

### 3. (Nothing auto-derived from Staff profile)

Values are NOT automatically pulled from Staff profile fields even though they overlap (e.g., academicRank). Division explicitly enters rating values for each year through their dashboard.

---

## Rating structure — 5 sections

From the Excel `Таблиця рейтингового оцінювання`:

| Section | Name                                                       |
| ------- | ---------------------------------------------------------- |
| 1       | Показники професійного розвитку                            |
| 2       | Показники навчальної діяльності                            |
| 3       | Показники науково-інноваційної діяльності                  |
| 4       | Показники організаційної діяльності                        |
| 5       | Навчально-методичне забезпечення (Moodle/Google Classroom) |

Template is stable year-to-year (2024 vs 2025 identical structure, only values differ), but admin may add/remove items or change coefficients annually.

---

## All NPP-submitted activity types (from section forms)

Each entry: `section.item | activity name | evidence fields | score formula`

### Section 1

- `1.4` Нагороди | text: назва нагороди (repeatable, 2 sub-types) | value=1 per award
- `1.5` Участь у радах МОН/НАЗЯВО | select: тип ради + text: номер наказу | value=1
- `1.6` Адмін. посада | checkboxes (ректор/проректор/декан/зав.кафедри/etc.) | value=coefficient per role
- `1.9` Базова освіта | checkbox (boolean) | value=1 if checked
- `1.10` Проф. об'єднання | text: назва (repeatable) | value=1 per entry
- `1.11a` Підвищення кваліфікації | checkboxes (3 levels: друга вища/PhD/доктор наук) | value=1 per checked
- `1.11b` Міжнар. стажування | number: кредитів очно + number: кредитів дистанційно | value=credits × coefficient

### Section 2

- `2.2` Видання | select: тип (підручник/посібник/методичні рекомендації) + number: сторінок + text: бібліографія | value = pages/24 (author sheets)
- `2.3` Заняття іноземною мовою | text: ОП + text: дисципліна | value=1
- `2.7` Кураторство | text: індекс групи (repeatable) | value=1 per group
- `2.8` Відеолекції | text: дисципліна + url: посилання | value=1 per lecture

### Section 3

- `3.5` Ініціативна тематика | text: назва + select: роль (виконавець/керівник) | value=10 or 15
- `3.6` Відкриті лекції | date + text: тема + url | value=1
- `3.7` Монографія | text: бібліографія + number: сторінок + select: мова (укр/ЄС) | value = pages/24
- `3.8` Публікація кат. А (WoS/Scopus) | text: бібліографія + url: DOI | value=1 (×500pts coefficient)
- `3.9` Публікація кат. Б | text: бібліографія + url: DOI + select: одноосібно/співавторство | value=1
- `3.10` Статті в ін. виданнях | text: бібліографія + number: сторінок + number: авторів | value = pages/authors (only if pages ≥ 5)
- `3.11` Захист дисертації (кер-во) | select: тип (д.н./к.н.) + date + text: ПІБ + text: тема + url: спецрада | value=1
- `3.12` Кер. аспірантом/докторантом | select: вид + text: ПІБ + text: тема | value=1
- `3.13` Призер міжнар. олімпіади | select: місце (1/2/3) + date + text: ПІБ + text: захід | value=100/80/60
- `3.14` Призер всеукр. олімпіади | select: місце (1/2/3) + date + text: ПІБ + text: захід | value=80/60/40
- `3.15` Оргкомітет/журі МАН | text: назва+дата+місце + text: номер наказу | value=1
- `3.19` Консультування організацій | text: назва організації + text: номер договору | value=1
- `3.20` Конференція за кордоном | text: назва + number: днів + url + select: очна/заочна | value=50 (очна) or 20 (заочна)
- `3.21` Конференція в Україні | text: назва + number: днів + url | value=1
- `3.23` Опонування дисертацій | select: тип (докт./канд.) + date + text: ПІБ + text: тема | value=1
- `3.24` Відгуки на автореферат | text: тема + text: ПІБ | value=1
- `3.25` Рецензування МАН | text: назва+дата+місце | value=1
- `3.28` Патенти/свідоцтва | date: реєстрація + text: реєстр. номер + text: назва | value=1

### Section 4

- `4.1a` Організація міжнар. конф. | select: роль (голова/заступник/член) + date + text: наказ + text: назва | value=100/80/50
- `4.1b` Організація всеукр. конф. | select: роль (голова/заступник/член) + date + text: наказ + text: назва | value=50/40/20
- `4.2` Культурно-спортивні заходи | select: рівень (6 options) + date + text: наказ + text: назва | value=1
- `4.3` Виховні заходи | select: рівень (загальноунів/факультетський) + date + text: наказ + text: назва | value=1

### Section 5

- `5.1` Курс Moodle/Google Classroom | text: дисципліна + url + checkbox: вибіркова (дисципліна, +25% multiplier) + checkboxes: матеріали | value = sum of checked material coefficients × (1.25 if elective) — силабус=30%, решта по 17.5%

**Total: ~34 distinct NPP-submitted activity types.**

---

## Division-managed activity types (entered directly by division, no NPP submission)

| Division | Items                                                                                                                                                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ННВ      | 1.1 Пед. стаж (years), 1.2 Вчене звання (select), 1.3 Науковий ступінь (select), 3.16 Керівництво науковою школою, 3.17 Спеціалізовані вчені ради (роль), 3.18 Редакційні колегії журналів (роль + issue), 3.22 Освітянські виставки, 3.26 Експертиза підручників МОН, 3.27 Кер. підвищенням кваліфікації, 3.28б Цитування WoS/Scopus/Scholar (h-index) |
| ННЦЗЯО   | 2.1 Навч. навантаження (number), 1.7 Гарант ОП, 1.8 Члени рад університету, 2.4 Акредитаційний самоаналіз, 2.5 Освітні програми (розробка/оновлення), 2.6 Навчальний план (розробка/оновлення), 2.9 Голова/член предметної комісії, 2.10 Відп. за сайт/соцмережі підрозділу                                                                             |
| ВМЗ      | 3.1 Міжнар. гранти (виграні, різні ролі), 3.2 Реалізація міжнар. програм, 3.3 Підготовка міжнар. грантів, 3.4 Підготовка всеукр. грантів (varies by source)                                                                                                                                                                                             |
| ВА       | 3.17 Спеціалізовані вчені ради (голова/секретар/член)                                                                                                                                                                                                                                                                                                   |

**Total: ~20 division-managed activity types.**

---

## Score computation formulas (server-side, ported from form JS)

All formulas from `collectFormData()` in each section form:

```
books/посібники:       pages / 24                         (author sheets)
монографія:            pages / 24                         (same)
articles (3.10):       pages / authors    (only if pages ≥ 5, else 0)
moodle course:         sum(selected_coefficients) × (1.25 if elective else 1.0)
                       where: силабус=0.30, test/notes/main/extra=0.175 each
conf. abroad:          50 (очна) | 20 (заочна)
intl olympiad prize:   100 / 80 / 60  (1st / 2nd / 3rd)
ukr olympiad prize:    80 / 60 / 40   (1st / 2nd / 3rd)
intl conf. org:        100 / 80 / 50  (голова / заступник / член)
ukr conf. org:         50 / 40 / 20   (голова / заступник / член)
initiative topic:      15 (керівник) | 10 (виконавець)
all others:            value = 1  (coefficient applied separately)
```

Score stored on Activity row = computed_value × activityType.coefficient

---

## Proposed schema shape

```
RatingTemplate            — one per year, admin creates (clone + edit is expected workflow)
  id, year, name, isActive

RatingSection             — 5 per template
  id, templateId, number (1-5), title

ActivityType              — one per activity item per year (~54 total)
  id, templateId, sectionId, order, code (e.g. "3_8_publication_a")
  label, coefficient, coefficientNote
  inputSource: NPP_SUBMISSION | DIVISION_MANAGED
  verifyingDivisionId     — for NPP types: who approves; for DIVISION types: who enters
  isActive

Activity                  — one per submission (NPP or division)
  id, staffId, activityTypeId, year
  evidence: Json          — typed per activity type (NOT freeform text)
  computedValue: Float    — intermediate (pages/24, etc.)
  score: Float            — computedValue × coefficient, frozen at approval
  status: PENDING | APPROVED | REMOVED
  submittedByRole: NPP | DIVISION
  approvedByUserId, approvedAt
  removedByUserId, removedAt, removeReason
  createdAt, updatedAt

RatingEntry               — per staff per year, computed/cached
  id, staffId, year
  section1Score … section5Score, totalScore
  status: OPEN | CLOSED
  snapshot: Json          — populated at close time (full rating with labels+scores)
  closedAt, closedByUserId
```

---

## Key design decisions discussed

1. **Evidence is typed JSON per activity type** — each of the 34 NPP types has a known, fixed set of fields. No generic schema needed; frontend uses hardcoded form components keyed by `ActivityType.code`.

2. **Score is computed server-side and stored** (mirrors the JS formulas already in the form files). Score is frozen at approval time — changing a coefficient in 2027 does not retroactively change 2025 scores.

3. **Division dashboard has two panels:**
   - Approval queue — pending NPP submissions for their activity types
   - Direct entry grid — division-managed items per NPP per year

4. **Archiving**: When year closes, `RatingEntry.snapshot` JSON captures full rating (item labels + coefficients + scores as-of-close). Activity rows stay forever for historical queries. Snapshot = authoritative display for closed years.

5. **Template per year** — admin clones previous year's ActivityTypes and edits the differences. This handles the "some coefficients/items change annually" requirement.

6. **No draft state for NPP** — NPP adds an activity and it goes immediately to PENDING in the division queue. Division approves or removes. If removed, NPP sees reason and can resubmit corrected.

---

## Open questions not yet decided

1. Does admin open/close a year explicitly, or is it always rolling?
2. Can NPP still submit to a closed year (appeals)?
3. Division-managed entries: immediate APPROVED on entry, or still needs a confirm step?

---

## Source files

- `edu-reference/Фінансів/Таблиці_Викладачів/Калмиков Олег Валентинович.xlsx` — full rating table for 2024 and 2025 (hidden sheet), shows all items, coefficients, division assignments
- `edu-reference/sections/розділ 1.md` — Section 1 NPP input form (Google Apps Script HTML)
- `edu-reference/sections/розділ 2.md` — Section 2 NPP input form
- `edu-reference/sections/розділ 3.md` — Section 3 NPP input form (largest, most complex)
- `edu-reference/sections/розділ 4.md` — Section 4 NPP input form
- `edu-reference/sections/розділ 5.md` — Section 5 NPP input form (Moodle courses)
