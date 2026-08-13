#!/bin/sh
set -e

# Migrate, then serve. In that order and in one process tree, so a deploy that
# cannot migrate never starts serving: a running app against a schema it does
# not match is worse than an app that is plainly down, because it fails per
# page, at random, to whoever happens to be using it.
#
# `migrate deploy` only applies migrations that are already committed. It never
# generates one, never prompts, and never drops anything — it is the command
# built for exactly this and is safe to run on every boot. When there is nothing
# pending it prints so and exits 0.

if [ -z "$DATABASE_URL" ]; then
  echo "entrypoint: DATABASE_URL is not set — refusing to start." >&2
  exit 1
fi

echo "entrypoint: applying migrations…"
cd /opt/prisma
./node_modules/.bin/prisma migrate deploy

echo "entrypoint: starting EduRank on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
cd /app
# `exec` so Node becomes PID 1 and receives Coolify's stop signal directly.
# Without it the shell holds PID 1, swallows SIGTERM, and every redeploy waits
# out the ten-second kill timeout.
exec node server.js
