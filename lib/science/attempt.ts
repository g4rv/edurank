/**
 * Runs a server action from a dialog and never lets a failed request escape.
 *
 * **Why this exists.** Every science dialog saves inside
 * `startTransition(async () => { const result = await someAction(…) … })`. A
 * server action reports refusals by RETURNING `{ error }` — but when the
 * request itself fails (a phone losing signal, a proxy timing out, the server
 * throwing) the promise REJECTS, and a rejection inside a transition is
 * re-thrown into the page's error boundary. The boundary replaces the whole
 * page: the dialog vanishes with everything typed into it and the person is
 * left with «Щось пішло не так» and a Повторити button. For somebody entering a
 * work from a phone that happened again and again, and reads as «the window
 * closes before I can save» (reported 2026-09-30).
 *
 * Caught here instead, the failure becomes the same `{ error }` a refusal is, so
 * the dialog stays open, keeps the form and says what happened, right beside
 * the button to try again.
 */
export const CONNECTION_PROBLEM =
  'Збій зв’язку або помилка на сервері. Введені дані залишилися у формі — перевірте інтернет і натисніть кнопку ще раз';

export async function attempt<T extends object>(
  run: () => Promise<T>
): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (e) {
    // The browser console is the only place a client failure can be seen — the
    // server never heard about it, which is the usual reason it happened.
    console.error('science: server action failed', e);
    return { error: CONNECTION_PROBLEM };
  }
}
