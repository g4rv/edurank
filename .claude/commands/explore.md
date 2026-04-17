Read the following files to get full context before doing anything else:

1. `CLAUDE.md` — project rules, stack decisions, current state checklist, mentor instructions
2. `AGENTS.md` — Next.js version warnings
3. `documentation/personal/learning-notes.md` — what has been learned and built so far
4. `documentation/technical/commit-schema.md` — commit format rules
5. `prisma/schema.prisma` — current database structure
6. `src/lib/prisma.ts` — Prisma client setup
7. `docker-compose.yml` — local infrastructure
8. `package.json` — installed dependencies

Then scan the full file tree (excluding node_modules, .next, generated, .git) to see what exists.

After reading everything, give a short structured summary:

## Current state

What has been built so far — files, features, infrastructure.

## What we know

Key concepts covered in learning-notes.md (one line each).

## What's next

The next logical step based on the checklist in CLAUDE.md.

## Anything off

Flag any inconsistencies between CLAUDE.md, the code, and the notes — stale docs, missing files, mismatches.

Be concise. This is an orientation, not a full audit.
