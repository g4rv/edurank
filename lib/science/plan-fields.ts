import type { EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScoringSpec } from '@/lib/specs/scoring';

/**
 * Which of a work type's evidence fields a PLAN row needs — never its whole
 * `evidenceFields` set.
 *
 * D23 (`docs/superpowers/specs/2026-09-15-science-plan-design.md`): a plan row
 * is an intention — the work type, its variant, the quantity, and a free
 * note — nothing else. `title`, a bibliography, a colleague's ПІБ… describe
 * work that exists; in September it does not yet, which is why the owner had
 * to type `kjgjhf` into a required «Назва роботи» to get past the old form.
 * Evidence belongs to a RECORD (Stage 2), not a plan.
 *
 * Derived from the **scoring kind**, not a list of work-type codes — the same
 * reason `ActivityType.isActive` / `requiresVerification` / `entityFirstEntry`
 * are columns rather than code lists elsewhere in this codebase: a code list
 * silently excludes every work type an admin builds later. This mirrors
 * `computeValue` in `lib/specs/scoring.ts` exactly, field name for field
 * name, so a plan row always carries precisely what the engine will read out
 * of it. `pageBased` is handled too, even though `work-types-2027.ts`
 * documents that no science-plan type sets it today — the alternative is a
 * plan silently missing the field the engine needs the day that changes.
 */
export function planFields(type: {
  scoring: ScoringSpec;
  evidenceFields: readonly EvidenceField[];
}): EvidenceField[] {
  const byName = (name: string): EvidenceField[] => {
    const field = type.evidenceFields.find((f) => f.name === name);
    return field ? [field] : [];
  };
  const pageBasedFields = () => [...byName('pages'), ...byName('coAuthors')];

  switch (type.scoring.kind) {
    case 'FIXED':
      return [];
    case 'MULT':
      return type.scoring.pageBased ? pageBasedFields() : byName('value');
    case 'SELECT':
      return byName('option');
    case 'SELECT_MULT':
      return [
        ...byName('option'),
        ...(type.scoring.pageBased ? pageBasedFields() : byName('credits')),
      ];
    case 'CHECK_SUM':
      return [...byName('mode'), ...type.evidenceFields.filter((f) => f.kind === 'checkbox')];
    default:
      // A JSON column can hold a kind written by an older or newer build than
      // this one — degrade to no fields rather than throw, same as
      // `toPlanWorkType` degrading a malformed row to an empty field set.
      return [];
  }
}
