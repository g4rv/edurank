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
pnpm install

# Copy env template and fill in values
cp .env.example .env.local

# Start database
docker compose up -d

# Apply migrations and seed
pnpm prisma migrate dev
pnpm prisma db seed

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
pnpm dev          # dev server (Turbopack)
pnpm build        # production build
pnpm start        # production server
pnpm lint         # ESLint
pnpm lint:fix     # ESLint with auto-fix
pnpm format       # Prettier
pnpm type-check   # TypeScript check (no emit)
pnpm test         # Vitest
```

## Project structure

See [CLAUDE.md](./CLAUDE.md) for full architecture documentation, conventions, and folder structure.
