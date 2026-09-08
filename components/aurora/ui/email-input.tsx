import { Input } from './input';

/**
 * An email address, with the rules of one attached to it.
 *
 * Follows the same convention as `TelInput`, `OrcidInput`, `IsbnInput` and
 * `DoiInput`: one kind of value, one component, so its rules live in a single
 * place instead of being retyped at each call site. That retyping is exactly
 * what went wrong here — `/login` and `/forgot-password` both spelled out
 * `type` / `autoComplete` / `placeholder` by hand, and the placeholder was
 * simply forgotten on the second one. Two fields for the same value that did
 * not look the same, for no reason anybody chose.
 *
 * **The mobile suppressions are the point of this file.** `type="email"` turns
 * off autocapitalisation in most phone keyboards, but not reliably in all of
 * them, and it does nothing about autocorrect: a keyboard is free to capitalise
 * the first letter or «fix» an unfamiliar domain as it is typed.
 * `Петренко@uhsp.edu.ua` then fails to sign in with «невірний email або
 * пароль», which says nothing about the real cause. This is the same class of
 * failure already documented on `PassInput`, and the same three
 * attributes close it.
 *
 * **Whitespace needs no handling here, and was measured rather than assumed.**
 * People reach this field by pasting out of the invitation mail, and a pasted
 * address often carries a trailing space or a newline — so this component first
 * trimmed on blur. That code was dead: `type="email"` carries a value
 * sanitisation algorithm in the HTML spec (strip newlines, then strip leading
 * and trailing whitespace), so `.value` never holds the padding to begin with.
 * Verified in a browser — `"   a@b.ua  "` reads back as `"a@b.ua"` before blur
 * ever fires. Anything that survives that is interior whitespace, which is a
 * genuinely invalid address and belongs to the Zod schema, not to the field.
 */
export function EmailInput(
  props: Omit<React.ComponentProps<'input'>, 'type' | 'size'> & { size?: 'default' | 'lg' }
) {
  return (
    <Input
      type="email"
      inputMode="email"
      autoComplete="email"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      placeholder="email@example.com"
      {...props}
    />
  );
}
