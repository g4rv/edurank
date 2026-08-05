# Questions for the boss — ставки

> Ukrainian version to hand over: [`questions-for-boss-ua.md`](./questions-for-boss-ua.md).
> This file explains the reasoning in English; that one is the document to show.

Each question has three parts: **what we found** (so you know what you are asking
about), **the question in Ukrainian** (ready to send or read out), and **why it
matters** (what changes in the app depending on the answer).

All of these come from comparing three things: the university's own положення
(`formula.pdf`), the законодавство it is built on, and the real numbers in
`Рейтинг_Профорієнтація.xlsx` for 2025 and 2026 (1389 student records).

None of them block us. The app will store all of these as **settings you can
edit**, so whatever the answer is, nothing needs rewriting.

---

## 1. Денна форма — divide by `2·Nд` or by `Nд`?

**What we found.** The положення says the денна part of the formula is
`Nзд / (2·Nд)`. But the real files record exactly **twice** that.

Example — Початкова освіта, бакалавр, денна, бюджет. Норматив = 10.5.

|                                                   | ставка per student     |
| ------------------------------------------------- | ---------------------- |
| by the formula in the положення: `1 / (2 × 10.5)` | 0.048                  |
| what the 2025 and 2026 files record               | **0.095** = `1 / 10.5` |

Заочна form matches the положення exactly, and the магістр doubling matches too.
Only this one factor of 2 is different.

> **Питання.** У Положенні для денної форми стоїть `Nзд / (2·Nд)`. За цією
> формулою один бакалавр денної форми зі спеціальності «Початкова освіта»
> (норматив 10,5) дає 1/(2×10,5) = 0,048 ставки. Але у файлі
> «Рейтинг_Профорієнтація» за 2025 і 2026 роки записано 0,095 — тобто рівно
> вдвічі більше, 1/10,5. Заочна форма при цьому збігається з формулою.
> Як правильно рахувати денну форму: ділити на 2·Nд чи на Nд?

**Why it matters.** It doubles or halves every full-time student's contribution.

---

## 2. Узгоджуючий коефіцієнт — is it 0.175?

**What we found.** Додаток 5 has a footnote saying a «узгоджуючий коефіцієнт
визначений вченою радою» applies to contract students, but never gives the value.
In the real data, a contract student is worth **0.175** of a budget student, and
this holds in both 2025 and 2026.

Example — бакалавр, денна: бюджет 0.095, контракт 0.017.

> **Питання.** У Додатку 5 є примітка про узгоджуючий коефіцієнт для здобувачів,
> які навчаються за кошти фізичних та/або юридичних осіб, але саме значення не
> вказане. За даними 2025–2026 років контрактний здобувач вартий приблизно 0,175
> від бюджетного. Чи це і є узгоджуючий коефіцієнт? Яке його точне значення і хто
> та коли його затверджує — щороку на вченій раді?

**Why it matters.** We need the number to compute anything, and we need to know
whether it changes each year (then it is a yearly setting) or is fixed.

---

## 3. Менеджмент — 12 or 13?

**What we found.** Додаток 5 gives Менеджмент a норматив of **12**. Постанова КМУ
№1134, which додаток 5 is based on, gives менеджмент **13**. Every other
speciality we checked matches the постанова exactly.

> **Питання.** У Додатку 5 для спеціальності «Менеджмент» вказано норматив 12, а
> в постанові КМУ №1134 для менеджменту — 13. Інші спеціальності збігаються з
> постановою. Це свідоме рішення вченої ради чи описка?

**Why it matters.** A smaller норматив makes each recruited student worth more,
so it changes ставки on that кафедра.

---

## 4. Were the 2025 numbers adjusted by hand?

**What we found.** In 2026 every value in a group is identical, which is what you
expect from a calculation. In 2025 they vary — for бакалавр денна контракт
anywhere from 0.120 to 0.230 of the норматив, where 2026 is exactly 0.175.

> **Питання.** У даних за 2026 рік усі значення в межах однієї групи однакові —
> схоже, що їх рахували за формулою. А за 2025 рік вони різняться: для бакалавра
> денної форми (контракт) від 0,120 до 0,230. Чи були у 2025 році ручні
> коригування, чи діяли інші правила?

**Why it matters.** Tells us whether the app should allow a manual override of a
computed number, or whether the computed value is always final.

---

## 5. Can an НПП get zero?

In 2025, **37 of 175 people (21 %)** got exactly 0, and 34 more got under 0.5 —
41 % below the положення's stated minimum. The lowest per-person cap is now 0.1,
so a zero can no longer be expressed as a cap.

> **Питання.** Чи має залишатися можливість не дати НПП жодної ставки?

## 6. What if a кафедра gets zero ставок?

Two кафедри of 20 had `Кст = 0` in 2025 and everyone got nothing. (A third
shows zero too, but has a second draft with `Кст = 5` — that zero is an unfilled
draft, not a decision.) Under the
formula each person would land on the 0.5 floor, so the кафедра would distribute
ставки it was never given.

> **Питання.** Що система має робити, коли кафедрі не виділено жодної ставки?

## 7. What if there are fewer ставки than people?

With `Кст = 4` and `Кнпп = 8`, even an average person computes to 0.25 and is
raised to 0.5 — so the кафедра's total exceeds its pool. The положення covers a
_surplus_ (priority to гаранти) but says nothing about a shortfall.

> **Питання.** Чи може сума ставок по кафедрі перевищувати Кст?

## 8. Where does a capped person's remainder go?

Formula says 1.2, the cap says 0.75 — the 0.45 has to go somewhere. The old
system had an `undistributed` field, so it simply stayed for manual assignment.

> **Питання.** Пропонуємо так само: залишок показується як «нерозподілено».
> Підходить?

## 9. Are ставки always multiples of 0.05?

**What we found.** In the 2025 distribution **all 226 ставки and all 226 caps**
are exact multiples of 0.05 — a clean ladder from 0 to 1.5. The pool is not: it
is computed from student numbers, and two кафедри have `2.16` and `7.56`. So the
distributed total can never match the pool exactly — «Політології» distributed
2.15 of a 2.16 pool and recorded `undistributed: 0.01`, a remainder smaller than
the step itself.

> **Питання.** Чи правильно, що ставка завжди кратна 0,05, і при рівній відстані
> округлюємо вгору? І чи залишок, менший за 0,05, просто лишається
> нерозподіленим?

**Why it matters.** It decides how every ставка is computed, and whether
«нерозподілено» is a normal state rather than an error.

## Smaller ones, if there is time

- **Соціальна робота (11.5) та Публічне управління (12.5)** не мають рядка в
  постанові №1134 — це нові спеціальності. Хто визначив для них норматив і за
  якою аналогією?
- Чи можна отримати список зарахованих здобувачів (наказ) у вигляді файла — щоб
  НПП обирали студента зі списку, а не вписували ПІБ вручну? Це прибрало б
  помилки в іменах і зробило б перевірку дублікатів точною.

---

# Questions about Характеристика (п.38 of the Ліцензійні умови)

We mapped the 20 positions against the rating that already works: **14 of 20 fill
themselves** from rating data. Since only **4 of 20** are needed for compliance,
most staff should qualify with nothing typed by hand. Full mapping in
[`kharakterystyka.md`](./kharakterystyka.md).

## 10. Patents (position 2)

Position 2 accepts one granted patent, **or** five declaration patents, **or**
five copyright registration certificates. Our rating has three separate
indicators: a granted patent, a _submitted application_, and a copyright
registration.

> **Питання.** Ми плануємо зараховувати отриманий патент і свідоцтва про
> авторське право, але не зараховувати подану заявку. Чи правильно це?

**Why it matters.** Counting applications would let an unsuccessful submission
satisfy a licence position.

## 11. International projects (position 10)

Position 10 wants _participation in_ an international project. Our `3.3` is
preparing and submitting a grant proposal to a competition — if it was not won,
there is no project.

> **Питання.** Чи зараховується подана (але не виграна) заявка на міжнародний
> грант як «участь у міжнародному проєкті»?

**Why it matters.** Small in practice — anyone whose only international activity
is a failed application probably has four other positions anyway.

## 12. Supervising school pupils (position 15)

Position 15 is about **школярі** — pupils placing in МАН or school olympiads. The
rating has no such indicator at all; it only counts здобувачі вищої освіти.

> **Питання.** Чи займаються наші НПП підготовкою школярів до олімпіад та МАН?

**Why it matters.** If they do, it likely deserves a rating indicator rather than
a manual tick repeated every time.

## 13. Practical experience (position 20)

Position 20 wants ≥5 years of practical work in the speciality, **excluding**
teaching and research. We store `pedagogicalExperience`, which is precisely what
it excludes.

> **Питання.** Звідки брати дані про практичний досвід за фахом? Чи є вони у
> відділі кадрів?

**Why it matters.** It is the one position that needs data the app has never
collected.
