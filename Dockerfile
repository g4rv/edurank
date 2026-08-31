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
# pnpm, no tsx and no TypeScript, so the one-off scripts — `db:seed`,
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

# `standalone` carries the server and a pruned node_modules. The other two are
# placed by hand, and for different reasons — both verified against a real build
# on 2026-08-13:
#
#   .next/static  is genuinely absent from the standalone output. Forget it and
#                 the app boots, serves, and renders every page with no
#                 stylesheet — a working site that looks broken.
#   public        is present but only PARTLY: Next traces it, so `public/fonts`
#                 came through and the unreferenced files did not. Copying it
#                 wholesale is what makes that difference stop mattering.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

COPY --from=prisma-cli --chown=nextjs:nodejs /opt/prisma /opt/prisma
COPY --chown=nextjs:nodejs prisma/schema.prisma /opt/prisma/prisma/schema.prisma
COPY --chown=nextjs:nodejs prisma/migrations /opt/prisma/prisma/migrations

COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

USER nextjs
EXPOSE 3000

# Is this container able to SERVE, not merely running?
#
# `/api/health` asks Postgres for `SELECT 1`, so a container that booted fine
# and cannot reach the database reports unhealthy instead of quietly serving an
# error on every page.
#
# WHY `node -e` AND NOT `curl`. This image is node:22-slim plus openssl and
# ca-certificates — there is no curl and no wget in it. Coolify's own health
# check UI generates a curl command by default, so switching it on without
# reading this would mark a perfectly good container unhealthy forever. Node is
# already here and Node 22 has a global `fetch`, so the check costs nothing to
# install and cannot drift from what the image actually contains.
#
# PORT is read at runtime rather than baked in: the ENV above defaults it to
# 3000, and Coolify may set something else.
#
# ── `start-period` is 180s, and it is FREE ──
#
# The entrypoint applies migrations BEFORE the server listens, so early failures
# are the app working, not the app broken. Inside the start period a failure is
# not counted at all: the container reads «health: starting», never «unhealthy».
#
# The number is generous because a long start period costs nothing in the normal
# case — Docker marks the container healthy the moment the FIRST check passes, so
# an app that boots in twenty seconds is healthy at twenty seconds whatever this
# says. All it buys is forgiveness for a migration that rewrites a big table.
#
# What it does trade: a container that is genuinely broken takes 180s + 3×10s to
# be called unhealthy instead of 60s + 3×10s. Slower to notice a real failure,
# much harder to kill a deploy that was fine. For a university app with a few
# hundred users and one maintainer, that is the right way round. Raise it if a
# migration ever gets near it.
#
# ── HEALTHCHECK_OFF — the escape hatch ──
#
# A healthcheck baked into an image is normally undoable only by building a new
# image, and a broken check takes the site down with it (Traefik stops routing
# to an unhealthy container). So the check reads this first: set
# `HEALTHCHECK_OFF=1` in Coolify and restart, and it passes unconditionally —
# back to how the app behaved before any of this existed. No rebuild.
#
# ── NOT ENABLED YET, on purpose (2026-08-31) ──
#
# The line below is commented out and the endpoint it calls is live, so
# `/api/health` can be curled by hand today and answers correctly.
#
# What is NOT known: whether Coolify's deploy gate waits on a container's health
# before calling a deployment successful. If it does, a check that is wrong — or
# merely slower than the gate's patience — fails a deploy that was fine. That is
# a risk worth taking on an afternoon when somebody can watch `docker ps`, and
# not one to leave lying in the image until then.
#
# TO ENABLE, when there is half an hour to watch it:
#   1. Uncomment the two lines below, deploy.
#   2. `docker ps` → wait for STATUS `(healthy)`. That is the whole test, and it
#      costs nothing: Coolify's own healthcheck stays disabled, so Traefik goes
#      on routing traffic whatever this says.
#   3. Only if it reads `(healthy)`, consider enabling it in Coolify's UI too.
#   If anything looks wrong: `HEALTHCHECK_OFF=1` + restart, or comment it out again.
#
# See docs/deployment.md § «When the healthcheck is the problem».
#
# HEALTHCHECK --interval=10s --timeout=5s --start-period=180s --retries=3 \
#   CMD node -e "if(process.env.HEALTHCHECK_OFF)process.exit(0);fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
