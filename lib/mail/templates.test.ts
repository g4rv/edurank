import { describe, expect, it } from 'vitest';
import { inviteEmail, passwordResetEmail } from './templates';

const input = {
  fullName: 'Дудар Василь Леонідович',
  link: 'https://edurank.uhsp.edu.ua/activate/abc123',
  validFor: '30 днів',
};

describe('inviteEmail', () => {
  it('carries the subject the invite list promises', () => {
    expect(inviteEmail(input).subject).toBe('Запрошення до системи EduRank');
  });

  it('puts the link in both the HTML and the plain text', () => {
    const { html, text } = inviteEmail(input);
    expect(html).toContain(input.link);
    expect(text).toContain(input.link);
  });

  it('names the person and how long they have', () => {
    const { html, text } = inviteEmail(input);
    expect(html).toContain('Дудар Василь Леонідович');
    expect(html).toContain('30 днів');
    expect(text).toContain('30 днів');
  });
});

describe('passwordResetEmail', () => {
  it('is a different subject, so the two are not confused in an inbox', () => {
    expect(passwordResetEmail(input).subject).toBe('Скидання пароля — EduRank');
    expect(passwordResetEmail(input).subject).not.toBe(inviteEmail(input).subject);
  });

  // A reset nobody asked for is the one that matters: it means somebody else
  // typed their address, and «ignore it» is the wrong advice.
  it('tells an unexpecting reader to contact the administrator', () => {
    const { html, text } = passwordResetEmail(input);
    expect(html).toContain('зверніться до адміністратора');
    expect(text).toContain('зверніться до адміністратора');
  });
});

// `fullName` is typed by an admin and read straight out of the database. It
// used to be interpolated into the HTML raw, so a stray «<» silently broke the
// layout of every letter that person ever received.
describe('escaping', () => {
  it('never lets a name inject markup', () => {
    const { html } = inviteEmail({ ...input, fullName: '<script>alert(1)</script>Іван' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Іван');
  });

  it('escapes the ampersands a query string brings with it', () => {
    const link = 'https://edurank.uhsp.edu.ua/activate/x?a=1&b=2';
    const { html, text } = inviteEmail({ ...input, link });
    // The href must be valid HTML…
    expect(html).toContain('a=1&amp;b=2');
    expect(html).not.toContain('a=1&b=2');
    // …while the plain-text copy stays literally clickable.
    expect(text).toContain(link);
  });

  it('escapes a quote so it cannot break out of the href attribute', () => {
    const { html } = inviteEmail({ ...input, link: 'https://x.test/a"onmouseover="evil()' });
    expect(html).not.toContain('"onmouseover="');
    expect(html).toContain('&quot;');
  });
});

describe('rendering for real mail clients', () => {
  it('is a complete document, declared light so nothing auto-inverts it', () => {
    const { html } = inviteEmail(input);
    expect(html).toContain('<!DOCTYPE');
    expect(html).toContain('lang="uk"');
    expect(html).toContain('name="color-scheme"');
  });

  // Divs with max-width and border-radius are unreliable in Outlook's Word
  // rendering engine; the layout is tables for exactly that reason.
  it('lays the card out with tables, not divs', () => {
    const { html } = inviteEmail(input);
    expect(html).toContain('<table');
    expect(html).toContain('role="presentation"');
  });

  it('uses the app’s own card and button colours', () => {
    const { html } = inviteEmail(input);
    expect(html).toContain('#171717'); // --primary, the button
    expect(html).toContain('#d4d4d4'); // --border, the card edge
    expect(html).toContain('#737373'); // --muted-foreground
    expect(html).not.toContain('#2563eb'); // the old off-brand blue link
  });
});
