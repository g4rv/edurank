import { z } from 'zod';

export const divisionSchema = z.object({
  name: z.string().trim().min(1, { error: "Обов'язкове поле" }),
  // Grants this division's editors rating moderation. ADMIN-only to set, like
  // everything else about a division — see lib/rating/moderation.ts.
  canModerateRating: z.boolean().default(false),
  // «Перевірка науки» (D43) — grants this division's editors наукова робота
  // oversight. ADMIN-only to set, like everything else about a division.
  canOverseeScience: z.boolean().default(false),
  // «Перегляд підвищення кваліфікації» — read-only access to every НПП's
  // qualification records. ADMIN-only to set.
  canViewQualifications: z.boolean().default(false),
  // Account actions shared with this division's editors (ADMIN-only to set).
  canInviteStaff: z.boolean().default(false),
  canSetPasswords: z.boolean().default(false),
  canEndSessions: z.boolean().default(false),
});

export type DivisionSchema = z.infer<typeof divisionSchema>;

export const divisionSettingsSchema = z.object({
  name: z.string().trim().min(1, { error: "Обов'язкове поле" }),
  canModerateRating: z.boolean(),
  canOverseeScience: z.boolean(),
  canViewQualifications: z.boolean(),
  canInviteStaff: z.boolean(),
  canSetPasswords: z.boolean(),
  canEndSessions: z.boolean(),
  /** «STAFF:CREATE» … */
  entityPermissions: z.array(
    z.string().regex(/^(STAFF|DEPARTMENT|FACULTY):(CREATE|UPDATE|DELETE)$/)
  ),
  fieldPermissions: z.array(z.string()),
});

export type DivisionSettingsSchema = z.infer<typeof divisionSettingsSchema>;
