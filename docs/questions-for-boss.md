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

## 3. One combination breaks the pattern

**What we found.** Seven of the eight combinations are perfectly regular:
магістр is always ×2 of бакалавр, and контракт is always ×0.175 of бюджет. One is
not — бакалавр, заочна, контракт.

|                 | бюджет | контракт                                  |
| --------------- | ------ | ----------------------------------------- |
| бакалавр заочна | 0.25   | **0.0375** — but the pattern says 0.04375 |
| магістр заочна  | 0.5    | 0.0875 ✓                                  |

> **Питання.** Майже всі значення у файлі узгоджені між собою: магістр завжди
> вдвічі більший за бакалавра, а контракт — це 0,175 від бюджету. Але одна
> комбінація випадає: бакалавр, заочна форма, контракт. Там записано 0,0375, хоча
> за логікою інших клітинок мало б бути 0,04375. Це свідоме рішення чи помилка?

**Why it matters.** Small, but it affects заочні контрактні students, and those
are the largest group in the data (548 of 1389 records).

---

## 4. Менеджмент — 12 or 13?

**What we found.** Додаток 5 gives Менеджмент a норматив of **12**. Постанова КМУ
№1134, which додаток 5 is based on, gives менеджмент **13**. Every other
speciality we checked matches the постанова exactly.

> **Питання.** У Додатку 5 для спеціальності «Менеджмент» вказано норматив 12, а
> в постанові КМУ №1134 для менеджменту — 13. Інші спеціальності збігаються з
> постановою. Це свідоме рішення вченої ради чи описка?

**Why it matters.** A smaller норматив makes each recruited student worth more,
so it changes ставки on that кафедра.

---

## 5. Were the 2025 numbers adjusted by hand?

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

## Smaller ones, if there is time

- **Соціальна робота (11.5) та Публічне управління (12.5)** не мають рядка в
  постанові №1134 — це нові спеціальності. Хто визначив для них норматив і за
  якою аналогією?
- Чи можна отримати список зарахованих здобувачів (наказ) у вигляді файла — щоб
  НПП обирали студента зі списку, а не вписували ПІБ вручну? Це прибрало б
  помилки в іменах і зробило б перевірку дублікатів точною.
