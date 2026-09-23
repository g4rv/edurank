# Аналітика наукової роботи — design

**Status: PLANNING ONLY. Nothing here is built. Open questions answered 2026-09-23 — see the end.** Written 2026-09-22 after the
owner's meeting with the boss, which closed D19 (an official export form) with
«not needed» and replaced it with «analytics inside the system».

Read [`2026-09-15-science-plan-design.md`](./2026-09-15-science-plan-design.md)
first — especially **D30–D35**, the boss's answers. Two of them change the
numbers these screens would display, which is why the build order below puts
the aggregates last.

---

## What was asked for

The owner's words: «who done what · who done what compared to what planned ·
how many people are doing at least something · etc».

Asked which decision the analytics should serve, the answer was **all four**:
chase the people who are behind, report upward, check one person properly, and
see whether the rollout is working. That is four different screen shapes, not
one page, so the first job is to separate them.

## What already exists

`/science-plans` (ННВ + ADMIN) and `/my-department/science-plans` (завідувач /
декан, read-only) already carry:

| stat strip         | per-person table             |
| ------------------ | ---------------------------- |
| Усього позицій     | ПІБ · Кафедра · Ставка       |
| Мають план         | Ціль · Заплановано           |
| Під ціллю          | Виконано · Бракує            |
| Без ставки         | — sortable, filterable by    |
| Нічого не виконано | факультет and кафедра, paged |

So **«how many people are doing at least something» is already answered**, as
its inverse «Нічого не виконано». And **«compared to what planned» exists as
totals** — ціль, план, факт and shortfall per person.

**The gap is «who done WHAT».** `docs/work-remaining.md` already records it:
«no drill-down for a завідувач or ННВ into WHAT a person planned or did, only
totals». You can see that somebody planned 500 and did 180. You cannot see which
works, nor that they planned two статті and delivered a монографія instead.

---

## The shape (owner, 2026-09-22)

**One tab on `/dashboard`, with its own charts, and drill-down through
факультет → кафедра → НПП.**

That is the rating tab's own shape, which is the argument for it: `/dashboard`
already draws `StatStrip` over `OrgTree` (Факультет → Кафедра → count of НПП,
an indented list of links) beside `ScoreDistribution` and `SectionTotals`. The
science tab mirrors it with science numbers.

| level       | what it shows                                                              |
| ----------- | -------------------------------------------------------------------------- |
| університет | stat strip + charts — план vs факт, how many meet the norm                 |
| факультет   | the same figures for one факультет, its кафедри listed under it            |
| кафедра     | its НПП listed, each with ціль / план / факт / бракує                      |
| НПП         | **what they planned beside what they did** — the piece that does not exist |

**The НПП leaf is the whole point.** Everything above it is a rollup of numbers
the app already computes; the leaf is the only genuinely new screen, and it is
the one that answers «who done what».

### One person's page, reached from two places

The leaf should be **one route**, linked from both the dashboard tree and the
chase list on `/science-plans` — not two screens showing the same thing. Whoever
opens it sees the same page; D44 decides whether they may (ADMIN, the overseeing відділ, the person).

### What does NOT move

`/science-plans` stays. It is an operational screen — it chases people, filters,
pages and unlocks plans. `/dashboard` is for looking; `/science-plans` is for
doing. They link to each other and share the person page.

### Adoption — the one thing the tree cannot show

«How many of the 328 have logged in, planned anything, recorded anything, and
how does that move week by week» is not a rollup of the plan data; it is a time
series, and nothing stores one. **Check whether `AuditLog` can answer it before
assuming a new table.** If it cannot, this needs a small weekly snapshot — a
data decision, not a screen. Treat it as a separate, later piece.

## Build order

1. **The rules first** — D36–D46 in the science-plan spec: the oversight flag,
   the factual target, URL-only publications, the execution month, the НПП's
   own corrections. Plan: `docs/superpowers/plans/2026-09-23-science-rules.md`.
   The analytics read the month and the flag, so they come after.
2. **The НПП page** — план beside факт for one person. The only new screen.
3. **The tab and the tree** — університет → факультет → кафедра → НПП, with
   the stat strip at each level.
4. **The charts** — план vs факт, how many meet the norm, which пункти are
   used, and **execution per month** (D41) for the university, a факультет or
   a кафедра.
5. **Adoption** — separately, once the time-series question is answered.

D31 was reversed (D36) and D32 confirmed (D37), so nothing waits on the boss
any more.

## Answered 2026-09-23 (owner)

- **Who may open the НПП page?** ADMIN, the відділ that oversees наукова
  робота (D43 — a division flag, ННВ by default), and the person themselves.
  **Not** `canViewAcademicRecord`: no завідувач, no декан, no other EDITOR (D44).
  The whole dashboard science tab has the same audience minus «the person».
- **Evidence files?** Opened by the person, the overseeing відділ and ADMIN
  only (D45).
- **Mismatches?** Not flagged. Hours against hours, as totals (D38).
- **`/my-department/science-plans` goes.** The owner will bring a head's view
  back if it is asked for.
