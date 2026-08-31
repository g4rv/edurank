import type { Prisma } from '@/lib/generated/prisma/client';

// Addresses are case-insensitive in practice — nobody thinks of
// `Petrenko@uhsp.edu.ua` and `petrenko@uhsp.edu.ua` as two people — but
// Postgres `=`, and therefore Prisma's `findUnique`, are case-SENSITIVE. So an
// address stored with a capital could only be signed in to by typing that
// capital, and the ordinary spelling answered «Невірний email або пароль» with
// nothing to say why (2026-08-28).
//
// It hid well: `nameSearch` uses `mode: 'insensitive'`, so an admin looking the
// person up on /staff finds them immediately and the record looks perfect.
// Worse, activation never asks for an email — it is a token link — so somebody
// could set their password without ever typing their address, and meet this
// only at their first real sign-in.
//
// The fix lives HERE and nowhere else. An address is stored exactly as it was
// typed; the folding happens when one is looked up. A `normaliseEmail` helper
// once sat beside this and was used only by the schemas that rewrote what
// people saved — removed with them (2026-08-31).

/**
 * Match an address whatever its case, for looking somebody up.
 *
 * Deliberately NOT «normalise the input and compare exactly»: that would only
 * work once every stored address is lower-case, so it would lock out exactly
 * the people this exists to rescue until a data migration had run. This works
 * against the data as it is today and as it will be afterwards, which means the
 * fix can ship on its own and the cleanup can follow whenever.
 *
 * Use it with `findMany` and `take: 2`, not `findFirst`. `Staff.email` is
 * unique, but Postgres enforces that case-sensitively, so two rows differing
 * only in case are possible — and picking one of them arbitrarily is how you
 * sign somebody into the wrong account. Two rows means «no match», loudly.
 */
export function emailMatches(email: string): Prisma.StaffWhereInput {
  return { email: { equals: email.trim(), mode: 'insensitive' } };
}
