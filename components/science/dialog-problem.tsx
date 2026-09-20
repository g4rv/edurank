import { TriangleAlert } from 'lucide-react';

/**
 * A form-wide refusal, shown in the dialog's FOOTER rather than at the bottom
 * of its body.
 *
 * **Why it is not just a `<p>` under the last field.** `DialogBody` scrolls
 * and `DialogFooter` does not. An evidence form is eight fields tall, so the
 * message sat below the fold: pressing «Додати» on a record with no evidence
 * showed «Додайте посилання або файл підтвердження» to nobody, and on screen
 * the button simply did nothing. People press a dead button again, not
 * scroll.
 *
 * It lives beside the submit for the same reason the submit is pinned: that is
 * where the eye already is when the answer arrives.
 *
 * This is for what the FORM as a whole refused — a server sentence, a pool
 * that is short, a cap. A problem one field can state stays under that field
 * (`FormField`'s own error), per the project's UI feedback rules.
 */
export function DialogProblem({ children }: { children: React.ReactNode }) {
  if (!children) return null;

  return (
    <p
      // Announced when it appears, so the refusal reaches somebody who submitted
      // with the keyboard and is not looking at the footer.
      role="alert"
      className="flex min-w-0 items-start gap-1.5 text-sm text-error-strong sm:mr-auto sm:self-center"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
