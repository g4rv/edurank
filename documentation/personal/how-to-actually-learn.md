# How to Actually Learn (Not Just Follow Along)

> **NOTE TO CLAUDE:** This document is for future personal learning. Ignore it in the context of the EduRank work project. Continue with efficient "I build, you follow" mode for this codebase until the user explicitly requests to switch to active learning mode.

**Context:** This was a conversation during Session 7 when I realized I'm in "recognition" mode, not "application" mode. Saving this for when I have time to learn properly on personal projects.

---

## The Three Levels of Understanding

1. **Recognition** — "I understand what this code does when I look at it"
2. **Recall** — "I could explain this concept without looking"
3. **Application** — "I could build this myself from scratch"

**Current state:** Recognition, maybe touching Recall for basics.
**Goal state:** Application.

---

## The Brutal Truth Test

Close the docs. Answer these without looking:

1. Could you write a Prisma schema for a new model with relationships from memory?
2. Could you create an API route with proper role guards, error handling, and Prisma queries?
3. Could you explain to someone why `Promise.all` matters and when to use it?
4. Could you debug if the admin page returned "Unauthorized" for all users?

If most answers are "no" or "maybe" → you're following along, not learning yet.

---

## What I Probably Understand vs What I Don't

### Probably understand:
- ✅ What Docker is conceptually (containers, volumes, ports)
- ✅ That Prisma is an ORM that translates TypeScript to SQL
- ✅ The general flow of JWT auth (login → token → cookie → verify)
- ✅ That migrations track database changes
- ✅ Basic Next.js routing (folders = URLs)

### Probably DON'T yet have:
- ❌ Muscle memory for writing Prisma queries
- ❌ Intuition for when to use Server Components vs API routes
- ❌ Confidence to debug Prisma error codes without looking them up
- ❌ Ability to write a Server Action from scratch
- ❌ Mental model of full request lifecycle (browser → proxy → page → Prisma → response)

---

## Why Passive Learning Doesn't Work

**Watching someone cook doesn't teach you to cook.**

You can watch Gordon Ramsay make risotto 100 times. You'll understand *what* he's doing. But the first time you try yourself, you'll:
- Forget the order of steps
- Not know how things should *feel* at each stage
- Panic when something doesn't look like the example
- Not know how to recover from mistakes

**That's where I am right now with code.**

---

## Three Active Learning Options

### Option 1: Rebuild Everything (Hard Mode)

**Process:**
1. Delete the project (or start a new folder)
2. Keep documentation as reference only
3. Try to rebuild: Docker → Prisma → Auth → one API route
4. Every time I get stuck = a gap in knowledge = where real learning happens

**Pros:** Know EXACTLY what I don't understand
**Cons:** Frustrating, slow, lots of errors

---

### Option 2: Build Next Features Independently (Medium Mode)

**Process:**
1. Claude doesn't write code first — I try, I share, he reviews
2. When stuck, ask specific questions ("How do I handle multipart form data?")
3. Claude explains concept, maybe shows small example
4. **I write the implementation**
5. Claude reviews and suggests improvements

**Example challenge:** Implement file uploads myself, with Claude as guide only when stuck.

**Pros:** Forced to think, make decisions, debug
**Cons:** Slower than having Claude write it

---

### Option 3: Deliberate Practice on Small Pieces (Focused Mode)

Pick ONE thing. Master it in isolation. Then move on.

**Week 1 example: Prisma queries**
- Create throwaway `test.ts` file
- Write 20 different queries: findMany, findUnique, create, update, delete, include, where, orderBy
- Run them against DB, see results
- NO API routes, NO Next.js — just Prisma

**Week 2: API routes**
- Build 5 different API routes for random things
- One returns list, one takes params, one handles POST, one returns error
- Test with Postman/curl

**Week 3: Server Actions**
- Build 3 forms with Server Actions
- Handle validation, errors, redirects

**Pros:** Focused, builds muscle memory, immediate feedback
**Cons:** Not building "real" features, might feel disconnected

---

## Practice Challenge: Add "position" Field

When ready to test myself, implement this feature:

### Requirements:
1. Add `position` field to Professor model (String, optional) — examples: "Доцент", "Професор", "Асистент"
2. Create and run the migration
3. Update admin page to show position in professor list
4. Update create form to have position input field
5. Update Server Action to save position
6. Update API route to accept position in POST/PUT

### Rules:
- Claude won't write code unless I'm completely stuck
- I share implementation, Claude reviews
- If it doesn't work, I debug (Claude gives hints only)

---

## The Question to Answer

**What's my actual goal?**

| Goal | Appropriate Approach |
|------|---------------------|
| Understand how modern web apps work conceptually | Following along is fine (current mode) |
| Be able to build web apps myself | Must start writing code, making mistakes, debugging |
| Get this specific project done | Having Claude build is efficient, but I'm not learning |

---

## New Working Mode for Active Learning

When I'm ready to actually learn:

**Rule:** For every new feature:
1. **I write the first draft**
2. I share code/questions when stuck
3. Claude reviews, explains, suggests fixes
4. **I implement the fixes**
5. Iterate until it works

Claude still explains the "why" — but I do the typing, debugging, thinking.

---

## When to Use This Guide

- ✅ Personal projects with no deadline pressure
- ✅ When I have 2-3 hours to struggle with a single feature
- ✅ When I want to actually be able to code independently
- ✅ Weekend/evening learning sessions

**Not now:** Work project, tight deadlines, need efficiency over learning.

---

## Resources to Practice With

### Small practice projects to build from scratch:

1. **Todo app** (classic for a reason)
   - Next.js + Prisma + Auth
   - Practice: CRUD, auth, forms, Server Actions

2. **Personal bookmark manager**
   - Save URLs with tags
   - Practice: many-to-many relationships, search, filters

3. **Expense tracker**
   - Record income/expenses, show totals
   - Practice: aggregations, date handling, charts

4. **Recipe book**
   - Recipes with ingredients (many-to-many)
   - Practice: complex relationships, file uploads (images)

Each one: 10-20 hours if I do it myself, learning everything along the way.

---

## Progress Checklist

Track which mode I'm in:

- [ ] Rebuilt the EduRank project from scratch (or similar scope)
- [ ] Built a small project (todo/bookmarks/etc.) completely independently
- [ ] Debugged a production issue without Claude's help
- [ ] Wrote a new feature without referencing existing code
- [ ] Explained Prisma/Next.js/Auth to someone else and they understood

When most of these are checked → I've moved from Recognition to Application.

---

**Saved:** Session 7 (2026-04-15)
**Future me:** You got this. Take the time. Struggle through it. That's where the learning is.
