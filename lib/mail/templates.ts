// Email templates (invite / password reset). Both lead to the same
// set-password screen — the wording is the only difference.

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

function layout(title: string, bodyHtml: string): string {
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="font-size:18px;margin:0 0 16px">${title}</h2>
  ${bodyHtml}
  <p style="font-size:12px;color:#888;margin-top:32px">EduRank — система рейтингу науково-педагогічних працівників.<br>Якщо ви не очікували цього листа, просто проігноруйте його.</p>
</div>`;
}

function linkButton(link: string): string {
  return `<p style="margin:24px 0"><a href="${link}" style="background:#171717;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Встановити пароль</a></p>
  <p style="font-size:13px;color:#555">Або скопіюйте посилання у браузер:<br><a href="${link}" style="color:#2563eb;word-break:break-all">${link}</a></p>`;
}

export function inviteEmail({ fullName, link, validFor }: TemplateInput): RenderedEmail {
  const subject = 'Запрошення до системи EduRank';
  const text = `Вітаємо, ${fullName}!

Для вас створено обліковий запис у системі EduRank.
Щоб активувати його, перейдіть за посиланням і встановіть пароль:

${link}

Посилання дійсне ${validFor}. Якщо ви не очікували цього листа, просто проігноруйте його.`;
  const html = layout(
    'Запрошення до системи EduRank',
    `<p>Вітаємо, <strong>${fullName}</strong>!</p>
     <p>Для вас створено обліковий запис у системі EduRank. Щоб активувати його, встановіть пароль за посиланням нижче.</p>
     ${linkButton(link)}
     <p style="font-size:13px;color:#555">Посилання дійсне ${validFor}.</p>`
  );
  return { subject, text, html };
}

export function passwordResetEmail({ fullName, link, validFor }: TemplateInput): RenderedEmail {
  const subject = 'Скидання пароля — EduRank';
  const text = `Вітаємо, ${fullName}!

Для вашого облікового запису в системі EduRank ініційовано скидання пароля.
Щоб встановити новий пароль, перейдіть за посиланням:

${link}

Посилання дійсне ${validFor}. Якщо ви не очікували цього листа, зверніться до адміністратора.`;
  const html = layout(
    'Скидання пароля',
    `<p>Вітаємо, <strong>${fullName}</strong>!</p>
     <p>Для вашого облікового запису ініційовано скидання пароля. Встановіть новий пароль за посиланням нижче.</p>
     ${linkButton(link)}
     <p style="font-size:13px;color:#555">Посилання дійсне ${validFor}. Якщо ви не очікували цього листа, зверніться до адміністратора.</p>`
  );
  return { subject, text, html };
}
