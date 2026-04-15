# Architectural Decisions

A log of technical choices made during development — what was picked, what was rejected, and why.
Exists so future-us doesn't re-debate settled questions.

---

## Session 4

### tsx over ts-node for running TypeScript scripts
**Chose:** `tsx`
**Rejected:** `ts-node`
**Why:** Next.js configures `tsconfig.json` with `"module": "esnext"` and `"moduleResolution": "bundler"`. `ts-node` doesn't understand `"moduleResolution": "bundler"` and crashes immediately. `tsx` handles both settings correctly with zero extra config.

### sessionVersion for JWT revocation
**Chose:** `sessionVersion` field on `User` — an integer incremented to invalidate all active sessions
**Rejected:** Database sessions (storing session records in Postgres)
**Why:** Auth.js Credentials provider forces JWT strategy — database sessions are not supported with it. Switching would require replacing the entire auth setup. `sessionVersion` gives revocation capability (role changes take effect immediately) at the cost of one lightweight `SELECT` per request. Not yet implemented — planned after route protection.

### Seed not hooked into Docker Compose
**Chose:** Standalone `npm run seed` script
**Rejected:** Running seed automatically via a Docker Compose service
**Why:** The seed is a Node.js script that runs on the host machine, not inside a container. Wiring it into Compose would require a dedicated Node container just for seeding — more complexity than the problem warrants. `npm run seed` is explicit and sufficient.

### upsert over create in seed script
**Chose:** `prisma.user.upsert()`
**Rejected:** `prisma.user.create()`
**Why:** `create` crashes on the second run because the email already exists (`@unique`). `upsert` is idempotent — if the user exists it does nothing, if not it creates. Makes the seed safe to run any number of times.

### Removed @auth/prisma-adapter
**Chose:** Remove the package entirely
**Rejected:** Keeping it as a future-use dependency
**Why:** The Prisma adapter is only needed for database sessions (storing session records via Prisma). We use JWT sessions with the Credentials provider — the adapter is never called. Dead dependencies add noise and attack surface.

### Node.js runtime for proxy instead of Edge
**Chose:** `export const runtime = "nodejs"` in `src/proxy.ts`
**Rejected:** Default Edge runtime
**Why:** The proxy calls `auth()` from `src/auth.ts`, which imports Prisma. Prisma uses Node.js-only internals and crashes on the Edge runtime. Forcing Node.js runtime is the correct fix for a self-hosted app — Edge runtime only matters for Vercel CDN deployments, which we're not using.

### proxy.ts over middleware.ts
**Chose:** `src/proxy.ts` with exported `proxy` function
**Rejected:** `src/middleware.ts` with exported `middleware` function
**Why:** Next.js 16 deprecated `middleware.ts` and renamed the convention to `proxy.ts`. Using the deprecated name still works but will produce warnings and may break in a future release.

---

## Session 6

### Server Component queries Prisma directly instead of calling its own API
**Chose:** Import Prisma and query directly inside Server Component page files
**Rejected:** Fetching from `/api/professors` etc. with `fetch()` inside the page
**Why:** Server Components run on the server — calling your own API would add a full HTTP round-trip with no benefit. Direct Prisma calls are simpler, faster, and have full TypeScript types. The API routes exist for client-side code (browser `fetch`) that can't import Prisma.

### Role-based access enforced at two levels
**Chose:** Role checks in both the page/action (redirect non-admins) and the API route handlers (return 403)
**Rejected:** Relying solely on the proxy for all access control
**Why:** The proxy enforces authentication but not roles — it only checks whether a session exists. Role-specific pages need their own check. API routes also need their own guard because they can be called directly via `fetch` from client-side code, bypassing the page entirely.

### Server Actions in a dedicated `actions.ts` file
**Chose:** `src/app/admin/actions.ts` with `"use server"` at the top of the file
**Rejected:** Inline `"use server"` inside each function in `page.tsx`
**Why:** The admin page has six mutations (create/delete × three entities). Putting all of them inline in `page.tsx` would make the file unreadably long. A dedicated file keeps the page focused on layout and the actions file focused on mutations. Also avoids the footgun of accidentally marking React components as Server Actions by putting `"use server"` at the file level in the page.

### patronymic field optional (String?) rather than required
**Chose:** `patronymic String?` — nullable
**Rejected:** `patronymic String` — required
**Why:** Not all professors have a patronymic (foreign staff, some naming conventions). Making it required would force dummy values for those cases. Optional allows the form to leave it blank while keeping the field available for all formal document generation where it exists.
