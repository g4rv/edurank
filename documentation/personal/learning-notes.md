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

## Session 4 — Seed script, tooling cleanup, sessionVersion

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

**Errors this session:** [searchParams is a Promise in Next.js 16](#err-searchparams-async), [Prisma seed config ignored from package.json](#err-prisma-seed-config), [Seed script ECONNREFUSED](#err-seed-econnrefused)

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
