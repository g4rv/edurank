# EduRank

A web platform for managing university staff data. Replaces manual Google Drive spreadsheets and a Google Apps Script (limited to 6 minutes of execution time) with a proper database-backed system featuring role-based access control and automated document generation.

---

## Stack

| Layer        | Technology                  | Version        |
| ------------ | --------------------------- | -------------- |
| Framework    | Next.js                     | 16             |
| Language     | TypeScript                  | 5              |
| Styling      | Tailwind CSS                | 4              |
| ORM          | Prisma                      | 7              |
| Database     | PostgreSQL                  | 16             |
| Auth         | Auth.js (next-auth v5 beta) | 5.0.0-beta     |
| File storage | TBD — RustFS or Garage      | —              |
| Runtime      | Node.js                     | 20+            |
| Infra        | Docker + Docker Compose     | —              |

---

## Prerequisites

- [Node.js](https://nodejs.org) v20+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

## First-time setup

### 1. Clone and install

```bash
git clone <repo-url>
cd edurank
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the real values. The file is listed in `.gitignore` — never commit it.

To generate a secure `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start the database

```bash
docker compose up -d
```

Starts two containers:

- **postgres** — PostgreSQL on port `5432`
- **adminer** — visual database browser at http://localhost:8080

First run downloads images (~600 MB). Subsequent starts are instant.

### 4. Apply database migrations

```bash
npx prisma migrate dev
```

Creates all tables in the database from the schema in `prisma/schema.prisma`.

### 5. Generate Prisma client

```bash
npx prisma generate
```

Generates TypeScript types into `src/generated/prisma/`. Required before the app will compile.

### 6. Seed the database

```bash
npm run seed
```

Creates the first admin user so you can log in. Safe to run multiple times — uses `upsert`.

### 7. Start the dev server

```bash
npm run dev
```

App runs at **http://localhost:3000**.

---

## Daily workflow

```bash
docker compose up -d   # start the database
npm run dev            # start Next.js

# ... do your work ...

docker compose stop    # stop the database when done
```

---

## Useful URLs

| Service              | URL                   | Notes                     |
| -------------------- | --------------------- | ------------------------- |
| App                  | http://localhost:3000 | —                         |
| Adminer (DB browser) | http://localhost:8080 | See login details below   |

**Adminer login:**

| Field    | Value                           |
| -------- | ------------------------------- |
| System   | `PostgreSQL`                    |
| Server   | `postgres`                      |
| Username | `edurank_user`                  |
| Password | `POSTGRES_PASSWORD` from `.env` |
| Database | `edurank`                       |

---

## Project structure

```
edurank/
├── src/
│   ├── app/
│   │   ├── (auth)/login/        Login page
│   │   ├── api/                 API route handlers
│   │   │   └── auth/            Auth.js catch-all route
│   │   ├── admin/               Admin panel (faculty / department / professor)
│   │   └── professors/          Professor list + detail/edit pages
│   ├── auth.ts                  Auth.js config (providers, callbacks, JWT)
│   ├── proxy.ts                 Route protection middleware
│   ├── lib/
│   │   └── prisma.ts            Prisma client singleton
│   ├── components/
│   │   └── ui/                  Shared UI components (button, input, toast…)
│   ├── providers/               React Context providers (toast)
│   └── types/
│       └── next-auth.d.ts       Auth.js session type extensions
├── prisma/
│   ├── schema.prisma            Database schema — edit this to change structure
│   ├── seed.ts                  Initial data script
│   └── migrations/              Auto-generated SQL migration history
├── documentation/
│   ├── personal/                Developer learning notes
│   └── technical/               Commit schema, architectural decisions
├── docker-compose.yml           Infrastructure (Postgres, Adminer, backups)
├── .env                         Local secrets (never committed)
└── .env.example                 Secrets template (committed, fake values)
```

---

## Data model overview

```
Faculty
  └── Department (many per faculty)
        └── Professor (many per department)

User (platform login accounts — separate from professors)
  └── optionally linked to a Professor record
```

**Roles:**

| Role     | Access                                       |
| -------- | -------------------------------------------- |
| `ADMIN`  | Full access — all fields, all professors     |
| `EDITOR` | Division-scoped — edits their division's fields on any professor |
| `USER`   | Own profile only — limited fields            |

Sessions are stored as signed JWT cookies — no session table in the database.

---

## Common commands

| Command                         | What it does                                  |
| ------------------------------- | --------------------------------------------- |
| `npm run dev`                   | Start development server                      |
| `npm test`                      | Run tests once                                |
| `npm run test:watch`            | Run tests in watch mode                       |
| `npm run seed`                  | Seed the database with initial data           |
| `npm run db:migrate`            | Create and apply a new migration              |
| `npm run db:generate`           | Regenerate Prisma TypeScript client           |
| `npm run db:studio`             | Open Prisma Studio (visual DB browser)        |
| `npm run db:reset`              | Drop DB, reapply all migrations, run seed     |
| `npm run format`                | Format all files with Prettier                |
| `npm run lint`                  | Lint with ESLint                              |
| `npm run ts:check`              | Type-check without emitting files             |
| `docker compose up -d`          | Start all Docker containers in background     |
| `docker compose stop`           | Stop containers (data preserved)              |
| `docker compose down`           | Remove containers (data preserved)            |
| `docker compose down -v`        | Remove containers AND all data (full reset)   |

---

## Making database changes

Always go through Prisma migrations — never edit the database directly:

```bash
# 1. Edit prisma/schema.prisma
# 2. Create and apply the migration:
npx prisma migrate dev --name describe_your_change
# 3. Commit the generated file in prisma/migrations/
```

---

## Documentation

- `documentation/personal/learning-notes.md` — concepts learned while building, including architectural decisions
- `documentation/technical/commit-schema.md` — commit message conventions
- `CLAUDE.md` — project rules and conventions for AI-assisted development
