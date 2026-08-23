// Email templates (invite / password reset). Both lead to the same
// set-password screen — the wording is the only difference.
//
// WHY THIS IS WRITTEN THE WAY IT IS. An email is not a web page, and almost
// every instinct from the app is wrong here:
//
//   Tables, not divs.   Outlook on Windows renders with the Word engine, where
//                       `max-width` and `border-radius` on a div are ignored.
//                       Layout tables are the boring thing that works.
//   Inline styles only. Several clients strip <style> blocks, so anything that
//                       must survive is on the element.
//   No web font.        Geist cannot load — no client fetches one reliably —
//                       so the stack below is the honest fallback.
//   Light only.         Gmail and Apple Mail auto-invert in dark mode and do it
//                       badly to a white card: the text often survives the
//                       inversion and lands black on near-black. `color-scheme`
//                       opts out where it is respected. Real dark mode needs a
//                       <style> block that too many clients strip.
//
// The palette is the app's own, converted from the `oklch()` tokens in
// `app/globals.css` — email has no `oklch()` support worth relying on.

/** The app's tokens as hex. Names match `globals.css` so the two stay findable. */
const C = {
  /** page behind the card — a shade off white, so the card has an edge to sit on */
  page: '#fafafa',
  /** --card */
  card: '#ffffff',
  /** --border */
  border: '#d4d4d4',
  /** --foreground */
  text: '#0a0a0a',
  /** --muted-foreground */
  muted: '#737373',
  /** --primary, the button */
  primary: '#171717',
  /** --primary-foreground */
  onPrimary: '#ffffff',
} as const;

/** --radius (0.625rem) */
const RADIUS = '10px';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

interface TemplateInput {
  fullName: string;
  link: string;
  /** Ready to print — «30 днів», «2 години». See ./validity.ts */
  validFor: string;
}

interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * HTML-escape a value before it goes anywhere near the markup.
 *
 * `fullName` is typed by an administrator and read straight out of the
 * database; it used to be interpolated raw, so one stray «<» quietly broke the
 * layout of every letter that person would ever receive. The quote and the
 * ampersand matter for the `href`, which is an attribute: a link carrying a
 * query string is not valid HTML until its «&» is escaped.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The call to action.
 *
 * The background and the padding sit on the `<td>`, not on the `<a>`. Outlook
 * desktop drops padding from an inline element, which turns a button into a
 * bare line of text — putting both on the cell is the shape that survives.
 */
function button(link: string, label: string): string {
  const href = esc(link);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
        <tr>
          <td align="center" bgcolor="${C.primary}" style="background:${C.primary};border-radius:${RADIUS};">
            <a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:14px;font-weight:600;line-height:20px;color:${C.onPrimary};text-decoration:none;border-radius:${RADIUS};">${label}</a>
          </td>
        </tr>
      </table>`;
}

/** A hairline. A bordered div is unreliable in Outlook; a 1px filled cell is not. */
function divider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
        <tr><td height="1" style="height:1px;background:${C.border};font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>`;
}

/** «Або скопіюйте посилання» — monochrome, because chrome never carries a hue */
function fallbackLink(link: string): string {
  const href = esc(link);
  return `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">Або скопіюйте посилання у браузер:<br>
        <a href="${href}" style="color:${C.text};text-decoration:underline;word-break:break-all;">${href}</a></p>`;
}

/**
 * The card, the wordmark above it and the note below — the app's own shape.
 *
 * `preheader` is the grey line an inbox shows next to the subject. Left to
 * itself a client grabs the first words of the body, which here would be
 * «Вітаємо» and tells nobody anything.
 */
function layout({
  title,
  preheader,
  bodyHtml,
  footerNote,
}: {
  title: string;
  preheader: string;
  bodyHtml: string;
  footerNote: string;
}): string {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
  <div style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.page};">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;">
          <tr>
            <td style="padding:0 4px 16px;font-family:${FONT};font-size:18px;font-weight:600;line-height:24px;color:${C.text};">EduRank</td>
          </tr>
          <tr>
            <td style="background:${C.card};border:1px solid ${C.border};border-radius:${RADIUS};padding:32px;">
              <h1 style="margin:0 0 20px;font-family:${FONT};font-size:20px;font-weight:600;line-height:28px;color:${C.text};">${esc(title)}</h1>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">
              EduRank — система рейтингу науково-педагогічних працівників.<br>${esc(footerNote)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** A paragraph in the card's body — the one place body copy is styled */
function p(html: string, muted = false): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:23px;color:${muted ? C.muted : C.text};">${html}</p>`;
}

export function inviteEmail({ fullName, link, validFor }: TemplateInput): RenderedEmail {
  const subject = 'Запрошення до системи EduRank';
  const text = `Вітаємо, ${fullName}!

Для вас створено обліковий запис у системі EduRank.
Щоб активувати його, перейдіть за посиланням і встановіть пароль:

${link}

Посилання дійсне ${validFor}. Якщо ви не очікували цього листа, просто проігноруйте його.`;

  const html = layout({
    title: subject,
    preheader: 'Для вас створено обліковий запис — встановіть пароль.',
    footerNote: 'Якщо ви не очікували цього листа, просто проігноруйте його.',
    bodyHtml: `${p(`Вітаємо, <strong style="font-weight:600;">${esc(fullName)}</strong>!`)}
              ${p('Для вас створено обліковий запис у системі EduRank. Щоб активувати його, встановіть пароль за посиланням нижче.')}
              ${button(link, 'Встановити пароль')}
              ${p(`Посилання дійсне ${esc(validFor)}.`, true)}
              ${divider()}
              ${fallbackLink(link)}`,
  });

  return { subject, text, html };
}

export function passwordResetEmail({ fullName, link, validFor }: TemplateInput): RenderedEmail {
  const subject = 'Скидання пароля — EduRank';
  const text = `Вітаємо, ${fullName}!

Для вашого облікового запису в системі EduRank ініційовано скидання пароля.
Щоб встановити новий пароль, перейдіть за посиланням:

${link}

Посилання дійсне ${validFor}. Якщо ви не очікували цього листа, зверніться до адміністратора.`;

  const html = layout({
    title: 'Скидання пароля',
    preheader: 'Встановіть новий пароль за посиланням у листі.',
    // NOT «просто проігноруйте». A reset nobody asked for means somebody else
    // typed their address, and that is worth a word to the administrator.
    footerNote: 'Якщо ви не очікували цього листа, зверніться до адміністратора.',
    bodyHtml: `${p(`Вітаємо, <strong style="font-weight:600;">${esc(fullName)}</strong>!`)}
              ${p('Для вашого облікового запису ініційовано скидання пароля. Встановіть новий пароль за посиланням нижче.')}
              ${button(link, 'Встановити новий пароль')}
              ${p(`Посилання дійсне ${esc(validFor)}.`, true)}
              ${divider()}
              ${fallbackLink(link)}`,
  });

  return { subject, text, html };
}
