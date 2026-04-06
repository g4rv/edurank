# EduRank — Developer Setup

A web platform for managing university staff data. Replaces manual Google Drive spreadsheets with a proper database-backed system with role-based access control.

---

## Stack

| Layer | Tool | Version |
|---|---|---|
| Framework | Next.js | 16 |
| Language | TypeScript | 5 |
| Styling | Tailwind CSS | 4 |
| ORM | Prisma | 7 |
| Database | PostgreSQL | 16 |
| File storage | MinIO | latest |
| Auth | Auth.js | (upcoming) |
| Infrastructure | Docker + Docker Compose | — |

## Dev tools (local only, not in production)

| Tool | Purpose | URL |
|---|---|---|
| Adminer | Visual database browser — inspect tables, run queries, edit rows | http://localhost:8080 |
| MinIO Console | Visual file browser — see uploaded files, manage buckets | http://localhost:9001 |

---

## Prerequisites

- [Node.js](https://nodejs.org) v20+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

## First-time setup

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd edurank
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in real values. Never commit this file.

Generate a secure `AUTH_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Start infrastructure (database + file storage)

```bash
docker compose up -d
```

This starts three containers:
- **postgres** — PostgreSQL database on port `5432`
- **adminer** — Visual database browser at http://localhost:8080
- **minio** — File storage at http://localhost:9000, console at http://localhost:9001

First run downloads images (~600MB total). Subsequent runs are instant.

### 4. Apply database migrations

```bash
npx prisma migrate dev
```

Creates all tables in the database.

### 5. Generate Prisma client

```bash
npx prisma generate
```

Generates TypeScript types from the schema into `src/generated/prisma/`.

### 6. Start the development server

```bash
npm run dev
```

App runs at http://localhost:3000.

---

## Daily workflow

```bash
docker compose up -d   # start DB and storage
npm run dev            # start Next.js

# ... do work ...

docker compose stop    # stop DB and storage when done
```

---

## Useful URLs (local development)

| Service | URL | Credentials |
|---|---|---|
| App | http://localhost:3000 | — |
| Adminer (DB browser) | http://localhost:8080 | See Adminer login below |
| MinIO Console | http://localhost:9001 | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` from `.env` |

**Adminer login:**
- System: `PostgreSQL`
- Server: `postgres`
- Username: `edurank_user`
- Password: `POSTGRES_PASSWORD` from `.env`
- Database: `edurank`

---

## Project structure

```
edurank/
  src/
    app/               Next.js App Router pages and API routes
    lib/
      prisma.ts        Shared Prisma client singleton
    generated/
      prisma/          Auto-generated Prisma types (do not edit)
  prisma/
    schema.prisma      Database schema — edit this to change DB structure
    migrations/        Auto-generated SQL migration history
  documentation/
    personal/          Learning notes
    technical/         This file and other technical docs
  docker-compose.yml   Infrastructure definition
  .env                 Local secrets (never committed)
  .env.example         Secrets template (committed, fake values)
```

---

## Database schema overview

```
Faculty
  └── Department (many per faculty)
        └── Professor (many per department)

User (platform accounts)
  └── Session (one per logged-in browser)
```

Roles: `ADMIN` | `EDITOR` | `VIEWER`

---

## Making database changes

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name describe_your_change`
3. Commit the generated migration file in `prisma/migrations/`

Never edit the database directly — always go through migrations so changes are tracked and reproducible.

---

## Stopping / resetting

```bash
docker compose stop          # stop containers, keep all data
docker compose down          # remove containers, keep all data
docker compose down -v       # remove containers AND all data (full reset)
```
