/**
 * Constants and types shared between the bulk-invite action and its UI.
 *
 * They cannot live in `actions.ts`: a `'use server'` module may only export
 * async functions, so a plain `export const` there is a build error.
 */

/**
 * Somebody imported without an address of their own.
 *
 * `Staff.email` is required and unique, so the 2025 import gave the 34 people
 * the кафедра lists left out a placeholder on `.invalid` — the domain RFC 2606
 * reserves so that nothing can ever be delivered to it. They are real people
 * with a real rating; only the address is missing, and an ADMIN puts it on
 * their page before inviting them.
 */
export const NO_EMAIL_DOMAIN = '.invalid';
export const hasNoEmail = (email: string) => email.trim().toLowerCase().endsWith(NO_EMAIL_DOMAIN);

/** Kept small enough that a batch finishes well inside any request timeout */
export const INVITE_BATCH_SIZE = 20;

export interface InviteOutcome {
  id: string;
  fullName: string;
  email: string;
  ok: boolean;
  /** Ukrainian, short, and only set when `ok` is false */
  error?: string;
}

export type InviteBatchState = { error: string } | { results: InviteOutcome[] };
