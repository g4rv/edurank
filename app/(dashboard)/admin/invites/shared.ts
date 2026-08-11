/**
 * Constants and types shared between the bulk-invite action and its UI.
 *
 * They cannot live in `actions.ts`: a `'use server'` module may only export
 * async functions, so a plain `export const` there is a build error.
 */

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
