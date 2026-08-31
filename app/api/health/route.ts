import { db } from '@/lib/db';

// GET /api/health — is this container actually able to serve?
//
// For Coolify's container healthcheck and for whoever is looking at the server
// at two in the morning. NOT authenticated: the thing asking is a process, not
// a person, and it has no account. The proxy already leaves `/api` alone
// (its matcher excludes the whole prefix), so nothing else needs changing.
//
// WHY IT TOUCHES THE DATABASE. «The Node process is listening» is not the
// question worth asking — that is true of a container that cannot reach
// Postgres at all, which is exactly the failure this exists to catch. Coolify
// would call that container healthy and keep sending people to it, and they
// would meet an error on every page instead of a restart or a held rollout.
// `SELECT 1` is the cheapest statement that proves the pool works end to end.
//
// WHAT IT SAYS BACK. `ok` or `error`, and nothing else. No version, no
// migration name, no driver message: this is the one route anybody on the
// internet can call, and a database error repeated verbatim is free
// reconnaissance — host names and role names come out of Postgres errors. The
// detail goes to the log, where the operator already looks and a stranger
// cannot.
//
// Never cached. A cached healthcheck reports the state of an earlier request,
// which is worse than no healthcheck: it goes on saying `ok` for a container
// that stopped working.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok' }, { status: 200 });
  } catch (e) {
    // Deliberately console.error rather than `logError`: that helper mints an
    // id for correlating a user's report with a stack, and nobody is reporting
    // this — the reader is an operator watching stdout while a deploy fails.
    // One line, named so it can be grepped.
    console.error('[health] database unreachable:', e instanceof Error ? e.message : e);
    return Response.json({ status: 'error' }, { status: 503 });
  }
}
