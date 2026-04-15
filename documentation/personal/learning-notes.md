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
  - postgres_data:/var/lib/postgresql/data  # maps named volume to path inside container
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
| | SQLite | MySQL | PostgreSQL |
|---|---|---|---|
| Runs as | A single file | Server | Server |
| Concurrent writes | Poor (locks file) | Good | Excellent |
| Advanced features | Minimal | Good | Best-in-class |
| Self-hosted | No server needed | Yes | Yes |

SQLite = prototypes, one person. MySQL = fine but Postgres is stronger. PostgreSQL = our choice.

---

## Database URL

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
  where: { departmentId: '...' }
})
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
const globalForPrisma = global as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
```

Then anywhere in the app:
```typescript
import { prisma } from "@/lib/prisma"
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

| Bucket | When it's included | Use for |
|---|---|---|
| `dependencies` | Always — dev AND production builds | Code that runs in the browser or server at runtime |
| `devDependencies` | Dev only — stripped from production | Tools that help you build (linters, type checkers, test runners) |

**Why it matters:** If a package your app actually *runs* (like `clsx` in `cn.ts`) is only in `devDependencies`, production builds will crash — the package won't be there.

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
import { PrismaPg } from "@prisma/adapter-pg"
const adapter = new PrismaPg(process.env.DATABASE_URL!)
new PrismaClient({ adapter })
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
declare module "next-auth" {
  interface Session {
    user: { id: string; email: string; role: Role }
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
  update: {},   // do nothing if user already exists
  create: { email, passwordHash, role: "ADMIN" },
})
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
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL("/home", request.url))
}

export const config = {
  matcher: ["/about/:path*"],
}
```

### Edge runtime vs Node.js runtime

Next.js proxy runs on the **Edge runtime** by default. Edge is a lightweight environment that starts faster and can run at CDN nodes worldwide — but it only supports a subset of Node.js APIs (no file system, no native modules).

**Prisma can't run on Edge** because it uses Node.js-only internals. If the proxy imports anything that imports Prisma (like our `auth.ts`), it crashes.

Fix: force Node.js runtime by adding one line at the top of the proxy file:

```typescript
export const runtime = "nodejs"
```

This tells Next.js to run the proxy in the full Node.js environment instead of Edge. Fine for self-hosted apps — only matters for Vercel Edge deployments.

### matcher — controlling which routes run the proxy

By default the proxy runs on every request, including Next.js static files and internal routes. The `matcher` config narrows it down:

```typescript
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
}
```

The pattern uses a negative lookahead (`(?!...)`) — plain English: "run on everything *except* these paths."

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

| Callback | When it runs |
|---|---|
| `jwt` | Token created (login) or read (every request) |
| `session` | When app code calls `auth()` or `useSession()` |
| `authorized` | In proxy/middleware to allow or block a request |
| `signIn` | After login — lets you reject specific users |
| `signOut` | On logout |
| `redirect` | Controls where the user goes after sign in/out |

Think of them like event listeners — Auth.js says "I will call `jwt` whenever I deal with a token, here's the slot."

### proxy — request contains metadata, not page content

The `request` argument in `proxy(request)` describes the **incoming HTTP request**, not the destination page. It's everything the browser sent:

```typescript
request.nextUrl.pathname  // which path they're trying to reach
request.method            // GET, POST, etc.
request.headers           // browser info, cookies, etc.
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
  const professors = await prisma.professor.findMany()
  return Response.json(professors)
}

export async function POST(request: Request) {
  const body = await request.json()
  const professor = await prisma.professor.create({ data: body })
  return Response.json(professor)
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
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  // ...
}
```

### Role-based guards on API routes

The proxy ensures a session exists, but it doesn't enforce roles. Role checks belong inside each handler. The pattern we use:

- `GET` — any authenticated user (proxy already guarantees a session)
- `POST / PUT` — EDITOR or ADMIN only
- `DELETE` — ADMIN only

```typescript
const session = await auth()
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
```

The 401 check is technically redundant if the proxy is running correctly, but it's a good safety net for direct API calls.

### Prisma error codes

When Prisma throws a known database error, it wraps it in a `PrismaClientKnownRequestError` with a `code` property. The ones we handle:

| Code | Meaning | Example |
|---|---|---|
| `P2002` | Unique constraint violation | Creating a faculty with a name that already exists |
| `P2003` | Foreign key constraint violation | Deleting a faculty that still has departments |
| `P2025` | Record not found | Updating or deleting a row that doesn't exist |

Pattern for catching them safely:

```typescript
import { Prisma } from "@/generated/prisma/client"

try {
  await prisma.faculty.delete({ where: { id } })
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return NextResponse.json({ error: "Cannot delete — has children" }, { status: 409 })
  }
  throw error  // re-throw anything unexpected
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
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/")
}

export async function createFaculty(formData: FormData) {
  await requireAdmin()
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
const faculties = await prisma.faculty.findMany()
const departments = await prisma.department.findMany()
const professors = await prisma.professor.findMany()

// Parallel — all three queries run at the same time
const [faculties, departments, professors] = await Promise.all([
  prisma.faculty.findMany(),
  prisma.department.findMany(),
  prisma.professor.findMany(),
])
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
{professor.lastName} {professor.firstName} {professor.patronymic}
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
export const dynamic = "force-dynamic";

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
export const runtime = "nodejs";  // needed to use Prisma
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
import { DataTable } from "@/components/data-table"
// instead of:
import { DataTable } from "@/components/data-table/data-table"
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

### max-w-* utilities and content width

Tailwind's `max-w-*` utilities control how wide content can get before it stops growing:

| Class | Max width | Use for |
|---|---|---|
| `max-w-3xl` | 48rem (768px) | Narrow reading content, forms |
| `max-w-4xl` | 56rem (896px) | Medium content |
| `max-w-7xl` | 80rem (1280px) | Wide layouts, dashboards, tables |

Combined with `mx-auto` (horizontal auto margins), content centers itself and respects the max-width limit even on ultrawide screens.

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
export const runtime = "nodejs";

// Proxy automatically runs on Node.js in Next.js 16
```

### <a name="err-build-db-query"></a> Build fails querying DB at build time
**What happened:** `npm run build` failed with `ECONNREFUSED` when trying to pre-render pages that query Prisma.
**Why:** Next.js tries to pre-render pages at build time by default. Pages that query the database need the DB running during build — but the build happens before Docker containers start, and even if DB is running, pre-rendered pages would show stale data.
**Fix:** Mark DB-querying pages as dynamic to skip build-time rendering:
```typescript
export const dynamic = "force-dynamic";

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
