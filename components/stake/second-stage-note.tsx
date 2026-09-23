/**
 * What a confirmed здобувач is actually worth, and when.
 *
 * **The sentence this app is most likely to be sued over, in spirit.**
 * Recruitment is settled in a SECOND phase, months after the main розподіл: the
 * проректор raises the кафедра's pool and the завідувач hands out the increase
 * by hand. So a confirmed здобувач is an argument, not an amount owed —
 * somebody with no room may get nothing, and that is a conversation rather than
 * a calculation. The page said «виплачується понад виділені кафедрі ставки»
 * until 2026-08-17, which promised money the grid never paid.
 *
 * ## Why it is a component
 *
 * It is rendered twice — by `MyClaims` on the page and by the students
 * `loading.tsx` — and it was the same four lines copied into both
 * (owner, 2026-09-11). That is the drift §11 of `docs/aurora.md` exists to
 * stop, and this file is the third instance of it found on one screen in one
 * afternoon: `FigureShell` had already diverged from `Figure` by 4px, and the
 * form shell had lost a `<form>` element worth 8px. A paragraph cannot drift in
 * height, but it can drift in WORDING, which on this particular sentence is
 * worse: two copies of a promise about money is one copy that can quietly stop
 * matching what the university actually does.
 *
 * ## Why it lives here and not beside the route
 *
 * Its two callers are `components/stake/my-claims.tsx` and the route's
 * `loading.tsx`. Putting it in the route folder would mean `components/`
 * importing from `app/` — a component reaching up into a route, which is
 * backwards and would be the only such import in the project. `StudentsHeader`
 * sits here for exactly this reason and was extracted for exactly this cause,
 * so the two shared pieces of this screen live together.
 */
export function SecondStageNote() {
  return (
    <p className="text-sm text-foreground">
      Спершу адміністратор підтверджує здобувача. Підтверджені здобувачі враховуються на
      <strong className="font-medium"> 2 етапі розподілу ставок</strong>, рішення про надбавку
      ухвалює завідувач разом з адміністрацією.
    </p>
  );
}
