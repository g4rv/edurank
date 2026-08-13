# EduRank production image, for Coolify.
#
# Four stages so the thing that ships carries no build tooling: install, build,
# a separately-installed Prisma CLI for migrations, and a runner that is little
# more than Node plus the standalone server.
#
# Build it from the repo root:  docker build -t edurank .
# Run it:                       see docker/entrypoint.sh and docs/deployment.md

# ── deps ──────────────────────────────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

# Corepack reads `packageManager` from package.json, so the image uses exactly
# the pnpm the lockfile was written with. The prompt suppression matters in CI:
# without it corepack stops and waits for a keypress nobody can give it.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── builder ───────────────────────────────────────────────────────────────────
# Also the tools image. The runner below is the standalone build and has no
# pnpm, no tsx and no TypeScript, so the one-off scripts — `db:seed-production`,
# `db:create-admin` — cannot run there. Build this stage on its own when you
# need them:  docker build --target builder -t edurank-tools .
# See docs/deployment.md §4.
FROM node:22-slim AS builder
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The generated client is gitignored, so it does not arrive with the source and
# nothing compiles until it exists.
RUN pnpm db:generate

ENV NEXT_TELEMETRY_DISABLED=1

# Both values are placeholders, and they are set INLINE rather than with ENV so
# they live only for the length of this one command — an `ENV AUTH_SECRET=…`
# is recorded in the image metadata for anyone running `docker inspect`, which
# is a bad habit to teach even when the value is fake.
#
# They are needed because `next build` imports the app: `lib/db.ts` constructs
# the Prisma client at module load and throws without a URL, and `lib/auth.ts`
# throws without a secret whenever NODE_ENV is production — which it is, during
# a build. Nothing connects, and nothing is baked into the bundle: only
# NEXT_PUBLIC_* values are inlined, and these are neither.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    AUTH_SECRET=build-time-placeholder-replaced-at-runtime \
    pnpm build

# ── prisma CLI ────────────────────────────────────────────────────────────────
# Its own directory with its own node_modules, deliberately apart from the app.
# `output: 'standalone'` prunes the app's dependency tree to what the server
# actually imports, and the migration CLI is not part of that — installing it
# into the same tree would mean shipping the pruned tree plus a second copy of
# half of Prisma.
#
# Keep this version in step with `prisma` in package.json.
FROM node:22-slim AS prisma-cli
WORKDIR /opt/prisma
RUN npm init -y >/dev/null \
    && npm install --omit=dev --no-audit --no-fund prisma@7.8.0

# Its own config, because the repo's `prisma.config.ts` pulls in dotenv and TS
# and expects the whole project around it. Here the environment already holds
# DATABASE_URL — Coolify sets it — and there is nothing else to read.
COPY docker/prisma.config.mjs ./prisma.config.mjs

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    # The standalone server binds 127.0.0.1 by default, which from outside the
    # container looks exactly like a crashed app: the port is open, nothing
    # answers. Traefik reaches it only on 0.0.0.0.
    HOSTNAME=0.0.0.0

# openssl for the Prisma schema engine, ca-certificates for outbound TLS (SMTP).
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# `standalone` carries the server and its pruned node_modules but NOT these two,
# which have to be placed by hand. Forget them and the app boots, serves, and
# renders every page without a stylesheet or a font — a working site that looks
# broken.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

COPY --from=prisma-cli --chown=nextjs:nodejs /opt/prisma /opt/prisma
COPY --chown=nextjs:nodejs prisma/schema.prisma /opt/prisma/prisma/schema.prisma
COPY --chown=nextjs:nodejs prisma/migrations /opt/prisma/prisma/migrations

COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
