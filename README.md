# EduRank

University staff management platform for internal use at a university science department. Replaces a Google Sheets + Google Apps Script pipeline with a self-hosted web application.

## What it does

- Centralized profiles for all academic (НПП) and administrative staff
- Role-based access: Admin, Editor (per-division), Professor
- Division-level field and entity permissions configured by admin
- Achievement submission and validation workflow (phase 2)
- Rating tables, reports, and PDF generation (phase 2)

## Stack

- **Next.js 16** (App Router, React 19, Turbopack)
- **TypeScript** (strict)
- **Tailwind CSS v4** + shadcn/ui
- **Prisma** + PostgreSQL (via Docker)
- **NextAuth.js** — email/password auth
- **Zod** + React Hook Form — validation
- **Vitest** — unit tests

## Getting started

### Prerequisites

- Node.js 20+
- pnpm
- Docker

### Setup

```bash
# Install dependencies
pnpm install && pnpm db:generate

# Copy env template and fill in values
cp .env.example .env
# Edit .env — set AUTH_SECRET (generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# Start database
docker compose up -d

# Apply migrations and seed
pnpm db:migrate --name init
pnpm db:seed

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
pnpm dev              # dev server (Turbopack)
pnpm build            # production build
pnpm start            # production server
pnpm lint             # ESLint
pnpm lint:fix         # ESLint with auto-fix
pnpm format           # Prettier
pnpm type-check       # TypeScript check (no emit)
pnpm test             # Vitest

pnpm db:migrate       # create + apply migration (prompts for name, or pass --name <x>)
pnpm db:seed          # seed database with test data
pnpm db:reset         # wipe DB and reapply all migrations (dev only)
pnpm db:generate      # regenerate Prisma client after schema change
pnpm db:studio        # Prisma Studio GUI at localhost:5555
```

## Project structure

See [CLAUDE.md](./CLAUDE.md) for full architecture documentation, conventions, and folder structure.
