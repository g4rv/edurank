# EduRank — Development Learning Notes

A personal reference guide built while developing the EduRank platform.
Topics are organized by concept — not by session — so you can look up what you need.

---

## Table of Contents

1. [Infrastructure & DevOps](#1-infrastructure--devops)
2. [Database Fundamentals](#2-database-fundamentals)
3. [Prisma ORM](#3-prisma-orm)
4. [Next.js Concepts](#4-nextjs-concepts)
5. [Authentication](#5-authentication)
6. [React Patterns](#6-react-patterns)
7. [Forms & Validation](#7-forms--validation)
8. [UI Patterns & Components](#8-ui-patterns--components)
9. [Testing](#9-testing)
10. [TypeScript Tips](#10-typescript-tips)
11. [Troubleshooting Reference](#11-troubleshooting-reference)
12. [Architectural Decisions Log](#12-architectural-decisions-log)
13. [References](#13-references)

---

## 1. Infrastructure & DevOps

### Docker

Docker packages an app and everything it needs into a **container** — a tiny isolated environment that runs inside your machine. Solves the "works on my machine" problem.

| Concept | What it is |
|---|---|
| **Image** | Blueprint/snapshot (like a class in OOP). Read-only. Downloaded from Docker Hub. |
| **Container** | A running instance of an image (like an object from a class). |
| **Volume** | A persistent folder that survives container restarts. Without it, all data is lost when a container stops. |
| **Network** | Virtual network that lets containers talk to each other by service name. |
| **docker-compose.yml** | Defines multiple containers and how they connect. One command to start everything. |

#### Key commands

```bash
docker compose up -d      # start all containers in background
docker compose stop       # stop containers (data is safe)
docker compose down       # stop + remove containers (data still safe)
docker compose down -v    # nuclear — removes containers AND all data (volumes)
docker compose ps         # check status of running containers
```

#### Port mapping

Format in `docker-compose.yml`: `"HOST_PORT:CONTAINER_PORT"`

- Left side = port on your actual machine
- Right side = port inside the container
- Example: `"5433:5432"` → Postgres runs on 5432 inside, you connect via 5433

#### Why containers talk by service name, not localhost

Adminer runs inside Docker. When it connects to Postgres it uses `postgres` (the service name), not `localhost`. `localhost` inside a container means *the container itself*, not your machine.

#### Volumes: named vs host path

```yaml
# Named volume — Docker manages the location. For data only Docker needs.
- postgres_data:/var/lib/postgresql/data

# Host path — maps to a real folder on your machine. For files you want to access directly.
- ./backups:/backups
```

---

### Database Backups

#### How pg_dump works

`pg_dump` is PostgreSQL's built-in backup tool. It takes a consistent snapshot and writes a `.sql` file — a series of `CREATE TABLE` and `INSERT INTO` statements. To restore: pipe the file back into `psql`.

Key property: **pg_dump doesn't lock the database**. PostgreSQL's MVCC (Multi-Version Concurrency Control) takes a snapshot at backup start — users can keep reading and writing while the backup runs.

#### Backup container approach

Instead of a host cron job (OS-level, not portable), use a dedicated Docker container whose only job is running backups on a schedule. The `prodrigestivill/postgres-backup-local` image handles scheduling, compression, and rotation automatically. Everything stays inside Docker Compose.

#### Cron syntax

```
┌─ minute  (0–59)
│ ┌─ hour   (0–23)
│ │ ┌─ day of month (1–31)
│ │ │ ┌─ month (1–12)
│ │ │ │ ┌─ day of week (0–7)
│ │ │ │ │
0 2 * * *    ← 2:00 AM every day
```

`*` means "every possible value". Common patterns:

```
0 2 * * *     every day at 2 AM
0 2 * * 0     every Sunday at 2 AM
0 */6 * * *   every 6 hours
```

#### Three-tier backup retention

Instead of keeping every daily backup forever:

| Tier | Count | Covers |
|---|---|---|
| Daily | 7 | last 7 days |
| Weekly | 4 | last 4 weeks |
| Monthly | 6 | last 6 months |

**17 files maximum** at any moment — 6 months of coverage without 180× disk usage. Recovery granularity: daily for "broke today", weekly for "noticed 2 weeks later", monthly for "something went wrong months ago".

---

### Secrets Management (.env files)

- Never put secrets (passwords, API keys) directly in code — they can end up in git.
- `.env` — real secrets, listed in `.gitignore`, never committed.
- `.env.example` — placeholder values, committed to git so teammates know what to fill in.
- In `docker-compose.yml`, `${VARIABLE_NAME}` reads from `.env` automatically.

---

## 2. Database Fundamentals

### Database URL anatomy

```
postgresql://edurank_user:password@localhost:5432/edurank
```

| Part | Meaning |
|---|---|
| `postgresql://` | Protocol — what kind of DB |
| `edurank_user` | Username |
| `password` | Password |
| `localhost` | Host — where the DB is running |
| `5432` | Port — which "door" to knock on |
| `edurank` | Database name |

### Why PostgreSQL

Our data is highly relational: professors → departments → faculties. PostgreSQL is the best fit:

- Handles relationships (foreign keys, joins) natively
- Enums — enforces valid values at DB level
- Row Level Security — DB itself controls who sees what row
- Industry standard, best Prisma support

| | SQLite | MySQL | PostgreSQL |
|---|---|---|---|
| Runs as | A single file | Server | Server |
| Concurrent writes | Poor (locks file) | Good | Excellent |
| Advanced features | Minimal | Good | Best-in-class |

### EduRank data relationships

```
Faculty (e.g. "Faculty of Engineering")
  └── Department (e.g. "Computer Science")       [many departments per faculty]
        └── Professor (e.g. "Ivan Kovalenko")    [many professors per department]

User (platform login accounts — separate from professors)
```

#### Two parallel organisational structures

A university has two separate trees:

```
Academic structure:            Administrative structure:
Faculty (Факультет)            Division (Відділ)
  └── Department (Кафедра)       └── Users (staff who work there)
        └── Professor
```

- **Academic** — defines where professors work and teach
- **Administrative** — defines who manages specific data about professors

A Division contains *staff*, not professors. Different divisions own different slices of professor data (e.g. Educational Division owns ratings, Quality Assurance Division owns accreditation data).

### Ukrainian academic degree system

Ukraine has two parallel systems since the 2016 reform:

| Old system (pre-2016) | New system (post-2016) |
|---|---|
| кандидат наук | доктор філософії (PhD equivalent) |
| доктор наук | доктор наук (unchanged) |

Both titles still appear in real professor data — someone who graduated in 2013 keeps "кандидат наук". For official documents the exact title matters; you can't substitute one for the other.

---

## 3. Prisma ORM

### What an ORM is

ORM = Object Relational Mapper. Translates TypeScript into SQL so you don't write raw queries.

```typescript
// Instead of: SELECT * FROM professors WHERE department_id = '...'
const professors = await prisma.professor.findMany({
  where: { departmentId: '...' },
});
// Result is fully typed — editor knows professor.firstName exists
```

### schema.prisma structure

Three sections:
- `generator client` — generates TypeScript types
- `datasource db` — which database to connect to
- `model X { }` — one model = one table in Postgres

### Migrations workflow

When you change the schema, never edit the DB directly:

```bash
# 1. Edit prisma/schema.prisma
# 2. Run:
npx prisma migrate dev --name describe_the_change
# 3. Commit the generated file in prisma/migrations/
```

Prisma generates a `.sql` file, applies it to the DB, and saves it in `prisma/migrations/`. Migrations are committed to git — full history of every DB change.

### Prisma singleton in Next.js

Next.js hot-reloads modules in development. Creating `new PrismaClient()` directly would open a new DB connection on every reload → connection limit hit fast.

**Fix:** Store the client on `global` (which survives hot reloads):

```typescript
// src/lib/prisma.ts
const globalForPrisma = global as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### Prisma 7 — explicit adapter required

Prisma 7 no longer reads `DATABASE_URL` automatically. You must pass an adapter:

```typescript
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg(process.env.DATABASE_URL!);
new PrismaClient({ adapter });
```

### Prisma error codes

When Prisma throws a known database error, it wraps it in `PrismaClientKnownRequestError` with a `code`:

| Code | Meaning | Example |
|---|---|---|
| `P2002` | Unique constraint violation | Creating a faculty with a name that already exists |
| `P2003` | Foreign key constraint violation | Deleting a faculty that still has departments |
| `P2025` | Record not found | Updating or deleting a row that doesn't exist |

```typescript
import { Prisma } from '@/generated/prisma/client';

try {
  await prisma.faculty.delete({ where: { id } });
} catch (error) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  ) {
    return NextResponse.json({ error: 'Cannot delete — has children' }, { status: 409 });
  }
  throw error; // re-throw anything unexpected
}
```

`instanceof` check first, then `error.code` — this ensures you only handle Prisma errors.

### Foreign keys and delete behavior

- `onDelete: Cascade` — delete parent → children deleted automatically (User → Sessions)
- `onDelete: Restrict` — delete parent is BLOCKED if children exist (Faculty → Departments)

### Optional fields

Adding `?` to a field type makes it optional — nullable in DB, `null` in TypeScript:

```prisma
model Professor {
  patronymic String?   // stored as NULL if not provided
}
```

In JSX, `null` renders as nothing — no extra handling needed.

### Circular references — named relations

When two models reference each other (Department has a Professor as head, Professor belongs to a Department), Prisma needs named relations to distinguish which is which:

```prisma
// Owner side — holds the actual foreign key column
model Department {
  headId String?  @unique
  head   Professor? @relation("DepartmentHead", fields: [headId], references: [id])
}

// Back-relation side — virtual, no DB column
model Professor {
  headOfDepartment Department? @relation("DepartmentHead")
}
```

The same string `"DepartmentHead"` on both sides tells Prisma these are the two ends of the same relationship. **Back-relations create no column in the DB** — they only exist in TypeScript as a convenience.

### @unique on a foreign key

```prisma
headId String? @unique
```

- Without `@unique`: many departments could share the same professor as head (one-to-many)
- With `@unique`: each `headId` can only appear once — one professor leads at most one department (one-to-one)

**Rule:** Add `@unique` when the real-world constraint is "one person can only hold this role in one place at a time."

### Seed scripts

A seed script populates the database with initial data before anyone uses the app.

In Prisma 7, the seed command is configured in `prisma.config.ts`:

```typescript
migrations: {
  path: "prisma/migrations",
  seed: "tsx prisma/seed.ts",
}
```

Use `upsert` instead of `create` so the seed is safe to run multiple times:

```typescript
await prisma.user.upsert({
  where: { email },
  update: {},                // do nothing if user already exists
  create: { email, passwordHash, role: 'ADMIN' },
});
```

**Idempotent** = running the operation multiple times produces the same result as running once.

### npm scripts for common DB tasks

```json
"scripts": {
  "db:migrate":  "npx prisma migrate dev",
  "db:generate": "npx prisma generate",
  "db:studio":   "npx prisma studio",
  "db:reset":    "npx prisma migrate reset --force",
  "seed":        "npx prisma db seed"
}
```

| Script | Purpose |
|---|---|
| `db:migrate` | Create and apply a migration (prompts for name), auto-generates client |
| `db:generate` | Regenerate TypeScript client only (e.g. after enum changes) |
| `db:studio` | Open visual DB browser in browser |
| `db:reset` | Nuclear: drops DB, reapplies all migrations, runs seed |

### Translating a spreadsheet into a schema

When adding fields from an existing spreadsheet to Prisma, don't copy the structure blindly. Ask three questions per field:

1. **Is this a foreign key disguised as a string?** A `department String?` that stores a name should be a proper `departmentId` relation — otherwise you lose filtering, get typos, and can't delete safely.
2. **Is this enum value actually two separate concepts?** `AcademicRank` mixed *вчене звання* (awarded by ministry) with *посада* (set by university). A professor can be "доцент за посадою" without holding the "вчене звання доцента". Split into two enums.
3. **Is this boolean better than extra enum variants?** `CANDIDATE_PHD_DEPARTMENT_SPECIFIC` as an enum value doubles the enum size just to track a yes/no fact. A `degreeMatchesDepartment Boolean?` field is clearer — two concerns stay independent.

---

## 4. Next.js Concepts

### Route groups

Folders wrapped in `(parentheses)` are invisible in the URL:

```
src/app/(auth)/login/page.tsx  →  accessible at /login  (not /auth/login)
```

Used purely for organisation — grouping related pages without affecting URLs.

### Dynamic segments in API routes

```
src/app/api/faculties/route.ts        →  /api/faculties
src/app/api/faculties/[id]/route.ts   →  /api/faculties/abc123
```

In Next.js 16, `params` (and `searchParams`) are **Promises** — you must `await` them before reading:

```typescript
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // ...
}
```

### Static vs dynamic rendering

Next.js tries to pre-render pages at **build time** by default. This breaks for pages that query a database.

| Mode | When page renders | Use for |
|---|---|---|
| Static (default) | Once at `npm run build` | Pages with static content |
| Dynamic | On every request | Pages that query Prisma directly |

```typescript
// Force dynamic rendering for any page that queries the DB
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const professors = await prisma.professor.findMany();
  // ...
}
```

Without `force-dynamic`, the page would show the professor list from build time — stale after any DB change.

**Rule:** If a page file imports Prisma and queries it at the top level → add `export const dynamic = "force-dynamic"`.

API routes and Server Actions are already dynamic by nature — no config needed.

### Request lifecycle

```
Browser request
  → proxy.ts runs (access control)
  → if NextResponse.next():
      → /api/* path    → API route handler → returns JSON
      → any other path → page component   → returns HTML
```

### API routes

API routes are files inside `src/app/api/` that export named functions matching HTTP methods:

```typescript
export async function GET() {
  const professors = await prisma.professor.findMany();
  return Response.json(professors);
}

export async function POST(request: Request) {
  const body = await request.json();
  const professor = await prisma.professor.create({ data: body });
  return Response.json(professor);
}
```

### Server Components can call Prisma directly

A Server Component that needs data can query Prisma directly — no HTTP round-trip needed:

```typescript
// ✓ Server Component — call Prisma directly
export default async function HomePage() {
  const professors = await prisma.professor.findMany({ ... });
}

// API routes are for client-side code that can't import Prisma
```

### Parallel DB queries

When a page needs data from multiple tables, fetch in parallel:

```typescript
// Sequential — each query waits for the previous one
const faculties = await prisma.faculty.findMany();
const departments = await prisma.department.findMany();

// Parallel — all queries run at the same time
const [faculties, departments] = await Promise.all([
  prisma.faculty.findMany(),
  prisma.department.findMany(),
]);
```

### Proxy (middleware)

`src/proxy.ts` is the global gatekeeper — one file, one function, all access control in one place:

```typescript
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!session && !isPublic) return NextResponse.redirect(new URL('/login', request.url));
  if (pathname.startsWith('/admin') && role !== 'ADMIN') return NextResponse.redirect(...);

  return NextResponse.next();
}
```

The `request` describes the **incoming HTTP request** — not the page. The proxy runs before the page renders. If it returns `NextResponse.redirect()`, the page never runs.

**Exclude `api/auth` from the matcher** — that's Auth.js's login route. If the proxy intercepted it, logging in would redirect to `/login` before Auth.js could respond → infinite loop:

```typescript
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
```

> **Next.js 16 note:** Proxy files always run on Node.js runtime by default. Do NOT export `runtime` — it causes a build error.

### Shared layout

`src/app/layout.tsx` wraps every page. Adding a component there makes it appear on all pages:

```typescript
export default function RootLayout({ children }) {
  return (
    <html>
      <body className="flex min-h-full flex-col">
        <Header />    {/* appears on every page */}
        {children}    {/* the actual page content */}
      </body>
    </html>
  );
}
```

---

## 5. Authentication

### How JWT auth works

No session stored in DB. The token lives only in a browser cookie.

```
LOGIN:
  1. User submits email + password
  2. authorize() looks up user in Postgres — one DB query
  3. bcryptjs.compare(input, storedHash) → true/false
  4. If match → Auth.js creates a signed JWT token → stored in cookie

EVERY REQUEST:
  1. Browser sends cookie automatically
  2. Auth.js verifies the signature using AUTH_SECRET
  3. If valid → reads user id/role directly from token
  4. No DB query at all
```

**Analogy:** A signed wristband at a concert. Checked once at the door (login), trusted on sight after that.

### bcrypt and password hashing

Passwords are never stored in plain text — only a hash.

- **Hash** = one-way transformation. Cannot be reversed.
- **bcrypt** = intentionally slow hashing algorithm. Makes brute-force attacks infeasible.
- **Salt** = random string mixed into the hash before computation. Stored inside the hash string itself.

```
REGISTRATION:  bcrypt.hash("mypassword", 10)  →  "$2b$10$xK9mP2...hash"
LOGIN:         bcrypt.compare("mypassword", "$2b$10$xK9mP2...hash")  →  true
```

`compare()` extracts the salt from the stored hash, re-hashes the input with the same salt, and checks if they match.

### Auth.js callback data flow

`authorize()`, `jwt()`, and `session()` are three separate steps:

```
LOGIN:
  authorize() → returns user object { id, email, role }
      ↓  passed as "user" argument to jwt()
  jwt() → copies id and role onto the token → token signed into cookie

EVERY SUBSEQUENT REQUEST:
  cookie decrypted → becomes "token" in jwt()
  jwt() runs but user is undefined → token returned unchanged
      ↓
  session() shapes token into what app code sees via auth()
```

`authorize()` output is a **one-time handoff** to `jwt()` at login. After that, the token lives in the cookie.

```typescript
jwt({ token, user }) {
  if (user) {        // only true at login — authorize() just ran
    token.id = user.id;
    token.role = user.role;
  }
  return token;      // all other requests: return what was in the cookie
}
```

**Mental model:** The cookie is a locked box. Auth.js opens it on every request, hands you the contents, you look at it and hand it back, Auth.js locks it again.

### Auth.js callbacks are predefined slots

| Callback | When it runs |
|---|---|
| `jwt` | Token created (login) or read (every request) |
| `session` | When app code calls `auth()` or `useSession()` |
| `authorized` | In proxy to allow or block a request |
| `signIn` | After login — lets you reject specific users |

### Three-tier role model

| Role | Access | Can edit |
|---|---|---|
| `ADMIN` | Everything | All fields on any professor |
| `EDITOR` | Full professor list | Only their division's fields |
| `USER` | Their own profile only | Email + research profile URLs |

`EDITOR` is tied to a `Division` via `User.divisionId`. `USER` is linked to their own professor record via `User.professorId`.

### User ↔ Professor link

`User` (login account) and `Professor` (data record) are separate models:

```prisma
model User {
  professorId String?    @unique
  professor   Professor? @relation(fields: [professorId], references: [id])
}
```

`@unique` ensures one professor has at most one login account.

### professorId in the JWT

Include `professorId` in the JWT so the proxy can route USER accounts directly to their profile page without a DB lookup on every request. Since `professorId` is set at account creation and never changes, storing it in the JWT is safe.

### sessionVersion — JWT revocation

Pure JWTs can't be revoked. If you change a user's role, their old token still says the old role until it expires.

The `sessionVersion` pattern adds one integer to `User`. Every JWT stores the version at login. On each request, the version in the token is compared to the DB — mismatch means force re-login.

```
User in DB:  { sessionVersion: 3 }
User's JWT:  { ..., sessionVersion: 3 }  ✓ match → allow

Admin changes role → DB: sessionVersion: 4
User's JWT still has 3               ✗ mismatch → force re-login
```

Cost: one lightweight SELECT per request.

### Role-based guards on API routes

The proxy ensures a session exists but doesn't enforce roles. Role checks belong inside each handler:

```typescript
const session = await auth();
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
if (session.user.role === 'USER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
```

Standard pattern:
- `GET` — any authenticated user
- `POST / PUT` — EDITOR or ADMIN only
- `DELETE` — ADMIN only

### TypeScript type augmentation for Auth.js

Auth.js's built-in `Session` type doesn't include `id` or `role`. Extend it without hacking the library:

```typescript
// src/types/next-auth.d.ts
declare module 'next-auth' {
  interface Session {
    user: { id: string; email: string; role: Role };
  }
}
```

### How to debug Auth.js errors

Auth.js wraps internal errors in `CallbackRouteError`. The browser network tab only shows the RSC payload (unhelpful). The **Next.js dev server terminal** prints the full error:

```
[auth][cause]: PrismaClientKnownRequestError: Value 'USER' not found in enum 'Role'
```

Look for `[auth][cause]` — that's the actual error.

---

## 6. React Patterns

### Server Actions

A function marked `"use server"` runs on the server when a form is submitted. No API route needed:

```typescript
async function loginAction(formData: FormData) {
  "use server";
  // runs on server, has access to DB, env vars, etc.
}

<form action={loginAction}>...</form>
```

**Important:** `"use server"` at the top of a file marks EVERY export as a Server Action — including React components, which breaks them. Put it inside the function, or in a dedicated `actions.ts` file.

#### Shared auth guard

When multiple Server Actions need the same check, extract a helper:

```typescript
async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') redirect('/');
}
```

`redirect()` inside `requireAdmin()` throws a special Next.js error that propagates up automatically.

#### Inline Server Actions

For one-off actions like logout, define them inline:

```typescript
export async function Header() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button type="submit">Logout</button>
    </form>
  );
}
```

### React Context — global state without prop drilling

**Problem:** Passing `showToast` down through every component level ("prop drilling").

**Solution:** React Context creates a global state container any component can access.

1. **Create Context** — `const ToastContext = createContext()`
2. **Provide it** — wrap app with `<ToastContext.Provider value={...}>`
3. **Consume it** — any child calls `useContext(ToastContext)`

Wrap it in a custom hook for safety:

```typescript
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
```

### React portals — escaping parent CSS constraints

Toasts, modals, and tooltips need to appear on top of everything. If rendered inside a parent with `overflow: hidden`, they get clipped.

`ReactDOM.createPortal()` renders a component into a different part of the DOM, outside its parent:

```typescript
createPortal(
  <Toast />,
  document.getElementById('toast-root') // renders at top level
);
```

The toast DOM node lives outside the app tree, unaffected by parent styles. But React still treats it as a child for Context and event handling.

### forwardRef

`forwardRef` allows a component to expose a ref to its parent. Required for reusable input/button/interactive components so libraries like React Hook Form work correctly.

```typescript
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, ...props }, ref) => <button ref={ref} {...props}>{children}</button>
);
```

### useMemo — stable Context values

When a component re-renders, any object literal defined inside it is a **new object in memory** — even if its contents haven't changed. This causes all Context consumers to re-render unnecessarily.

```typescript
// ❌ New object every render
const value = { success: (msg) => addToast(msg, 'success') };

// ✓ Same reference if addToast hasn't changed
const value = useMemo(
  () => ({ success: (msg) => addToast(msg, 'success') }),
  [addToast]
);
```

**Rule:** Any object passed as a Context value should be wrapped in `useMemo`.

### useRef — mutable values without re-renders

`useState` is for values that should cause a re-render when changed.
`useRef` is for values that need to persist across renders but **should NOT** trigger a re-render.

```typescript
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const remainingRef = useRef(5000);
```

Good uses: timer IDs, time measurements (`Date.now()` snapshots), previous values of props.

**Mental model:** `useState` is a signal to React — "please re-render." `useRef` is a sticky note on the component — "remember this, but don't redraw."

### Hydration and the mounted state pattern

**Hydration** is when React attaches to server-rendered HTML on the client. React expects the first client render to match exactly what the server rendered.

**The problem with `typeof window` checks:**

```typescript
// Server: returns null
// Client (first render): returns <div>  → MISMATCH ❌
if (typeof window === 'undefined') return null;
```

**The fix — mounted state:**

```typescript
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true); // only runs after hydration
}, []);

if (!mounted) return null; // both server and first client render return null ✓
```

`useEffect` only runs on the client, never on the server — perfect for client-only state.

### React key remounting trick

When a component's `key` prop changes, React unmounts the old one and mounts a fresh one. All local state (including refs and timers) is reset.

Useful for "refreshing" a component without restructuring internals:

```typescript
const id = crypto.randomUUID(); // new id → new key → React remounts component
const refreshed = { id, message, type };
return prev.map((t) => (t.id === existing.id ? refreshed : t));
```

### useCallback dependency gotcha — infinite loops

```typescript
// ❌ toast changes reference every render → infinite loop
useEffect(() => {
  if (state?.success) toast.success(state.success);
}, [state, toast]);

// ✓ Only trigger when state changes
useEffect(() => {
  if (state?.success) toast.success(state.success);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [state]);
```

The `toast` object from `useToast()` changes reference on every render. Adding it to deps triggers the effect → shows toast → context updates → toast reference changes → effect runs again → infinite loop.

### Hover-pause with remaining time

A `setTimeout` can't be paused — only cleared and restarted. Track elapsed time to resume with the remainder:

```typescript
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const remainingRef = useRef(DURATION);

useEffect(() => {
  if (isPaused) return;

  const startedAt = Date.now();
  timerRef.current = setTimeout(onClose, remainingRef.current);

  return () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isPaused]);
```

When `isPaused` → `true`: cleanup runs, saves remaining time. When `isPaused` → `false`: new timer starts with saved remainder.

### Managing multiple toasts with array state

```typescript
const [toasts, setToasts] = useState<Toast[]>([]);

function addToast(message: string, type: ToastType) {
  const id = crypto.randomUUID();
  setToasts((prev) => [...prev, { id, message, type }]);
}

function removeToast(id: string) {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}
```

`crypto.randomUUID()` generates globally unique IDs — built into modern browsers and Node.js.

---

## 7. Forms & Validation

### Zod — schema-first validation

Zod is a TypeScript-first validation library. Define the shape once — Zod both validates at runtime and infers the TypeScript type automatically.

```typescript
const schema = z.object({
  email: z.string().email('Невірний формат'),
  employmentRate: z.coerce.number().min(0.1).max(2),
});

type FormData = z.infer<typeof schema>; // TypeScript type for free
```

**`z.coerce`** — HTML forms submit everything as strings. `z.coerce.number()` converts `"15"` → `15` before validating. Without it, a number schema would reject all form data.

**Why Zod over alternatives:**
- **Yup** — older predecessor. TypeScript inference is weaker — need a separate TS type alongside the schema.
- **Valibot** — modular (~10x smaller than Zod). Better if bundle size matters. For a self-hosted app, Zod is fine.

### react-hook-form

The most widely used React form library. Manages form state **without re-rendering on every keystroke** by using uncontrolled inputs (ref-based).

```tsx
const {
  register,       // connects an input to the form
  handleSubmit,   // wraps submit handler with validation
  formState: {
    errors,        // validation errors per field
    isSubmitting,  // true while handleSubmit is awaiting
  },
} = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: { ... },
});

// Spread register onto an input:
<Input {...register('email')} type="email" />
```

### zodResolver — wiring Zod into react-hook-form

```tsx
import { zodResolver } from '@hookform/resolvers/zod';

useForm({
  resolver: zodResolver(schema),
});
```

When submitted, react-hook-form calls the resolver with raw form values (strings). The resolver passes them through `schema.parseAsync()`. If valid, the coerced output is passed to `handleSubmit`. If invalid, errors go into `formState.errors`.

### react-hook-form + Server Actions pattern

react-hook-form gives you a validated JavaScript object, not `FormData`. Change the Server Action to accept a plain object:

```tsx
// Server Action — accepts typed object
export async function updateProfessor(
  professorId: string,
  data: ProfessorFormValues
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = professorSchema.safeParse(data); // validate server-side too
  // ...
}

// Client Component
const onSubmit = handleSubmit(async (data) => {
  const result = await updateProfessor(professor.id, data);
  if (result.success) toast.success('Збережено');
  else toast.error(result.error);
});

<form onSubmit={onSubmit}>
```

Double validation: react-hook-form on the client for instant feedback, `safeParse` on the server as the security layer.

### z.coerce + zodResolver TypeScript mismatch

`z.coerce.number()` has a Zod input type of `unknown` (accepts anything). This conflicts with react-hook-form's expectation of concrete types.

**Fix:** Cast the resolver explicitly:

```tsx
import { useForm, type Resolver } from 'react-hook-form';

useForm<ProfessorFormValues>({
  // Cast needed: z.coerce.number() has input type `unknown` — runtime is correct.
  resolver: zodResolver(professorSchema) as Resolver<ProfessorFormValues>,
});
```

### useActionState — Server Action responses without URL pollution

**Old way (searchParams):**
- Messages visible in URL bar
- Browser history polluted
- Full page reload required

**New way:**

```typescript
// Server Action returns data
export async function create(prevState: unknown, formData: FormData) {
  "use server";
  try {
    await prisma.create({ ... });
    return { success: "Created" };
  } catch {
    return { error: "Failed" };
  }
}

// Client Component
"use client";
const [state, action, isPending] = useActionState(create, null);

useEffect(() => {
  if (state?.success) toast.success(state.success);
  if (state?.error) toast.error(state.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [state]);

<form action={action}>...</form>
```

### revalidatePath — refreshing cached data after mutations

When a Server Action changes DB data, Next.js doesn't automatically know to refetch. `revalidatePath()` invalidates the cache for a specific path:

```typescript
export async function createFaculty(prevState: unknown, formData: FormData) {
  "use server";
  await prisma.faculty.create({ ... });
  revalidatePath("/admin");   // tell Next.js to refetch /admin data
  return { success: "Created" };
}
```

---

## 8. UI Patterns & Components

### Component naming conventions

**File names:** `kebab-case` — matches Next.js routing conventions, avoids case-sensitivity issues between macOS (case-insensitive) and Linux (case-sensitive).

```
src/components/ui/button.tsx        ✓
src/components/ui/Button.tsx        ✗
```

**Simple components:** single file. **Complex components:** subfolder with `index.ts` barrel export:

```
src/components/data-table/
  index.ts          ← exports { DataTable }
  data-table.tsx    ← main component
  data-table-row.tsx
```

This gives a clean import path: `import { DataTable } from '@/components/data-table'`

### Architectural separation: providers vs components

- **Providers** (state infrastructure) → `src/providers/` — wrap the entire app, supply global state
- **Components** (visual UI) → `src/components/` — imported into pages

Mixing them blurs the distinction between infrastructure and reusable UI.

### Page-specific components subfolder

For components tightly coupled to a specific page (not reusable):

```
src/app/admin/
  page.tsx
  actions.ts
  components/
    faculty-section.tsx
    department-section.tsx
```

When to use: 4+ related files where the components aren't shared across the app.

### Component variants with TypeScript unions

```typescript
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps {
  variant?: ButtonVariant;
}

// Inside component:
className={cn({
  "bg-zinc-900 text-white": variant === "primary",
  "bg-red-600 text-white": variant === "danger",
})}
```

One component, multiple appearances — TypeScript enforces only valid variants.

### Tailwind max-w-* utilities

| Class | Max width | Use for |
|---|---|---|
| `max-w-3xl` | 48rem (768px) | Narrow reading content, forms |
| `max-w-4xl` | 56rem (896px) | Medium content |
| `max-w-7xl` | 80rem (1280px) | Wide layouts, dashboards, tables |

Combined with `mx-auto`, content centers itself and respects max-width on ultrawide screens.

### CSS animations: transform vs width

Animating `width` triggers the browser's **layout** phase on every frame — recalculates positions of all surrounding elements. `transform: scaleX()` runs entirely on the **GPU**, skips layout entirely.

```css
/* ❌ Causes layout recalculation every frame */
@keyframes shrink { from { width: 100%; } to { width: 0%; } }

/* ✓ GPU-only, no layout cost */
@keyframes shrink {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}
```

`transform-origin: left` anchors the shrink to the left edge — bar collapses right-to-left.

### CSS animation: shorthand vs individual properties

The `animation` shorthand implicitly sets `animation-play-state: running`. Mixing it with a separate `animationPlayState` inline style creates ambiguity — browsers handle this inconsistently.

```typescript
// ✓ Use individual properties — no ambiguity
style={{
  animationName: "toast-shrink",
  animationDuration: `${DURATION}ms`,
  animationTimingFunction: "linear",
  animationFillMode: "forwards",
  animationPlayState: isPaused ? "paused" : "running",
}}
```

`animation-play-state: paused` freezes the animation exactly where it is. Setting it back to `running` resumes from the same point.

---

## 9. Testing

### Vitest vs Jest

Both use identical APIs (`describe`, `it`, `expect`). Vitest is the right choice for this project:

| | Jest | Vitest |
|---|---|---|
| TypeScript | Needs `ts-jest` or Babel config | Works natively |
| Path aliases (`@/`) | Needs `moduleNameMapper` config | Reads `tsconfig.json` automatically |
| Speed | Slower | Much faster (uses Vite's pipeline) |

Everything learned here transfers to Jest projects.

### Husky — enforcing rules with git hooks

Git has built-in hook points where it pauses before continuing:

| Hook | When it runs |
|---|---|
| `pre-commit` | Before a commit is created |
| `pre-push` | Before code is pushed to remote |

Husky stores hooks as shell scripts in `.husky/` and commits them to git — every developer gets the same hooks automatically.

We use `pre-push` (not `pre-commit`) because tests can take a few seconds — running on every commit would feel slow.

```bash
# .husky/pre-push
npm test     # if this fails, the push is blocked
```

#### Auto-install with prepare script

```json
"scripts": {
  "prepare": "husky"
}
```

`prepare` runs automatically after `npm install` — any developer who clones and installs gets Husky set up with no manual step.

### Test co-location

Tests live next to the source file they test:

```
src/utils/cn.ts       ← source
src/utils/cn.test.ts  ← tests
```

Benefits: easy to see if a file has tests; moving a file carries its tests naturally.

### Vitest cold start

First `npm test` run is slow (10–44 seconds) — Vitest compiles TypeScript and builds jsdom cache. Subsequent runs complete in under 2 seconds.

`npm run test:watch` keeps Vitest running — re-runs on file save are ~100ms.

### jsdom and React plugin

- **jsdom** — simulates a browser environment in Node.js. Required for tests that render React components.
- **@vitejs/plugin-react** — teaches Vitest to transform JSX. Required for any test that renders a component.

---

## 10. TypeScript Tips

### dependencies vs devDependencies

| Bucket | When included | Use for |
|---|---|---|
| `dependencies` | Always — dev AND production | Code that runs at runtime |
| `devDependencies` | Dev only — stripped from production | Tools that help you build (linters, type checkers, test runners) |

**Rule:** Ask "does the app call this code while users are using it?" If yes → `dependencies`.

Example: `clsx` is used in `cn.ts` which is called by UI components at runtime → `dependencies`. `dotenv` only runs during `npx prisma migrate dev` → `devDependencies`.

### tsx vs ts-node for Node.js scripts

`ts-node` breaks with Next.js's `tsconfig.json` because Next.js uses `"module": "esnext"` and `"moduleResolution": "bundler"` — settings `ts-node` doesn't understand.

`tsx` handles these settings correctly with zero extra config.

### Path aliases don't work in Node.js scripts

`@/*` is a Next.js bundler feature resolved at build time, not by Node.js at runtime. Plain Node scripts (like seed files) don't know what `@/` means.

**Fix:** Use relative imports in seed files and instantiate Prisma directly rather than importing the singleton.

### ESLint: ignoring intentionally unused variables

The convention is to prefix unused variables with `_`. Configure ESLint to stop warning:

```javascript
// eslint.config.mjs
{
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
  },
}
```

`caughtErrorsIgnorePattern` is the one that matters most for catch blocks in Server Actions.

### npm audit

```bash
npm audit              # show all vulnerabilities
npm audit fix          # fix without breaking changes
npm audit fix --force  # fix all, including breaking changes (use with care)
```

Not all vulnerabilities require action. Dev-tool dependencies with vulnerabilities don't affect your running app. Focus on runtime dependencies with high/critical severity.

---

## 11. Troubleshooting Reference

### searchParams is a Promise in Next.js 16

**Error:** `Route "/login" used searchParams.error. searchParams is a Promise and must be unwrapped with await`

**Fix:** `await` the prop before accessing it:

```typescript
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
}
```

---

### Prisma seed config ignored from package.json

**Error:** `npx prisma db seed` prints "No seed command configured"

**Why:** Prisma 7 moved seed config out of `package.json` into `prisma.config.ts`.

**Fix:**
```typescript
// prisma.config.ts
migrations: {
  path: "prisma/migrations",
  seed: "tsx prisma/seed.ts",
}
```

---

### Seed script ECONNREFUSED

**Error:** `PrismaClientKnownRequestError: ECONNREFUSED`

**Why:** Docker wasn't running — nothing listening on port 5432.

**Fix:** `docker compose up -d` before running the seed.

---

### Build fails querying DB at build time

**Error:** `npm run build` fails with `ECONNREFUSED`

**Why:** Next.js tries to pre-render pages at build time. Pages that query the database need `force-dynamic`.

**Fix:**
```typescript
export const dynamic = 'force-dynamic';
```

---

### Prisma types out of sync after schema change

**Error:** `Property 'patronymic' does not exist on type Professor`

**Why:** Migrations update the database but don't always regenerate the TypeScript client.

**Fix:** `npx prisma generate`

**Rule:** If login or any DB query fails after a migration, `prisma generate` is always the first thing to check.

---

### Migration renamed enum but client not regenerated

**Error:** `[auth][cause]: PrismaClientKnownRequestError: Value 'USER' not found in enum 'Role'`

**Why:** Migration applied (SQL enum updated), but the Prisma TypeScript client in `src/generated/prisma/` still had the old value. When Prisma tried to deserialize the `role` column, it didn't recognise the new value.

**Fix:** Always run `npx prisma generate` after a migration that changes enum values.

---

### Next.js 16 proxy runtime export not allowed

**Error:** `Route segment config is not allowed in Proxy file`

**Why:** Next.js 16 proxy files always run on Node.js by default. Exporting `runtime` is no longer valid.

**Fix:** Remove `export const runtime = 'nodejs'` from `proxy.ts`.

---

### Hydration mismatch with portal

**Error:** `Uncaught Error: Hydration failed because the server rendered HTML didn't match the client`

**Why:** `typeof window === "undefined"` check renders differently on server (null) vs first client render (portal div).

**Fix:** Use the mounted state pattern:
```typescript
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);
if (!mounted) return null;
```

---

### Infinite toast loop with useEffect dependencies

**Error:** Toasts appear infinitely in an endless loop.

**Why:** `toast` from `useToast()` changes reference every render, included in `useEffect` deps → triggers effect → context updates → new reference → triggers again.

**Fix:** Remove `toast` from the dependency array.

---

### gunzip not available on Windows PowerShell

**Error:** `The term 'gunzip' is not recognized`

**Fix:** Run inside the Docker container: `docker compose exec postgres-backup gunzip -c /backups/last/file.sql.gz > backups/edurank.sql`

Or open the `.sql.gz` file directly in VS Code — it reads gzip files natively.

---

### gunzip -k fails on hard-linked backup file

**Error:** `gzip: file.sql.gz has 3 other links -- file ignored`

**Why:** The backup container creates hard links between daily/weekly/monthly tiers. `gunzip -k` refuses hard-linked files.

**Fix:** Use `-c` (stdout) and redirect: `gunzip -c /backups/last/file.sql.gz > backup.sql`

---

### zodResolver type mismatch with z.coerce

**Error:** `Type 'Resolver<..., unknown, ...>' is not assignable to type 'Resolver<..., number | null | undefined, ...>'`

**Why:** `z.coerce.number()` has Zod input type `unknown`. `zodResolver` infers the form type from the schema input type — breaks TypeScript inference. Runtime is correct.

**Fix:**
```typescript
resolver: zodResolver(professorSchema) as Resolver<ProfessorFormValues>,
```

---

### useState used as a side-effect hook

**Error:** Attempt to run side effects inside `useState(() => { setMounted(true) })`.

**Why:** `useState`'s initializer is for computing the *initial value* — not for side effects.

**Fix:** Use `useEffect` for logic that should run after mount.

---

## 12. Architectural Decisions Log

Key technical choices made during development — what was picked, what was rejected, and why.

### tsx over ts-node

**Chose:** `tsx` | **Rejected:** `ts-node`

Next.js configures `tsconfig.json` with `"module": "esnext"` and `"moduleResolution": "bundler"`. `ts-node` doesn't understand `"moduleResolution": "bundler"` and crashes. `tsx` handles both with zero config.

---

### sessionVersion for JWT revocation

**Chose:** `sessionVersion` field on `User` | **Rejected:** Database sessions

Auth.js Credentials provider forces JWT strategy — database sessions aren't supported. `sessionVersion` gives revocation capability at the cost of one lightweight SELECT per request.

---

### upsert over create in seed script

**Chose:** `prisma.user.upsert()` | **Rejected:** `prisma.user.create()`

`create` crashes on the second run (duplicate email). `upsert` is idempotent — safe to run any number of times.

---

### proxy.ts over middleware.ts

**Chose:** `src/proxy.ts` with `proxy()` | **Rejected:** `src/middleware.ts` with `middleware()`

Next.js 16 deprecated `middleware.ts` and renamed the convention to `proxy.ts`.

---

### Server Component queries Prisma directly

**Chose:** Import Prisma and query directly inside Server Components | **Rejected:** Fetching from own API with `fetch()`

Server Components run on the server — calling your own API adds a full HTTP round-trip with no benefit. Direct Prisma calls are simpler, faster, and fully typed.

---

### Role-based access enforced at two levels

**Chose:** Role checks in both proxy and individual handlers | **Rejected:** Proxy-only access control

The proxy enforces authentication but not roles. API routes can be called directly via `fetch` from client code, bypassing the page entirely.

---

### Dynamic rendering for DB-querying pages

**Chose:** `export const dynamic = "force-dynamic"` | **Rejected:** Static pre-rendering

Pages that query the DB need fresh data on every request. Static pre-rendering bakes in data from build time — stale after any DB change.

---

### React Context for toast state

**Chose:** `ToastContext` wrapping the app | **Rejected:** Prop drilling `showToast` through every component

The toast function needs to be callable from deep inside the component tree. Prop drilling through every intermediate component is unmaintainable.

---

### Portal for ToastContainer

**Chose:** `ReactDOM.createPortal()` at body level | **Rejected:** Rendering inside trigger component

Toasts must appear on top of everything. Rendering inside a parent with `overflow: hidden` clips them. Portals let the DOM node live at body level while React still treats it as a child.

---

### Mounted state pattern for portal hydration

**Chose:** `useState(false)` + `useEffect(() => setMounted(true), [])` | **Rejected:** `typeof window !== "undefined"` check

The `typeof window` check renders differently on server vs first client render → hydration error. The mounted pattern returns `null` on both server and first client render, then switches after `useEffect`. No mismatch.

---

### useActionState over redirect-with-searchParams

**Chose:** Server Actions return `{ success, error }` objects | **Rejected:** `redirect("/admin?success=Created")`

URL-based messages pollute browser history, expose internal state in the address bar, require a full page reload, and break when bookmarked.

---

### Three-tier role model: ADMIN / EDITOR / USER

**Chose:** ADMIN (full access), EDITOR (division-scoped), USER (own profile only) | **Rejected:** Flat model (all non-admins read-only)

The platform has two distinct non-admin needs: staff who manage data domains and professors who fill in their own data. A flat VIEWER role serves neither well.

---

### Division field ownership hard-coded, not DB-driven

**Chose:** TypeScript map in code | **Rejected:** `DivisionFieldPermission` DB table

Requirements are still being discovered. Hard-coded is readable, testable, and editable without a migration. Can be promoted to DB-driven later.

---

### react-hook-form over Conform

**Chose:** `react-hook-form` + `@hookform/resolvers` | **Rejected:** `@conform-to/react` + `@conform-to/zod`

Conform depended on Zod's internal API (`ZodBranded` type). Zod v4 renamed it, causing a runtime crash. Nine months with no compatible Conform release = unmaintained. `@hookform/resolvers@5.x` explicitly supports Zod v4.

---

### Replace duplicate toast in-place

**Chose:** Replace at current position with a new `id` | **Rejected:** Skip/ignore repeated toasts

Silently ignoring repeated feedback hides information — especially bad for error messages. Replacing in-place with a new `id` causes React to remount the Toast component (key change), resetting the timer and progress bar.

---

## 13. References

### Official documentation

- [Next.js 15/16 Docs](https://nextjs.org/docs) — App Router, Server Components, API Routes
- [Next.js Upgrade Guide](https://nextjs.org/docs/app/building-your-application/upgrading) — migration notes between versions
- [Prisma Docs](https://www.prisma.io/docs) — Schema, migrations, queries
- [Prisma 7 Migration Guide](https://www.prisma.io/docs/guides/upgrade-guides/upgrading-versions/upgrading-to-prisma-7) — adapter changes, config file
- [Auth.js (NextAuth v5)](https://authjs.dev) — Credentials provider, JWT, callbacks
- [Tailwind CSS v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide) — renamed classes, CSS-first config
- [Zod Docs](https://zod.dev) — schemas, `z.coerce`, `z.infer`
- [react-hook-form Docs](https://react-hook-form.com) — `useForm`, `register`, `handleSubmit`
- [Vitest Docs](https://vitest.dev) — config, test API
- [Husky Docs](https://typicode.github.io/husky) — git hooks setup

### Key packages

| Package | Purpose |
|---|---|
| `prisma` + `@prisma/client` | ORM and TypeScript client |
| `@prisma/adapter-pg` | Prisma 7 PostgreSQL adapter |
| `next-auth` (v5 beta) | Authentication |
| `bcryptjs` | Password hashing (pure JS, no native deps) |
| `zod` | Schema validation + TypeScript inference |
| `react-hook-form` | Form state management |
| `@hookform/resolvers` | Zod adapter for react-hook-form |
| `tsx` | Run TypeScript files in Node.js |
| `vitest` | Test runner |
| `husky` | Git hooks |
| `prodrigestivill/postgres-backup-local` | Automated DB backups (Docker image) |
