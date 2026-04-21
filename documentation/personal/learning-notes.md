# Learning Notes

Personal notes from building the EduRank platform. Written to help me remember concepts, not just copy-paste commands.

---

## Docker

### What is Docker?

Docker packages an app and everything it needs into a **container** — a tiny isolated environment that runs inside your machine. It solves the "works on my machine" problem.

- **Image** — a blueprint/snapshot (like a class in OOP). Read-only. Downloaded from Docker Hub.
- **Container** — a running instance of an image (like an object created from a class).
- **Volume** — a persistent folder that survives container restarts. Without it, all data is lost when a container stops.
- **Network** — a virtual network that lets containers talk to each other by service name (e.g. `postgres`, not `localhost`).
- **docker-compose.yml** — a file that defines multiple containers and how they connect. Run everything with one command instead of many.

### Key commands

```bash
docker compose up -d      # start all containers in background (-d = detached)
docker compose stop       # stop containers (data is safe)
docker compose down       # stop + remove containers (data still safe)
docker compose down -v    # nuclear — removes containers AND all data
docker compose ps         # check status of running containers
```

### Port mapping

Format in docker-compose.yml: `"HOST_PORT:CONTAINER_PORT"`

- Left side = port on your actual machine
- Right side = port inside the container
- Example: `"5433:5432"` → Postgres runs on 5432 inside, you connect via 5433

### Why containers talk by service name

Adminer runs inside Docker. When it connects to Postgres it uses `postgres` (the service name from docker-compose.yml), not `localhost`. `localhost` inside a container means the container itself, not your machine.

### Volumes

Without a volume, container data is ephemeral — gone on restart.
Named volumes are managed by Docker and persist independently of containers.

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data # maps named volume to path inside container
```

---

## Databases

### Types

- **SQL (relational)** — data in tables with strict structure and relationships. Query with SQL.
- **NoSQL** — flexible document-based structure (MongoDB, Redis). No fixed schema.

### Why PostgreSQL

Our data is highly relational: professors → departments → faculties. Postgres is the best fit because:

- Handles relationships (foreign keys, joins) natively
- Enums — enforces valid values at DB level
- Row Level Security — DB itself controls who sees what row
- Industry standard, best Prisma support

### SQLite vs MySQL vs PostgreSQL

|                   | SQLite            | MySQL  | PostgreSQL    |
| ----------------- | ----------------- | ------ | ------------- |
| Runs as           | A single file     | Server | Server        |
| Concurrent writes | Poor (locks file) | Good   | Excellent     |
| Advanced features | Minimal           | Good   | Best-in-class |
| Self-hosted       | No server needed  | Yes    | Yes           |

SQLite = prototypes, one person. MySQL = fine but Postgres is stronger. PostgreSQL = our choice.

---

## Database URL

```
postgresql://edurank_user:password@localhost:5432/edurank
```

| Part            | Meaning                         |
| --------------- | ------------------------------- |
| `postgresql://` | Protocol — what kind of DB      |
| `edurank_user`  | Username                        |
| `password`      | Password                        |
| `localhost`     | Host — where the DB is running  |
| `5432`          | Port — which "door" to knock on |
| `edurank`       | Database name                   |

---

## .env files

- Never put secrets (passwords, API keys) directly in code files — they can end up in git.
- `.env` — real secrets, listed in `.gitignore`, never committed.
- `.env.example` — fake placeholder values, committed to git so teammates know what to fill in.
- In docker-compose.yml, `${VARIABLE_NAME}` reads from `.env` automatically.

---

## Prisma

### What is an ORM?

ORM = Object Relational Mapper. Translates TypeScript into SQL so you don't write raw queries.

```typescript
// Instead of: SELECT * FROM professors WHERE department_id = '...'
const professors = await prisma.professor.findMany({
  where: { departmentId: '...' },
});
// Result is fully typed — editor knows professor.firstName exists
```

### schema.prisma

The file where you define your database structure. Three sections:

- `generator client` — generates TypeScript types
- `datasource db` — which database to connect to
- `model X { }` — one model = one table in Postgres

### Migrations

When you change your schema you don't edit the DB manually. Instead:

```bash
npx prisma migrate dev --name describe_the_change
```

Prisma generates a `.sql` file, applies it to the DB, and saves it in `prisma/migrations/`.
Migrations are committed to git → full history of every DB change ever made.

### Prisma singleton in Next.js

Next.js hot-reloads modules in development. Creating `new PrismaClient()` directly would open a new DB connection on every reload → connection limit hit fast.

Solution: store the client on `global` (which survives hot reloads):

```typescript
// src/lib/prisma.ts
const globalForPrisma = global as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

Then anywhere in the app:

```typescript
import { prisma } from '@/lib/prisma';
```

### Foreign keys and delete behavior

- `onDelete: Cascade` — delete parent → children deleted automatically (User → Sessions)
- `onDelete: Restrict` — delete parent is BLOCKED if children exist (Faculty → Departments)

---

## Data relationships (our schema)

```
Faculty (e.g. "Faculty of Engineering")
  └── Department (e.g. "Computer Science")       [many departments per faculty]
        └── Professor (e.g. "Ivan Kovalenko")    [many professors per department]

User (platform login accounts — separate from professors)
  └── Session (one per logged-in browser)
```

---

## Session 1 — Infrastructure

- `docker-compose.yml` — Postgres + Adminer running locally
- `.env` / `.env.example` — secrets management
- `prisma/schema.prisma` — full DB schema with relationships, enums, auth tables
- First migration applied — tables exist in Postgres (verified in Adminer)
- `src/lib/prisma.ts` — singleton client, ready to use in the app

---

## Session 2 — Project hygiene and dependency basics

### dependencies vs devDependencies

`package.json` has two buckets for packages:

| Bucket            | When it's included                  | Use for                                                          |
| ----------------- | ----------------------------------- | ---------------------------------------------------------------- |
| `dependencies`    | Always — dev AND production builds  | Code that runs in the browser or server at runtime               |
| `devDependencies` | Dev only — stripped from production | Tools that help you build (linters, type checkers, test runners) |

**Why it matters:** If a package your app actually _runs_ (like `clsx` in `cn.ts`) is only in `devDependencies`, production builds will crash — the package won't be there.

**The rule of thumb:** Ask "does the app call this code while users are using it?" If yes → `dependencies`. If it only helps you write or check code → `devDependencies`.

In our case:

- `clsx` — used in `cn.ts` which is called by UI components at runtime → `dependencies`
- `dotenv` — used by `prisma.config.ts` which only runs during `npx prisma migrate dev` → `devDependencies`

### What dotenv does

`dotenv` reads your `.env` file and loads the variables into `process.env` so your code can access them. Without it, `process.env.DATABASE_URL` would be `undefined`.

Node.js doesn't load `.env` automatically — you have to explicitly call `import "dotenv/config"` (or `require("dotenv/config")`) at the top of a file. Prisma 7 needs this because it moved the database URL config into `prisma.config.ts`.

### Keeping docs in sync with code

When you delete something (like MinIO from docker-compose), update every place it's mentioned — CLAUDE.md, learning notes, comments. Stale docs are worse than no docs because they actively mislead.

---

## Session 3 — Authentication

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

Analogy: a signed wristband at a concert. Checked once at the door (login), trusted on sight after that.

### bcrypt and password hashing

Passwords are never stored in plain text — only a hash.

- **Hash** = one-way transformation. Cannot be reversed.
- **bcrypt** = intentionally slow hashing algorithm. Makes brute-force attacks infeasible.
- **Salt** = random string mixed into the hash before computation. Stored inside the hash string itself.

```
REGISTRATION:  bcrypt.hash("mypassword", 10)  →  "$2b$10$xK9mP2...hash"
LOGIN:         bcrypt.compare("mypassword", "$2b$10$xK9mP2...hash")  →  true
```

`compare()` extracts the salt from the stored hash, re-hashes the input with the same salt, and checks if they match. You pass in two strings — the plain input and the stored hash — and get back `true` or `false`.

### Prisma 7 breaking change — explicit adapter

Prisma 7 no longer reads `DATABASE_URL` automatically. You must pass an adapter:

```typescript
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg(process.env.DATABASE_URL!);
new PrismaClient({ adapter });
```

### Next.js Server Actions

A function marked `"use server"` runs on the server when a form is submitted. No API route needed — the form's `action` prop points directly to the function.

```typescript
async function loginAction(formData: FormData) {
  "use server"
  // runs on server, has access to DB, env vars, etc.
}

<form action={loginAction}>...</form>
```

**Important:** `"use server"` at the top of a file marks EVERY function as a Server Action, including React components — which breaks them. Put it inside the function only, or in a dedicated `actions.ts` file.

### Route groups in Next.js

Folders wrapped in `(parentheses)` are invisible in the URL:

```
src/app/(auth)/login/page.tsx  →  accessible at /login  (not /auth/login)
```

Used purely for organisation — grouping related pages without affecting the URL structure.

### Auth.js + Credentials = JWT only

The Credentials provider (email + password) forces JWT session strategy. Database sessions are not supported with Credentials. This means the `Session` table was removed — it's not needed.

### TypeScript type augmentation

Auth.js's built-in `Session` type doesn't include `id` or `role`. To add them without hacking the library, create a `.d.ts` file that extends the types:

```typescript
// src/types/next-auth.d.ts
declare module 'next-auth' {
  interface Session {
    user: { id: string; email: string; role: Role };
  }
}
```

This tells TypeScript "when I use `session.user`, it also has these fields."

## What's next

- Seed script — create first admin user for testing login
- Protect routes — redirect to login if no session
- API routes — CRUD for professors/departments
- UI — professor list, add/edit forms

---

## Session 4 — Seed script, tooling cleanup, sessionVersion, route protection

### Seed scripts

A seed script populates the database with initial data before anyone uses the app. Think of it as placing pieces on the board before the game starts — the tables exist but are empty, so you need at least one user to log in as.

In Prisma 7, the seed command is configured in `prisma.config.ts` (not `package.json` — that was the old Prisma 6 convention):

```typescript
// prisma.config.ts
migrations: {
  path: "prisma/migrations",
  seed: "tsx prisma/seed.ts",
}
```

Run it with:

```bash
npx prisma db seed
# or via the npm script we added:
npm run seed
```

### upsert — idempotent writes

The seed uses `upsert` instead of `create`:

```typescript
await prisma.user.upsert({
  where: { email },
  update: {}, // do nothing if user already exists
  create: { email, passwordHash, role: 'ADMIN' },
});
```

**Idempotent** means: running the operation multiple times produces the same result as running it once. This makes the seed safe to run repeatedly without crashing on duplicate emails.

### tsx vs ts-node

`ts-node` is the classic way to run TypeScript files directly in Node.js. But it breaks with Next.js's `tsconfig.json` because Next.js uses `"module": "esnext"` and `"moduleResolution": "bundler"` — settings that `ts-node` doesn't understand.

`tsx` is a modern alternative that handles these settings correctly, requires zero extra config, and just works.

```bash
# ts-node would crash with this tsconfig
# tsx works out of the box
tsx prisma/seed.ts
```

### Path aliases don't work in Node.js scripts

`@/*` (e.g. `import { prisma } from "@/lib/prisma"`) is a Next.js bundler feature — it's resolved by Next.js at build time, not by Node.js at runtime. Plain Node scripts (like seed files) don't know what `@/` means.

Fix: use relative imports instead, and instantiate Prisma directly in the script rather than importing the singleton.

### sessionVersion — JWT revocation without DB sessions

Pure JWTs can't be revoked. If you change a user's role, their old token still says the old role until it expires.

The `sessionVersion` pattern adds one integer field to `User`. Every JWT stores the version at login time. On each request, the version in the token is compared to the DB — mismatch means force re-login.

```
User in DB:  { sessionVersion: 3 }
User's JWT:  { userId: "...", sessionVersion: 3 }  ✓ match → allow

Admin changes role → DB increments to sessionVersion: 4
User's JWT still has 3                             ✗ mismatch → force re-login
```

This gives you session invalidation while keeping the JWT strategy that Credentials requires. The only cost: one lightweight DB query per request to check the version. Not yet implemented — planned for after route protection.

### Claude custom commands

Commands in `.claude/commands/*.md` are custom slash commands for this project. Writing a markdown file there makes it available as `/command-name` in Claude Code. Useful for repeatable workflows like updating notes, evaluating progress, or logging decisions.

### Next.js 16 — middleware renamed to proxy

In Next.js 16, `middleware.ts` is deprecated. The file is now called `proxy.ts` and the exported function is renamed from `middleware` to `proxy`. Everything else — `NextRequest`, `NextResponse`, the `matcher` config — works the same way.

```typescript
// src/proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL('/home', request.url));
}

export const config = {
  matcher: ['/about/:path*'],
};
```

### Edge runtime vs Node.js runtime

Next.js proxy runs on the **Edge runtime** by default. Edge is a lightweight environment that starts faster and can run at CDN nodes worldwide — but it only supports a subset of Node.js APIs (no file system, no native modules).

**Prisma can't run on Edge** because it uses Node.js-only internals. If the proxy imports anything that imports Prisma (like our `auth.ts`), it crashes.

Fix: force Node.js runtime by adding one line at the top of the proxy file:

```typescript
export const runtime = 'nodejs';
```

This tells Next.js to run the proxy in the full Node.js environment instead of Edge. Fine for self-hosted apps — only matters for Vercel Edge deployments.

### matcher — controlling which routes run the proxy

By default the proxy runs on every request, including Next.js static files and internal routes. The `matcher` config narrows it down:

```typescript
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
```

The pattern uses a negative lookahead (`(?!...)`) — plain English: "run on everything _except_ these paths."

**Why exclude `api/auth`?** That's the Auth.js route that handles login. If the proxy intercepted it before Auth.js could respond, logging in would trigger a redirect to `/login` → which triggers another login attempt → infinite loop.

**Errors this session:** [searchParams is a Promise in Next.js 16](#err-searchparams-async), [Prisma seed config ignored from package.json](#err-prisma-seed-config), [Seed script ECONNREFUSED](#err-seed-econnrefused)

---

## Session 5 — Auth.js internals, proxy deep-dive, API routes

### Auth.js callback data flow

`authorize()`, `jwt()`, and `session()` are three separate steps that each handle a different moment in the auth lifecycle.

```
LOGIN:
  authorize() → returns user object { id, email, role }
      ↓  passed as "user" argument to jwt()
  jwt() → copies id and role onto the token → token signed into cookie

EVERY SUBSEQUENT REQUEST:
  cookie sent by browser automatically
  Auth.js decrypts it → becomes "token" in jwt()
  jwt() runs but user is undefined → token returned unchanged
      ↓
  session() shapes token into what app code sees via auth()
```

`authorize()` output is a **one-time handoff** to `jwt()` at login. After that, the token lives in the cookie and `jwt()` just decrypts and returns it as-is.

### jwt() reads from the cookie on every request

On subsequent requests, `token` in `jwt()` is not created fresh — it's the cookie contents, decrypted. The `if (user)` guard is what distinguishes "first call at login" from "every other call":

```typescript
jwt({ token, user }) {
  if (user) {        // only true at login — authorize() just ran
    token.id = user.id
    token.role = user.role
  }
  return token       // all other requests: just return what was in the cookie
}
```

Mental model: the cookie is a locked box. Auth.js opens it on every request, hands you the contents, you look at it and hand it back, Auth.js locks it again and continues.

### Auth.js callbacks are predefined slots

You can't invent callback names — Auth.js defines the available ones and calls them at the right moments. You just fill in the bodies:

| Callback     | When it runs                                    |
| ------------ | ----------------------------------------------- |
| `jwt`        | Token created (login) or read (every request)   |
| `session`    | When app code calls `auth()` or `useSession()`  |
| `authorized` | In proxy/middleware to allow or block a request |
| `signIn`     | After login — lets you reject specific users    |
| `signOut`    | On logout                                       |
| `redirect`   | Controls where the user goes after sign in/out  |

Think of them like event listeners — Auth.js says "I will call `jwt` whenever I deal with a token, here's the slot."

### proxy — request contains metadata, not page content

The `request` argument in `proxy(request)` describes the **incoming HTTP request**, not the destination page. It's everything the browser sent:

```typescript
request.nextUrl.pathname; // which path they're trying to reach
request.method; // GET, POST, etc.
request.headers; // browser info, cookies, etc.
```

The proxy runs **before** the page renders. If it returns `NextResponse.redirect()`, the page never runs. Only `NextResponse.next()` lets the request through to the page or API handler.

Analogy: a bouncer at a door. They don't know what's inside the room — they only see the person asking to enter and decide: let through, or turn away.

### One proxy.ts per project

There is exactly one `proxy.ts` and one `proxy()` function. It's a single global gatekeeper. All access control logic lives inside it as conditions:

```typescript
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!session && !isPublic) return NextResponse.redirect(...)
  if (pathname.startsWith("/admin") && role !== "ADMIN") return NextResponse.redirect(...)

  return NextResponse.next()
}
```

One file, one function, all routing decisions in one place — easy to reason about who can go where.

### Next.js API routes

API routes are files inside `src/app/api/` that export named functions matching HTTP methods. The file path becomes the URL:

```
src/app/api/professors/route.ts  →  /api/professors
```

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

The proxy runs first, then the API handler runs if allowed. The difference from page routes: API routes return JSON, page routes return HTML.

Full request lifecycle:

```
Browser/client makes a request
  → proxy runs (access control)
  → if NextResponse.next():
      → /api/* path    → API route handler → returns JSON
      → any other path → page component   → returns HTML
```

This is also why `api/auth` is excluded from the proxy matcher — `src/app/api/auth/[...nextauth]/route.ts` is Auth.js's own API route. If the proxy intercepted it, login would redirect to `/login` before Auth.js could respond — an infinite loop.

---

## Session 6 — API routes, Server Actions, Prisma error handling, schema additions

### API route file structure and dynamic segments

Every API route is a `route.ts` file inside `src/app/api/`. The folder path becomes the URL, and dynamic segments use square brackets — same as page routes:

```
src/app/api/faculties/route.ts        →  /api/faculties
src/app/api/faculties/[id]/route.ts   →  /api/faculties/abc123
```

Inside a dynamic route file, `params` is a **Promise** in Next.js 16 (same rule as `searchParams`). You must `await` it before reading:

```typescript
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // ...
}
```

### Role-based guards on API routes

The proxy ensures a session exists, but it doesn't enforce roles. Role checks belong inside each handler. The pattern we use:

- `GET` — any authenticated user (proxy already guarantees a session)
- `POST / PUT` — EDITOR or ADMIN only
- `DELETE` — ADMIN only

```typescript
const session = await auth();
if (!session)
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
if (session.user.role === 'VIEWER')
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
```

The 401 check is technically redundant if the proxy is running correctly, but it's a good safety net for direct API calls.

### Prisma error codes

When Prisma throws a known database error, it wraps it in a `PrismaClientKnownRequestError` with a `code` property. The ones we handle:

| Code    | Meaning                          | Example                                            |
| ------- | -------------------------------- | -------------------------------------------------- |
| `P2002` | Unique constraint violation      | Creating a faculty with a name that already exists |
| `P2003` | Foreign key constraint violation | Deleting a faculty that still has departments      |
| `P2025` | Record not found                 | Updating or deleting a row that doesn't exist      |

Pattern for catching them safely:

```typescript
import { Prisma } from '@/generated/prisma/client';

try {
  await prisma.faculty.delete({ where: { id } });
} catch (error) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  ) {
    return NextResponse.json(
      { error: 'Cannot delete — has children' },
      { status: 409 }
    );
  }
  throw error; // re-throw anything unexpected
}
```

`instanceof` check first, then `error.code` — this ensures you only handle Prisma errors, not something else that happened to be caught.

### Server Actions in a separate file

Server Actions can live directly inside a page (`"use server"` inside the function), but when there are many of them it's cleaner to move them to a dedicated file. A file with `"use server"` at the top marks every exported function as a Server Action:

```typescript
// src/app/admin/actions.ts
"use server"

export async function createFaculty(formData: FormData) { ... }
export async function deleteFaculty(formData: FormData) { ... }
```

Then import and use them in the page:

```typescript
import { createFaculty, deleteFaculty } from "./actions"

<form action={createFaculty}>...</form>
```

This keeps the page file focused on layout and the actions file focused on mutations.

### Extracting a shared auth guard

When multiple Server Actions all need the same check, extract it into a helper rather than repeating it:

```typescript
async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') redirect('/');
}

export async function createFaculty(formData: FormData) {
  await requireAdmin();
  // ...
}
```

`redirect()` inside `requireAdmin()` throws a special Next.js error that propagates up automatically — the caller doesn't need to do anything extra.

### Server Component → Prisma directly vs API routes

A Server Component that needs data doesn't have to call its own API. It runs on the server anyway, so it can query Prisma directly with no HTTP round-trip:

```typescript
// ✓ Server Component — call Prisma directly
export default async function HomePage() {
  const professors = await prisma.professor.findMany({ ... })
  // ...
}

// API routes are for client-side code (fetch from the browser)
// or external callers that can't import Prisma
```

The API routes we built are for when interactive UI needs to mutate data from the client (forms that use `fetch`, not Server Actions).

### Promise.all for parallel DB queries

When a page needs data from multiple tables, fetch them in parallel instead of sequentially:

```typescript
// Sequential — each query waits for the previous one
const faculties = await prisma.faculty.findMany();
const departments = await prisma.department.findMany();
const professors = await prisma.professor.findMany();

// Parallel — all three queries run at the same time
const [faculties, departments, professors] = await Promise.all([
  prisma.faculty.findMany(),
  prisma.department.findMany(),
  prisma.professor.findMany(),
]);
```

`Promise.all` takes an array of promises and resolves when all of them finish. The result is an array in the same order. Faster because Postgres handles all three queries concurrently.

### Optional fields in Prisma schema

Adding `?` to a field type makes it optional — nullable in the database, `null` in TypeScript:

```prisma
model Professor {
  patronymic String?   // stored as NULL if not provided
}
```

When displaying optional fields in JSX, `null` renders as nothing — no extra handling needed:

```tsx
{
  professor.lastName;
}
{
  professor.firstName;
}
{
  professor.patronymic;
}
// If patronymic is null, it just renders as an empty string
```

---

## Session 7 — Build configuration, dynamic rendering, Prisma client generation

### Next.js rendering modes: static vs dynamic

Next.js tries to pre-render pages at **build time** by default. This works great for pages with static content (like an "About" page), but breaks for pages that query a database.

Two rendering modes:

- **Static (default)** — page generated once during `npm run build`, served as cached HTML
- **Dynamic (on-demand)** — page rendered fresh on every request

For pages that query Prisma directly, you must force dynamic rendering:

```typescript
// src/app/page.tsx
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const professors = await prisma.professor.findMany();
  // ...
}
```

**Why it matters:** If this page was statically rendered, the homepage would show the professor list from build time — not the current list. After adding a new professor, the page wouldn't update until you rebuild the entire app.

**Rule of thumb:** If a page file imports Prisma and queries it at the top level → add `export const dynamic = "force-dynamic"`.

### When to use dynamic rendering

✅ **Use `dynamic = "force-dynamic"` on:**

- Pages that query Prisma directly
- Pages showing data that changes (CRUD operations)
- Pages that need fresh data on every request

❌ **Don't need it on:**

- API routes (already dynamic by nature)
- Server Actions (already dynamic)
- Pages with static content only

### Prisma client regeneration after schema changes

When you modify `prisma/schema.prisma` (add/remove/change fields), the TypeScript types are out of sync until you regenerate the Prisma client.

**The workflow:**

```bash
# 1. Edit prisma/schema.prisma
# 2. Create and apply migration
npx prisma migrate dev --name describe_change
# This automatically runs prisma generate at the end

# If you only need to regenerate types (rare):
npx prisma generate
```

**What breaks if you forget:** TypeScript will error on fields that exist in the schema but not in the generated client types. Example: adding `patronymic` field but not regenerating → `Property 'patronymic' does not exist on type Professor`.

### npm scripts for common tasks

Adding shortcut scripts to `package.json` makes common operations easier:

```json
"scripts": {
  "db:migrate": "npx prisma migrate dev",
  "db:generate": "npx prisma generate",
  "db:studio": "npx prisma studio",
  "db:reset": "npx prisma migrate reset --force"
}
```

- `npm run db:migrate` — create and apply migration (prompts for name), auto-generates client
- `npm run db:generate` — regenerate client only (if types are out of sync)
- `npm run db:studio` — open visual DB browser in your browser
- `npm run db:reset` — nuclear option: drops DB, reapplies all migrations, runs seed

### Next.js 16 proxy runtime auto-detection

In Next.js 16, proxy files (`proxy.ts`) automatically run on the Node.js runtime — you can't (and don't need to) configure it manually.

**Previous approach (Next.js 15 and earlier):**

```typescript
// src/middleware.ts
export const runtime = 'nodejs'; // needed to use Prisma
```

**Next.js 16:**

```typescript
// src/proxy.ts
// No runtime export needed — always runs on Node.js by default
```

If you try to export `runtime` from `proxy.ts`, Next.js 16 throws a build error: `Route segment config is not allowed in Proxy file`.

### Docker in production deployments

**Local development:** Docker Compose runs Postgres. Next.js app runs directly on your machine (`npm run dev`).

**Production (e.g. Coolify):** Two separate Docker containers:

1. **Postgres container** — from your `docker-compose.yml` or Coolify's managed Postgres
2. **Next.js app container** — built from a `Dockerfile` you create

Both containers communicate via Docker network, same as locally. You create a `Dockerfile` that:

- Installs dependencies
- Runs `npx prisma generate`
- Builds the Next.js app (`npm run build`)
- Serves it with `node server.js`

The `dynamic = "force-dynamic"` setting works the same in production — pages query the DB on each request, not at build time.

### Dockerfile vs Docker image

- **Pre-built image** (e.g. `postgres:16-alpine`) — someone else made it, you just use it
- **Custom image** — your app packaged as a Docker image, built from a `Dockerfile`

A `Dockerfile` is a recipe for building your own custom image:

```dockerfile
FROM node:20-alpine       # Start with Node.js base
COPY . .                  # Add YOUR code
RUN npm run build         # Build YOUR app
CMD ["node", "server.js"] # Run YOUR app
```

Running `docker build` with this file creates a custom image containing your entire app, ready to deploy anywhere.

**Errors this session:** [Next.js 16 proxy runtime export not allowed](#err-proxy-runtime-export), [Build fails querying DB at build time](#err-build-db-query), [Prisma types out of sync after schema change](#err-prisma-types-stale)

---

## Session 8 — Reusable UI components, global header, naming conventions

### React forwardRef

`forwardRef` is a React pattern that allows a component to expose a ref to its parent. Without it, refs on custom components don't work.

```typescript
// Without forwardRef — ref doesn't reach the actual <button>
const Button = ({ children }) => <button>{children}</button>
<Button ref={buttonRef} />  // ref={buttonRef} is ignored

// With forwardRef — ref is passed through
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, ...props }, ref) => <button ref={ref} {...props}>{children}</button>
)
<Button ref={buttonRef} />  // ref={buttonRef} now works
```

**When to use it:** Any reusable input/button/interactive component. Libraries like React Hook Form and focus management tools need refs to work correctly.

### Component variants with TypeScript unions

Instead of separate components for each button style, use a single component with variant props:

```typescript
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost"

interface ButtonProps {
  variant?: ButtonVariant
}

// Inside component:
className={cn({
  "bg-zinc-900 text-white": variant === "primary",
  "bg-red-600 text-white": variant === "danger",
  // ...
})}
```

TypeScript enforces only valid variants. One component, multiple appearances — keeps code DRY and consistent.

### Server Components can call auth() directly

Any async Server Component can call `auth()` from `src/auth.ts` to check the session:

```typescript
import { auth } from "@/auth"

export async function Header() {
  const session = await auth()

  return (
    <header>
      {session && <p>Welcome, {session.user.email}</p>}
    </header>
  )
}
```

No special setup needed — Server Components run on the server, so they have full access to `auth()`, Prisma, env vars, everything.

### Inline Server Actions in Server Components

Server Actions don't have to live in a separate `actions.ts` file. You can define them inline inside a Server Component:

```typescript
export async function Header() {
  return (
    <form
      action={async () => {
        "use server"
        await signOut({ redirectTo: "/login" })
      }}
    >
      <button type="submit">Logout</button>
    </form>
  )
}
```

The `"use server"` directive inside the function marks it as a Server Action. Fine for one-off actions like logout. For complex logic or reusable actions, extract to `actions.ts`.

### Component naming conventions (project standard)

We settled on these rules for file and folder structure:

**File names:** `kebab-case`

```
src/components/ui/button.tsx        ✓
src/components/ui/Button.tsx        ✗
```

**Simple components:** single file

```
src/components/ui/button.tsx
src/components/ui/input.tsx
```

**Complex components:** subfolder with `index.ts` barrel export

```
src/components/data-table/
  index.ts              ← exports { DataTable }
  data-table.tsx        ← main component
  data-table-row.tsx    ← internal subcomponent
  data-table-cell.tsx   ← internal subcomponent
```

The `index.ts` lets you import with a clean path:

```typescript
import { DataTable } from '@/components/data-table';
// instead of:
import { DataTable } from '@/components/data-table/data-table';
```

**Why kebab-case:** Matches Next.js page routing conventions (`/admin/page.tsx`), avoids case-sensitivity issues across operating systems, and is more readable than PascalCase for multi-word file names.

### Shared layout with root layout.tsx

`src/app/layout.tsx` wraps every page in the app. Adding a component there makes it appear on all pages:

```typescript
// src/app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <body className="flex min-h-full flex-col">
        <Header />    {/* appears on every page */}
        {children}    {/* the actual page content */}
      </body>
    </html>
  )
}
```

Combined with `flex flex-col`, the header stays at the top and the page content grows to fill remaining space.

### max-w-\* utilities and content width

Tailwind's `max-w-*` utilities control how wide content can get before it stops growing:

| Class       | Max width      | Use for                          |
| ----------- | -------------- | -------------------------------- |
| `max-w-3xl` | 48rem (768px)  | Narrow reading content, forms    |
| `max-w-4xl` | 56rem (896px)  | Medium content                   |
| `max-w-7xl` | 80rem (1280px) | Wide layouts, dashboards, tables |

Combined with `mx-auto` (horizontal auto margins), content centers itself and respects the max-width limit even on ultrawide screens.

---

## Session 9 — Toast notifications, useActionState, React Context, Portals

### Toast notifications

A **toast** is a temporary popup message that appears to notify users of actions (success, error, warning, info). The name comes from toast popping up from a toaster — quick, temporary, attention-grabbing.

**Why they matter:** They provide instant feedback without interrupting the user's workflow. Better UX than showing errors in the URL or reloading the page.

### React Context — global state without prop drilling

**The problem:** Passing a function (like `showToast`) down through every component level is called "prop drilling":

```tsx
<App showToast={showToast}>
  <Layout showToast={showToast}>
    <Page showToast={showToast}>
      <Button onClick={() => showToast("Saved!")} />
```

Painful and unmaintainable.

**The solution:** React Context creates a "global" state container that any component can access without passing props through every level.

**How it works:**

1. **Create Context** — `const ToastContext = createContext()`
2. **Provide it** — wrap your app with `<ToastContext.Provider value={...}>`
3. **Consume it** — any child calls `useContext(ToastContext)` to access the state

```tsx
// Provider (in layout.tsx)
<ToastContext.Provider value={{ showToast }}>
  <App />
</ToastContext.Provider>;

// Consumer (anywhere deep in the tree)
function MyButton() {
  const { showToast } = useContext(ToastContext);
  return <button onClick={() => showToast('Success!')}>Save</button>;
}
```

No prop drilling — the button directly accesses the global toast state.

### Custom hooks pattern

Instead of forcing every component to call `useContext(ToastContext)`, wrap it in a custom hook:

```typescript
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
```

Now components just call `const toast = useToast()`. Cleaner and safer — throws a helpful error if Context is missing.

### React portals — rendering outside the component tree

**The problem:** UI elements like toasts need to appear on top of everything (modals, dropdowns, headers). If rendered inside their trigger component, they inherit CSS properties that break positioning:

```tsx
<div style="overflow: hidden">
  <Toast /> {/* gets cut off by parent's overflow! */}
</div>
```

**The solution:** `ReactDOM.createPortal()` renders a component into a different part of the DOM tree, outside its parent:

```tsx
createPortal(
  <Toast />,
  document.getElementById('toast-root') // renders at top level
);
```

The toast DOM node physically lives outside the app tree (in `<div id="toast-root">`), so it's unaffected by parent styles. But React still treats it as a child for event handling and Context access.

**When to use portals:** Toasts, modals, tooltips, dropdowns — anything that needs to escape its container's CSS constraints.

### useActionState — the modern way to handle Server Action responses

**The old way (searchParams):**

```typescript
// Server Action
export async function create(formData: FormData) {
  await prisma.create({ ... });
  redirect("/admin?success=Created");  // ❌ message in URL
}
```

**Problems:**

- Messages visible in URL bar
- Browser history polluted with error states
- Full page reload required
- Not shareable (bookmarking `/admin?success=...` shows stale message)

**The new way (useActionState):**

```typescript
// Server Action returns data
export async function create(prevState: any, formData: FormData) {
  "use server"
  try {
    await prisma.create({ ... });
    return { success: "Created" };
  } catch (error) {
    return { error: "Failed" };
  }
}

// Client Component uses the action
"use client"
const [state, action, isPending] = useActionState(create, null);

useEffect(() => {
  if (state?.success) toast.success(state.success);
  if (state?.error) toast.error(state.error);
}, [state]);

<form action={action}>...</form>
```

**Benefits:**

- No URL pollution
- No page reload
- Loading states (`isPending`)
- Clean separation: Server Action returns data, Client Component handles UI

### revalidatePath — refreshing cached data after mutations

When a Server Action changes database data, Next.js doesn't automatically know to refetch it. `revalidatePath()` tells Next.js to invalidate the cache for a specific path:

```typescript
export async function createFaculty(prevState, formData) {
  "use server"
  await prisma.faculty.create({ ... });
  revalidatePath("/admin");  // ← tell Next.js to refetch /admin data
  return { success: "Created" };
}
```

Without this, the page would show stale data (old list) even after creating a new faculty. `revalidatePath` forces Next.js to re-render the page with fresh database results on the next visit.

### Managing multiple toasts with array state

Instead of a single toast object, store an **array** of toasts:

```typescript
const [toasts, setToasts] = useState<Toast[]>([]);

// Add a toast
function addToast(message, type) {
  const newToast = {
    id: crypto.randomUUID(), // unique ID for React key
    message,
    type,
  };
  setToasts((prev) => [...prev, newToast]); // append to array
}

// Remove a toast
function removeToast(id) {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}
```

Each toast auto-dismisses after 5 seconds using `setTimeout` in a `useEffect`. Multiple toasts stack vertically — each one independently manages its own lifetime.

### crypto.randomUUID() for unique IDs

Each toast needs a unique `id` for:

1. **React `key` prop** — so React can track which toast is which when re-rendering
2. **Removing specific toasts** — when you click close or it auto-dismisses, filter by ID

`crypto.randomUUID()` generates globally unique IDs like `"9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"`. Built into modern browsers and Node.js — no external library needed.

### Hydration and the mounted state pattern

**Hydration** is when React "attaches" to server-rendered HTML on the client. React expects the first client render to match exactly what the server rendered.

**The problem with portals:**

```typescript
// BAD
if (typeof window === 'undefined') return null;
```

- **Server:** `typeof window === "undefined"` → returns `null`
- **Client (first render):** `typeof window === "undefined"` is `false` → returns `<div>`
- **React:** "Server said `null`, client says `<div>` — MISMATCH!" ❌

**The fix — mounted state:**

```typescript
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true); // only runs after hydration
}, []);

if (!mounted) return null;
```

- **Server:** `mounted` is `false` → returns `null`
- **Client (first render):** `mounted` is still `false` → returns `null` ✓ MATCH!
- **Client (after hydration):** `useEffect` runs, sets `mounted = true` → portal renders

Both server and first client render return `null`, so React is happy. The portal only appears after hydration completes.

**Why useEffect?** It only runs on the client, never on the server. Perfect for setting client-only state or accessing browser APIs.

### Architectural separation: providers vs components

**Providers** (state infrastructure) live in `src/providers/`:

```
src/providers/
  toast-provider.tsx  ← Context, provider, useToast hook
```

**Components** (visual UI) live in `src/components/`:

```
src/components/ui/
  toast.tsx  ← Toast visual component
```

**Why separate?** Providers are **app-level infrastructure** — they wrap the entire app in `layout.tsx`. Components are **UI building blocks** — imported into pages and other components. Clear separation makes it obvious which files are infrastructure concerns vs reusable UI.

### useCallback dependency gotcha — infinite loops

**The bug:**

```typescript
useEffect(() => {
  if (state?.success) toast.success(state.success);
}, [state, toast]); // ❌ toast changes reference every render → infinite loop
```

The `toast` object (from `useToast()`) changes reference on every render, even though the functions inside are stable. This triggers the effect → shows toast → context updates → `toast` reference changes → effect runs again → infinite loop.

**The fix:**

```typescript
useEffect(() => {
  if (state?.success) toast.success(state.success);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [state]); // ✓ Only trigger when state changes
```

Remove `toast` from dependencies. ESLint complains, but we disable the warning because `toast` functions are stable (wrapped in `useCallback` with proper dependencies in the provider).

### Page-specific components subfolder pattern

For components tightly coupled to a specific page (not reusable), organize them in a `components/` subfolder:

```
src/app/admin/
  page.tsx          ← Server Component, queries DB
  actions.ts        ← Server Actions
  components/
    faculty-section.tsx     ← Client Component, uses useActionState
    department-section.tsx  ← Client Component
    professor-section.tsx   ← Client Component
```

**Why this works:**

- **Flat is too messy** — 6 files at the top level is hard to scan
- **Logical grouping** — each section is self-contained (own state, own toasts)
- **Not over-engineering** — these aren't reusable, just organized

**When to use it:** When a page has 4+ related files, and the components are page-specific (not shared across the app).

**Errors this session:** [Hydration mismatch with portal](#err-toast-hydration-mismatch), [Infinite toast loop with useEffect dependencies](#err-toast-infinite-loop), [Module not found after moving files](#err-moved-component-imports)

---

## Session 14 — Role system redesign, enum migration, Auth.js debugging

### Three-tier role model

The platform now has three roles with distinct access levels:

| Role | Access | Can edit |
|---|---|---|
| `ADMIN` | Everything | All fields on any professor |
| `EDITOR` | Full professor list | Only their division's fields |
| `USER` | Their own profile only | Email + research profile URLs |

`EDITOR` is tied to a `Division` via `User.divisionId`. `USER` is linked to their own professor record via `User.professorId`.

### User ↔ Professor link

`User` (login account) and `Professor` (data record) are separate models. To connect them:

```prisma
model User {
  professorId String?    @unique
  professor   Professor? @relation(fields: [professorId], references: [id])
}
```

`@unique` ensures one professor has at most one login account. Optional because admins and editors may not be professors themselves.

The back-relation on `Professor`:

```prisma
model Professor {
  user User?  // virtual — no column in DB, just TypeScript convenience
}
```

### professorId in the JWT

`professorId` is included in the JWT so the proxy can route USER accounts directly to their profile page without hitting the DB on every request:

```typescript
// authorize() → jwt() → session()
return { id, email, role, professorId: user.professorId };
```

The proxy reads `session.user.professorId` and redirects any USER trying to access any other path back to `/professors/${professorId}`.

### What a USER can self-edit

Professors can only edit their own research profile fields:
- `email`
- `wosURL`, `scopusURL`, `googleScholarURL`, `orcidId`

Everything else (rank, position, degree, department, employment rate) is managed by ADMIN or the relevant EDITOR.

### <a name="err-prisma-enum-stale"></a> Migration renamed enum but Prisma client not regenerated

**What happened:** USER could not log in — Auth.js threw `CallbackRouteError`. The actual cause buried in the stack trace: `PrismaClientKnownRequestError: Value 'USER' not found in enum 'Role'`.

**Why:** Running `npx prisma migrate dev` updates the database (the SQL enum was renamed from `VIEWER` to `USER`), but it does NOT always regenerate the Prisma TypeScript client automatically — especially if the migration ran in a constrained environment. The generated client in `src/generated/prisma/` still had the old `VIEWER` value. When Prisma tried to deserialize the `role` column from the DB row, it didn't recognise `USER` and threw.

**Fix:** Always run `npx prisma generate` after a migration that changes enum values:

```bash
npx prisma migrate dev --name describe_the_change
npx prisma generate   # regenerate TypeScript client
```

**Rule:** If login or any DB query fails after a migration, `prisma generate` is always the first thing to check.

### How to debug Auth.js errors

Auth.js wraps internal errors in `CallbackRouteError`, which hides the real cause. The browser network tab only shows the RSC payload (unhelpful). The **Next.js dev server terminal** prints the full error with stack trace — that's where to look:

```
[auth][cause]: PrismaClientKnownRequestError: Value 'USER' not found in enum 'Role'
```

The pattern: `[auth][cause]` is the actual error. Everything above it is Auth.js wrapping.

---

## Session 15 — Zod, Conform, professor page, npm audit

### Zod — schema-first validation

Zod is a TypeScript-first validation library. You define the shape and rules of your data once as a schema, and Zod both validates it at runtime and infers the TypeScript type automatically — no duplication.

```typescript
const schema = z.object({
  email: z.string().email('Невірний формат'),
  employmentRate: z.coerce.number().min(0.1).max(2),
});

type FormData = z.infer<typeof schema>; // TypeScript type for free
```

**Why it matters:** Without Zod, you'd write a TypeScript type AND separate validation logic, and they'd inevitably drift out of sync. Zod keeps them as one source of truth.

**`z.coerce`** is important for forms: HTML forms submit everything as strings, even number inputs. `z.coerce.number()` converts `"15"` → `15` before validating. Without it, a number schema would reject all form data.

### Validation alternatives — Yup and Valibot

**Yup** is Zod's older predecessor. Still works, but TypeScript inference is weaker — you have to write a separate TS type alongside the schema. Being replaced by Zod in most new projects. No strong reason to choose it today.

**Valibot** is a newer alternative (2023) that solves Zod's one real weakness: bundle size. It's modular — only the validators you import get bundled. ~10x smaller than Zod in practice.

```typescript
// Only these are bundled — unused validators are tree-shaken
import { object, string, email } from 'valibot';
```

For a self-hosted app with no bundle size constraints, Zod is the better choice (bigger community, more tutorials). If building a large public app where JS size matters, Valibot is worth considering.

### Conform — form library built for Server Actions

Conform (`@conform-to/react` + `@conform-to/zod`) is the form library that works natively with Server Actions and `useActionState`. Unlike react-hook-form (which intercepts form submission in JavaScript), Conform uses the native HTML form submission model — which means forms still work even with JavaScript disabled (progressive enhancement).

**The core idea:** `useActionState` returns `lastResult` from the server. Conform reads `lastResult` and automatically places field-level errors next to the right inputs — no manual wiring.

```tsx
const [lastResult, action, isPending] = useActionState(serverAction, null);

const [form, fields] = useForm({
  lastResult,           // server errors flow in here automatically
  onValidate({ formData }) {
    return parseWithZod(formData, { schema }); // same schema, client-side
  },
  shouldValidate: 'onBlur',      // validate when user leaves a field
  shouldRevalidate: 'onInput',   // re-validate on every keystroke after first error
});
```

### The Conform + Server Action data flow

```
User leaves a field (blur)
  → onValidate() runs Zod client-side
  → Error appears instantly next to the input

User submits the form
  → form.onSubmit sends FormData to the Server Action
  → Server Action: parseWithZod(formData, { schema })
  → If invalid → submission.reply() sends structured errors back
  → Conform reads lastResult, places each error next to the right field
  → If valid → save to DB → submission.reply({ resetForm: false })
```

The schema runs twice: client-side for instant feedback, server-side for security. If someone bypasses client validation, the server catches it.

### submission.reply() — how the server talks back to Conform

`parseWithZod` returns a `submission` object. You return `submission.reply()` from the Server Action in every case — success or failure. Conform on the client reads whatever you return as `lastResult`.

```typescript
// Validation failed — field errors sent back automatically
if (submission.status !== 'success') {
  return submission.reply();
}

// DB error — attach a form-level error
return submission.reply({ formErrors: ['Помилка при збереженні'] });

// Success
return submission.reply({ resetForm: false }); // keep field values after save
```

### getInputProps / getSelectProps — Conform's prop helpers

Conform generates all the accessibility-required props for inputs: `name`, `id`, `aria-describedby`, `aria-invalid`, etc. Instead of writing them by hand, you spread the result of `getInputProps`:

```tsx
<Input
  {...getInputProps(fields.email, { type: 'email' })}
  key={fields.email.key}
/>
```

The `key` prop forces React to remount the input when the field resets — otherwise the browser keeps the old value in uncontrolled inputs.

`getSelectProps` works the same way for `<select>` elements.

### One schema, two places

The Zod schema lives in its own file (`schema.ts`) and is imported by both the Server Action and the Client Component:

```
schema.ts  ←  actions.ts (server-side validation)
           ←  professor-form.tsx (client-side validation via onValidate)
```

This is the key advantage over the old approach (Zod only on server, no client validation). One file, one set of rules, used everywhere.

### Field-level access control architecture

The professor page splits responsibility into four files:

```
professors/[id]/
  schema.ts          — Zod validation schema (shared)
  actions.ts         — Server Action: auth check → canEdit → validate → save
  page.tsx           — Server Component: fetch data + compute editableFields
  components/
    professor-form.tsx  — Client Component: Conform form, renders inputs or text per field
```

`getEditableFields()` returns `'all'` for ADMIN, a string array for EDITOR/USER, or empty `[]` for no access. The form renders each field as an `<Input>` or plain `<DisplayValue>` based on this. The Server Action re-checks permissions server-side — the client is never trusted for access control.

### npm audit — checking for security vulnerabilities

`npm audit` scans your installed packages against a database of known vulnerabilities and reports them with severity levels (low / moderate / high / critical).

```bash
npm audit           # show all vulnerabilities
npm audit fix       # fix ones that don't require breaking changes
npm audit fix --force  # fix all, including breaking changes (use with care)
```

Not all vulnerabilities require action. Internal dev-tool dependencies (like `@prisma/dev`) with vulnerabilities don't affect your running app — they only run during development. Focus on runtime dependencies with high/critical severity.

This session: Next.js 16.2.2 had a DoS vulnerability in Server Components. Fixed by upgrading to 16.2.4:

```bash
npm install next@16.2.4
```

---

## Session 16 — Replacing Conform with react-hook-form

### Why we dropped Conform

Conform was chosen in Session 15 because it was designed for Server Actions — it uses native `FormData` so forms work without JavaScript. The catch: it depends on Zod's internal API, and when Zod v4 was released it renamed a type (`ZodBranded`) that Conform depended on. The result: a runtime crash importing `@conform-to/zod`.

Zod v4 shipped in August 2024. As of this session, Conform still hadn't published a compatible release. Nine months with no fix = the library is not being maintained. Staying with Conform would mean either downgrading Zod or being stuck forever. The right call: drop Conform, switch to a library that explicitly supports Zod v4.

### react-hook-form — performance-first form library

`react-hook-form` is the most widely used React form library. Its main design decision: it manages form state **without re-rendering the component on every keystroke**. It does this by using uncontrolled inputs (`ref`-based) rather than controlled inputs (`value`/`onChange`). The form values are read from the DOM when you need them, not stored in React state.

The core API:

```tsx
const {
  register,        // connects an input to the form
  handleSubmit,    // wraps your submit handler with validation
  formState: {
    errors,        // validation errors per field
    isSubmitting,  // true while handleSubmit is awaiting
  },
} = useForm<FormValues>({
  resolver: zodResolver(schema), // plug in Zod validation
  defaultValues: { ... },
});
```

Spreading `register('fieldName')` onto an input gives it a `name`, `ref`, `onChange`, and `onBlur` — everything the form needs to track that field:

```tsx
<Input {...register('email')} type="email" />
```

For selects, the same `register` call works — no special helper needed (unlike Conform's `getSelectProps`).

### zodResolver — wiring Zod into react-hook-form

`@hookform/resolvers` is the official adapter package. It translates between react-hook-form's validation API and schema libraries like Zod, Yup, or Valibot.

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({ email: z.string().email() });

useForm({
  resolver: zodResolver(schema),
});
```

When the user submits, react-hook-form calls the resolver with the raw form values (strings from HTML inputs). The resolver passes them through `schema.parseAsync()`. If valid, the coerced/transformed output is passed to your `handleSubmit` callback. If invalid, the errors go into `formState.errors`.

`@hookform/resolvers@5.x` explicitly supports Zod v4. That's what we're on.

### react-hook-form + Server Actions pattern

Conform was designed for Server Actions — it uses `FormData` natively. react-hook-form is not. It gives you a validated JavaScript object, not FormData.

The bridge: change the Server Action to accept a **plain object** instead of `FormData`, then call it directly from `handleSubmit`:

```tsx
// Server Action — accepts plain object, not FormData
export async function updateProfessor(
  professorId: string,
  data: ProfessorFormValues
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = professorSchema.safeParse(data); // validate server-side too
  // ...
}

// Client Component — calls the server action directly
const onSubmit = handleSubmit(async (data) => {
  const result = await updateProfessor(p.id, data);
  if (result.success) toast.success('Збережено');
  else toast.error(result.error);
});

<form onSubmit={onSubmit}>
```

Key things that changed vs the Conform approach:

| Before (Conform) | After (react-hook-form) |
|---|---|
| `<form action={action}>` | `<form onSubmit={onSubmit}>` |
| Server Action receives `FormData` | Server Action receives typed object |
| `useActionState` for pending state | `formState.isSubmitting` |
| `lastResult` drives error placement | `formState.errors.field?.message` |
| `getInputProps(fields.email)` | `{...register('email')}` |

The double validation (client + server) stays — react-hook-form catches it on the client, and `safeParse` on the server is the security layer.

### z.coerce + zodResolver TypeScript mismatch

`z.coerce.number()` has a Zod input type of `unknown` (because it accepts anything and coerces it). The `zodResolver` infers the form's generic type from the schema's input type — so number fields typed as `unknown` conflict with react-hook-form's expectation that form values are specific types.

TypeScript error: `Type 'Resolver<..., unknown, ...>' is not assignable to type 'Resolver<..., number | null | undefined, ...>'`

The fix: cast the resolver explicitly using react-hook-form's `Resolver` type:

```tsx
import { useForm, type Resolver } from 'react-hook-form';

useForm<ProfessorFormValues>({
  // Cast needed: z.coerce.number() has input type `unknown`,
  // which conflicts with react-hook-form's generic — runtime is correct.
  resolver: zodResolver(professorSchema) as Resolver<ProfessorFormValues>,
});
```

At runtime everything works correctly — Zod coerces the strings to numbers, and the validated output passed to `handleSubmit` has proper numbers. The cast is just telling TypeScript to trust us on the type.

**Errors this session:** [zodResolver type mismatch with z.coerce](#err-zod-coerce-resolver)

---

## Errors

### <a name="err-searchparams-async"></a> searchParams is a Promise in Next.js 16

**What happened:** `Error: Route "/login" used searchParams.error. searchParams is a Promise and must be unwrapped with await`.
**Why:** Next.js 16 made `searchParams` (and `params`) async Promises to support React's streaming model. Accessing them synchronously throws at runtime.
**Fix:** Make the page component `async` and `await` the prop before accessing it:

```typescript
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // now use error instead of searchParams.error
}
```

### <a name="err-prisma-seed-config"></a> Prisma seed config ignored from package.json

**What happened:** `npx prisma db seed` printed "No seed command configured" even though `"prisma": { "seed": "..." }` was in `package.json`.
**Why:** Prisma 7 moved all config (including seed) out of `package.json` and into `prisma.config.ts`. The `package.json` key is a Prisma 6 convention — Prisma 7 doesn't read it.
**Fix:** Add the seed command to the `migrations` section of `prisma.config.ts`:

```typescript
migrations: {
  path: "prisma/migrations",
  seed: "tsx prisma/seed.ts",
}
```

### <a name="err-seed-econnrefused"></a> Seed script ECONNREFUSED

**What happened:** `PrismaClientKnownRequestError: ECONNREFUSED` when running the seed.
**Why:** The seed script connected successfully to Node but couldn't reach Postgres — Docker wasn't running, so there was nothing listening on port 5432.
**Fix:** Start Docker first, then run the seed:

```bash
docker compose up -d
npm run seed
```

### <a name="err-proxy-runtime-export"></a> Next.js 16 proxy runtime export not allowed

**What happened:** `Error: Route segment config is not allowed in Proxy file at "./src\proxy.ts". Proxy always runs on Node.js runtime.`
**Why:** Next.js 16 changed proxy behavior — proxy files now always run on Node.js runtime by default. Exporting `runtime = "nodejs"` is no longer needed and causes a build error.
**Fix:** Remove the runtime export from `proxy.ts`:

```typescript
// Remove this line:
export const runtime = 'nodejs';

// Proxy automatically runs on Node.js in Next.js 16
```

### <a name="err-build-db-query"></a> Build fails querying DB at build time

**What happened:** `npm run build` failed with `ECONNREFUSED` when trying to pre-render pages that query Prisma.
**Why:** Next.js tries to pre-render pages at build time by default. Pages that query the database need the DB running during build — but the build happens before Docker containers start, and even if DB is running, pre-rendered pages would show stale data.
**Fix:** Mark DB-querying pages as dynamic to skip build-time rendering:

```typescript
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const professors = await prisma.professor.findMany();
  // ...
}
```

This tells Next.js to render the page on every request instead of once at build time.

### <a name="err-prisma-types-stale"></a> Prisma types out of sync after schema change

**What happened:** TypeScript errors like `Property 'patronymic' does not exist on type Professor` after adding the field to `schema.prisma` and running the migration.
**Why:** Migrations update the database structure, but the TypeScript types in `src/generated/prisma/` are only regenerated when you run `prisma generate`. The migration ran but the client wasn't regenerated.
**Fix:** Run `npx prisma generate` to regenerate the Prisma client with updated types:

```bash
npx prisma generate
```

Note: `npx prisma migrate dev` automatically runs `prisma generate` at the end, so this only happens if you skip that step or something interrupts the process.

### <a name="err-toast-hydration-mismatch"></a> Hydration mismatch with portal

**What happened:** `Uncaught Error: Hydration failed because the server rendered HTML didn't match the client.`
**Why:** The ToastContainer component used `typeof window === "undefined"` to check for server vs client. Server rendered `null`, but the first client render immediately returned the portal `<div>`, causing a mismatch. React expects server and first client render to be identical.
**Fix:** Use the mounted state pattern with `useEffect`:

```typescript
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true); // only runs after hydration completes
}, []);

if (!mounted) return null; // both server and first client render return null
```

### <a name="err-toast-infinite-loop"></a> Infinite toast loop with useEffect dependencies

**What happened:** Toasts appeared infinitely, flooding the screen in an endless loop.
**Why:** The `useEffect` dependency array included `toast` from `useToast()`. The `toast` object changes reference on every render (even though the functions inside are stable via `useCallback`). This triggered the effect → showed toast → context updated → `toast` reference changed → effect ran again → infinite loop.
**Fix:** Remove `toast` from the dependency array and disable ESLint warning:

```typescript
useEffect(() => {
  if (state?.success) toast.success(state.success);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [state]); // only state, not toast
```

### <a name="err-moved-component-imports"></a> Module not found after moving files

**What happened:** `Module not found: Can't resolve './actions'` after moving section components into `admin/components/` subfolder.
**Why:** The import paths used relative imports (`./actions`), which worked when files were in the same folder. After moving components into a subfolder, `./actions` pointed to `admin/components/actions.ts` (which doesn't exist) instead of `admin/actions.ts`.
**Fix:** Update relative imports to go up one level:

```typescript
// Before (when in same folder)
import { createFaculty } from './actions';

// After (moved to components/ subfolder)
import { createFaculty } from '../actions';
```

### <a name="err-zod-coerce-resolver"></a> zodResolver type mismatch with z.coerce

**What happened:** TypeScript error — `Type 'Resolver<..., unknown, ...>' is not assignable to type 'Resolver<..., number | null | undefined, ...>'` on the `resolver` prop of `useForm`.
**Why:** `z.coerce.number()` has a Zod input type of `unknown` (it accepts anything and converts it). `zodResolver` infers the form's type from the schema's input type, so coerced number fields appear as `unknown` — incompatible with react-hook-form's expectation of concrete types. The runtime behaviour is correct; only the TypeScript inference breaks.
**Fix:** Cast the resolver to the concrete form values type using react-hook-form's `Resolver` generic:

```tsx
import { useForm, type Resolver } from 'react-hook-form';

useForm<ProfessorFormValues>({
  resolver: zodResolver(professorSchema) as Resolver<ProfessorFormValues>,
});
```

---

## Session 10 — ESLint config, useMemo, useRef, CSS animations, toast architecture

### ESLint: ignoring intentionally unused variables

TypeScript and ESLint enforce that every declared variable is used. But there are legitimate cases where you need a variable you won't use — the most common is a `catch` block where you need the parameter to exist but don't inspect it:

```typescript
try {
  await prisma.professor.delete({ where: { id } });
} catch (_error) {
  // ← need the parameter, don't need the value
  return { error: 'Помилка сервера' };
}
```

The convention is to prefix with `_`. ESLint v9 flat config lets you codify this as a rule so it stops warning:

```javascript
// eslint.config.mjs
{
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",          // function parameters: _param
        varsIgnorePattern: "^_",           // variables: _unused
        caughtErrorsIgnorePattern: "^_",   // catch blocks: catch (_error)
      },
    ],
  },
}
```

The three patterns cover different scopes. `caughtErrorsIgnorePattern` is the one that matters most for our Server Actions.

### useMemo — preventing unnecessary re-renders of Context consumers

When a component re-renders, any object literal defined inside it is a **new object in memory** — even if its contents haven't changed. This matters in Context providers:

```typescript
// ❌ New object every render — all consumers re-render unnecessarily
const value = {
  success: (msg) => addToast(msg, 'success'),
  error: (msg) => addToast(msg, 'error'),
};

// ✓ Same object reference if addToast hasn't changed
const value = useMemo(
  () => ({
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
  }),
  [addToast]
);
```

`useMemo` caches the result of a function and only recalculates when its dependencies change. Here, `addToast` is already stable (wrapped in `useCallback`), so `value` is stable too — Context consumers only re-render when there's actually something new to show.

**Rule of thumb:** Any object you pass as a Context value should be wrapped in `useMemo`.

### useRef — mutable values that don't trigger re-renders

`useState` is for values that, when changed, should cause the component to re-render and update the UI. `useRef` is for values that need to persist across renders but changing them should NOT trigger a re-render.

```typescript
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const remainingRef = useRef(5000);
```

Good uses for `useRef`:

- Timer IDs (you clear/restart them, but the component doesn't need to re-render for that)
- Time measurements (`Date.now()` snapshots)
- Previous values of props

**Mental model:** `useState` is a signal to React — "something changed, please re-render." `useRef` is a sticky note on the component — "remember this between renders, but don't redraw."

### CSS animations: transform vs width

Animating `width` triggers the browser's **layout** phase on every frame — it has to recalculate the size and position of surrounding elements. For a progress bar running 60 frames per second, that's 300 layout recalculations over 5 seconds.

`transform: scaleX()` runs entirely on the **GPU** and skips layout entirely. It's the standard approach for performant animations.

```css
/* ❌ Causes layout recalculation every frame */
@keyframes shrink {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

/* ✓ GPU-only, no layout cost */
@keyframes shrink {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
```

`transform-origin` controls the anchor point of the transform. By default it's `center`, so `scaleX(0)` would collapse the bar inward from both sides. `origin-left` (Tailwind) anchors it to the left edge so it shrinks from right to left:

```tsx
<div className="origin-left" style={{ animationName: "shrink", ... }} />
```

### CSS animation: shorthand vs individual properties

The `animation` CSS shorthand sets all animation sub-properties at once:

```css
animation: toast-shrink 5s linear forwards;
/* equivalent to: */
animation-name: toast-shrink;
animation-duration: 5s;
animation-timing-function: linear;
animation-fill-mode: forwards;
animation-play-state: running; /* ← implicit default */
```

When you mix the shorthand with a separate `animation-play-state` in React inline styles, the browser's handling of which one wins can be inconsistent. Using individual properties avoids the ambiguity entirely:

```typescript
style={{
  animationName: "toast-shrink",
  animationDuration: `${DURATION}ms`,
  animationTimingFunction: "linear",
  animationFillMode: "forwards",
  animationPlayState: isPaused ? "paused" : "running",  // clearly wins
}}
```

### animationPlayState — pausing a CSS animation mid-run

`animation-play-state: paused` freezes the animation exactly where it is. Setting it back to `running` resumes from the same point — the browser remembers the progress. This is what makes hover-to-pause work with no extra logic:

```typescript
animationPlayState: isPaused ? 'paused' : 'running';
```

The visual bar and the timer are separate concerns: the CSS animation is purely decorative. The actual dismiss is handled by `setTimeout`, which is managed independently.

### Hover-pause with remaining time tracking

A `setTimeout` can't be paused — you can only clear it and start a new one. To pause and resume correctly, you track how much time has elapsed when pausing, and start the next timeout with the remainder:

```typescript
const DURATION = 5000;
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const remainingRef = useRef(DURATION);

useEffect(() => {
  if (isPaused) return; // don't start while paused

  const startedAt = Date.now();
  timerRef.current = setTimeout(onClose, remainingRef.current);

  return () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      // Save how much time is left for the next resume
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedAt)
      );
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isPaused]);
```

When `isPaused` changes to `true`: the effect's cleanup function runs, clears the timer, and saves the remaining time. When `isPaused` changes back to `false`: a new timer starts with the saved remainder. One effect, two behaviors, driven by the same dependency.

### React key remounting trick

When a component's `key` prop changes, React treats it as a completely different component — it unmounts the old one and mounts a fresh one. All local state (including `useRef` values and active timers) is reset.

This is useful for "refreshing" a component without rearchitecting its internals:

```typescript
// In the provider — when the same message arrives again:
const id = crypto.randomUUID(); // new id → new key → React remounts Toast
const refreshed = { id, message, type, onClose: () => removeToast(id) };
return prev.map((t) => (t.id === existing.id ? refreshed : t));
```

The toast stays in the same position in the list (we replace, not remove+add), but because its `key` changed, React sees it as a new component. The timer restarts from 5 seconds, the progress bar resets to full. The user sees a "refreshed" toast without flicker.

---

### <a name="err-progress-bar-not-animating"></a> Progress bar not animating

**What happened:** The toast progress bar was completely static — no visual movement, and toasts never closed automatically.
**Why:** Two compounding issues. First, animating `width` in CSS can fail silently if the element doesn't have an explicit initial width set via a stylesheet rule (not just a natural block width). Second, mixing the `animation` shorthand with `animationPlayState` as a separate inline style property can cause inconsistent browser behavior. Together, they prevented the animation from starting.
**Fix:** Switch to `transform: scaleX()` (GPU-accelerated, no width dependency) and use individual `animation-*` properties instead of the shorthand:

```css
@keyframes toast-shrink {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
```

```typescript
style={{
  animationName: "toast-shrink",
  animationDuration: `${DURATION}ms`,
  animationTimingFunction: "linear",
  animationFillMode: "forwards",
  animationPlayState: isPaused ? "paused" : "running",
}}
```

Also decouple dismiss from animation: `useEffect`/`setTimeout` handles closing; the CSS animation is purely visual.

---

## Session 11 — Schema design, domain modelling, Ukrainian academic degrees

### Translating real-world data into a schema

When adding fields from an existing spreadsheet to Prisma, don't copy the structure blindly. Ask three questions for each field:

1. **Is this a foreign key disguised as a string?** A `department String?` field that stores a department name should be a proper `departmentId` relation — otherwise you lose filtering, get typos, and can't delete departments safely.
2. **Is this enum value actually two separate concepts?** The original `AcademicRank` mixed _вчене звання_ (academic rank, awarded by ministry) with _посада_ (position, set by university). A professor can be "доцент за посадою" without holding the "вчене звання доцента". Split into two enums: `AcademicRank` and `AcademicPosition`.
3. **Is this boolean better than extra enum variants?** `CANDIDATE_PHD_DEPARTMENT_SPECIFIC` as an enum value doubles the enum size just to track one extra yes/no fact. A `degreeMatchesDepartment Boolean?` field asks the same question more clearly, and the two concerns stay independent.

### Ukrainian academic degree system

Ukraine has two parallel systems coexisting since the 2016 reform:

| Old system (pre-2016) | New system (post-2016)            |
| --------------------- | --------------------------------- |
| кандидат наук         | доктор філософії (PhD equivalent) |
| доктор наук           | доктор наук (unchanged)           |

Both titles still exist in real professor data — someone who graduated in 2013 keeps "кандидат наук" forever. For official document generation, the exact diploma title matters — you can't substitute one for the other.

In our platform's spreadsheet, both are tracked as "Кандидат наук (PhD)", so we store them as one enum value and can split later if needed:

```prisma
enum ScientificDegree {
  CANDIDATE  // кандидат наук / доктор філософії (PhD)
  DOCTOR     // доктор наук
}
```

### degreeMatchesDepartment — a qualifier, not a category

"За спеціальністю кафедри" (degree specialty matches the department) is NOT a distinct degree type — it's a yes/no qualifier that affects rating scores. Stored as `Boolean?`:

- `null` — not yet verified
- `true` — degree specialty matches the department's accredited specialties
- `false` — it doesn't match

An admin sets this manually by comparing the diploma to the department's specialties list. The system cannot calculate it automatically.

### Two organisational structures in one university

A university has two separate trees that coexist independently:

```
Academic:                    Administrative:
Faculty (Факультет)          Division (Відділ)
  └── Department (Кафедра)     └── Users (staff who work there)
        └── Professor
```

- **Academic structure** — defines where professors _work_ and _teach_
- **Administrative structure** — defines who _manages_ specific data about professors

A Division doesn't contain professors — it manages specific domains of professor data. For example: the Educational and Research Division manages ratings; the Quality Assurance Division manages accreditation. Different divisions own different slices of professor data.

This is why `divisionId` lives on `User`, not on `Professor` — a division's _staff_ belong to it, not the professors it manages.

### Circular references in Prisma

When two models reference each other (Department has a Professor as head, Professor belongs to a Department), Prisma needs help distinguishing which relation is which. The solution is **named relations**.

Without names Prisma throws: _"The relation field is ambiguous."_

**The owner side** — holds the actual foreign key column, has `fields` and `references`:

```prisma
head Professor? @relation("DepartmentHead", fields: [headId], references: [id])
```

**The back-relation side** — virtual, no column in DB, no `fields`/`references`:

```prisma
headOfDepartment Department? @relation("DepartmentHead")
```

The same string `"DepartmentHead"` on both sides tells Prisma these two fields are the two ends of the same relationship.

### Back-relations are virtual — no DB column

A back-relation like `headOfDepartment Department?` creates **no column** in the `Professor` table. It only exists in TypeScript so you can write `professor.headOfDepartment` without a manual query. If you deleted it, the database wouldn't change at all.

The actual foreign key column always lives on the **owner side** — in this case `headId` on `Department`.

### @unique on a foreign key — one-to-one vs one-to-many

```prisma
headId String? @unique
```

Without `@unique`: many departments could share the same professor as head (one-to-many).
With `@unique`: each `headId` value can only appear once — one professor leads at most one department (one-to-one).

Rule of thumb: add `@unique` to a foreign key when the real-world constraint is "one person can only hold this role in one place at a time."

### <a name="err-usestate-as-effect"></a> useState used as a side-effect hook

**What happened:** Code attempted `useState(() => { setMounted(true) })` to run a side effect after mount.
**Why:** `useState`'s initializer argument is for computing the _initial value_ of the state, not for running side effects. It returns the initial value, not a cleanup function, and only runs on the first render. It is not a substitute for `useEffect`.
**Fix:** Use `useEffect` for any logic that should run after the component mounts:

```typescript
const [mounted, setMounted] = useState(false);
useEffect(() => {
  setMounted(true);
}, []);
```

---

## Session 12 — Database backups, cron scheduling, pg_dump

### Why backups matter and what pg_dump does

`pg_dump` is PostgreSQL's built-in backup tool. It takes a consistent snapshot of the database and writes it as a `.sql` file — a series of `CREATE TABLE` and `INSERT INTO` statements. To restore, you pipe that file back into `psql` and the database is rebuilt from scratch.

The key property: **pg_dump doesn't lock the database**. PostgreSQL uses MVCC (Multi-Version Concurrency Control) — when a backup starts, Postgres takes a snapshot of the data at that exact moment. Users can keep reading and writing while the backup runs. Nobody notices it's happening.

For a small dataset (university platform, hundreds to thousands of rows), a full backup completes in under a second and produces a file under a few MB.

### Backup container vs host cron job

Two approaches to automate backups:

**Host cron job** — a script on the machine runs `pg_dump` on a schedule. Requires configuring the host OS, not portable.

**Dedicated backup container** — a Docker container whose only job is running `pg_dump` on a schedule. Everything stays inside Docker Compose. The `prodrigestivill/postgres-backup-local` image handles scheduling, compression, and rotation automatically.

We use the container approach because it keeps all infrastructure in one place and requires zero host-level configuration.

### Cron syntax

The standard Unix format for scheduling. Five fields:

```
┌─ minute  (0–59)
│ ┌─ hour   (0–23)
│ │ ┌─ day of month (1–31)
│ │ │ ┌─ month (1–12)
│ │ │ │ ┌─ day of week (0–7)
│ │ │ │ │
0 2 * * *    ← 2:00 AM every day
```

`*` means "every possible value". So `* * * * *` means every minute.

Common patterns:

```
0 2 * * *     every day at 2 AM
0 2 * * 0     every Sunday at 2 AM
0 */6 * * *   every 6 hours
```

2 AM is a common backup time — it's the quietest period when no one is using the system.

### Three-tier backup retention

Instead of keeping every daily backup forever, use three rolling windows:

| Tier    | Count | Covers        |
| ------- | ----- | ------------- |
| Daily   | 7     | last 7 days   |
| Weekly  | 4     | last 4 weeks  |
| Monthly | 6     | last 6 months |

**Total: 17 files maximum** at any given moment. Each tier rolls independently — when a new daily is created, the oldest daily is deleted.

Why three tiers instead of just one:

- If you kept only 7 dailies, you'd have no coverage beyond one week
- If you kept 180 dailies (6 months), you'd use 180× the disk space
- Three tiers give 6 months of coverage with only 17 files

Recovery granularity: use a daily for "broke today", weekly for "noticed 2 weeks later", monthly for "something went wrong 3 months ago".

### Host path volumes vs named volumes

We've used both volume types in `docker-compose.yml`:

```yaml
# Named volume — Docker manages it, stored in Docker's internal location
- postgres_data:/var/lib/postgresql/data

# Host path — maps to a real folder on your machine
- ./backups:/backups
```

**Named volumes** are for data that only Docker needs to access (like Postgres data files). Docker manages the location — you can't easily open it in File Explorer.

**Host path volumes** are for data you want to access directly from your machine — backup files you might want to copy, inspect, or move to another server. `./backups` creates a real folder next to `docker-compose.yml` that you can open normally.

**Errors this session:** [gunzip not available on Windows](#err-gunzip-windows), [gunzip fails on symlink](#err-gunzip-symlink), [gunzip -k fails on hard-linked file](#err-gunzip-hard-link)

---

### <a name="err-gunzip-windows"></a> gunzip not available on Windows PowerShell

**What happened:** `The term 'gunzip' is not recognized as the name of a cmdlet`.
**Why:** `gunzip` is a Linux/Unix tool — it doesn't exist in Windows PowerShell.
**Fix:** Run the command inside the Docker container where Linux tools are available:

```bash
docker compose exec postgres-backup gunzip -c /backups/last/edurank-latest.sql.gz > backups/edurank.sql
```

Or simply open the `.sql.gz` file directly in VS Code — it reads gzip files natively.

### <a name="err-gunzip-symlink"></a> gunzip fails on symlink with "Too many levels of symbolic links"

**What happened:** `gzip: /backups/last/edurank-latest.sql.gz: Too many levels of symbolic links`.
**Why:** `edurank-latest.sql.gz` is a symlink pointing to the real timestamped file. `gunzip` can't follow it.
**Fix:** List the directory to find the actual filename, then use that:

```bash
docker compose exec postgres-backup ls /backups/last/
# Use the timestamped file, e.g. edurank-20260417-115133.sql.gz
```

### <a name="err-gunzip-hard-link"></a> gunzip -k fails on hard-linked backup file

**What happened:** `gzip: edurank-20260417-115133.sql.gz has 3 other links -- file ignored`.
**Why:** The backup container creates hard links between daily/weekly/monthly tiers to save disk space. `gunzip -k` (keep original) refuses to extract files with hard links as a safety measure.
**Fix:** Use `-c` (stdout) and redirect to a new file instead of extracting in-place:

```bash
docker compose exec postgres-backup gunzip -c /backups/last/edurank-20260417-115133.sql.gz > backups/edurank.sql
```

---

## Session 13 — Testing setup: Vitest, Husky, git hooks

### Vitest vs Jest — why we chose Vitest

Both are JavaScript test runners with identical APIs (`describe`, `it`, `expect`). The difference is setup cost and speed.

|                     | Jest                            | Vitest                              |
| ------------------- | ------------------------------- | ----------------------------------- |
| TypeScript          | Needs `ts-jest` or Babel config | Works natively                      |
| Path aliases (`@/`) | Needs `moduleNameMapper` config | Reads `tsconfig.json` automatically |
| Speed               | Slower                          | Much faster (uses Vite's pipeline)  |
| First run           | Slow                            | Slow (cold cache), fast after       |

For this project, Vitest is the right choice because we use TypeScript and `@/` path aliases everywhere. With Jest you'd spend 30 minutes configuring transforms before writing a single test. Vitest just works.

The API is identical — everything learned here transfers to Jest projects.

### Husky — enforcing rules with git hooks

Git has built-in hook points — moments where it pauses and asks "should I run something before continuing?" Common ones:

| Hook         | When it runs                    |
| ------------ | ------------------------------- |
| `pre-commit` | Before a commit is created      |
| `pre-push`   | Before code is pushed to remote |

**Husky** makes git hooks easy to manage in a Node.js project. It stores hooks as small shell scripts in `.husky/` and commits them to git — so every developer on the project gets the same hooks automatically.

We use `pre-push` (not `pre-commit`) because:

- Tests can take a few seconds — running on every commit would feel slow
- Pushes are less frequent than commits — a natural checkpoint

```bash
# .husky/pre-push
npm test     # if this fails, the push is blocked
```

The flow:

```
git push
  → Husky runs npm test
  → tests pass ✓ → push continues
  → tests fail ✗ → push blocked, error shown
```

### `prepare` script — auto-installing Husky

```json
"scripts": {
  "prepare": "husky"
}
```

`prepare` is a special npm lifecycle script that runs automatically after `npm install`. Adding `husky` here means any developer who clones the repo and runs `npm install` gets Husky set up automatically — no manual step needed.

### jsdom — a fake browser for Node.js

Tests run in Node.js, which has no browser APIs (`window`, `document`, `querySelector` don't exist). `jsdom` simulates a browser environment in memory so Node.js can run code that expects a browser.

Set in `vitest.config.ts`:

```typescript
test: {
  environment: "jsdom",
}
```

Not needed for pure function tests like `cn` — but required the moment a test renders a React component. Installed upfront so it's ready when needed.

### @vitejs/plugin-react — JSX in tests

Vitest doesn't understand JSX (`<Button />`) by default. This plugin teaches it to transform JSX into plain JavaScript, the same way Next.js does during builds. Required for any test that renders a component.

### Test co-location

Test files live next to the source file they test:

```
src/utils/cn.ts       ← source
src/utils/cn.test.ts  ← tests for cn
```

Why co-location over a separate `__tests__/` folder:

- Easy to see if a file has tests (just look next to it)
- Moving or deleting a file naturally carries its tests with it
- No mental mapping between folder structures

### Vitest cold start

The first `npm test` run is slow (10–44 seconds) because Vitest compiles all TypeScript, builds jsdom, and writes its cache to disk. Subsequent runs reuse the cache and complete in under 2 seconds for the same tests.

`npm run test:watch` keeps Vitest running in the background. Re-runs on file save are near-instant (~100ms) because nothing needs recompiling.
