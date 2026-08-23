import nodemailer from 'nodemailer';

// Outside production, mail is HARDCODED to Mailpit — never read from
// `SMTP_*`. A dev `.env` copied from a teammate, or filled with real Mailjet
// credentials while testing DNS, is a live footgun otherwise: nothing in the
// old code stopped a bulk send on a laptop from going out through production
// Mailjet to real inboxes. `NODE_ENV` is Next's own signal for this — already
// used the same way in `lib/auth.ts` — and unlike an env var it cannot be
// left wrong in a `.env` file.
const isProduction = process.env.NODE_ENV === 'production';

const transport = nodemailer.createTransport(
  isProduction
    ? {
        host: process.env.SMTP_HOST ?? 'in-v3.mailjet.com',
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      }
    : { host: 'localhost', port: 1025, secure: false }
);

/**
 * Open the connection and authenticate, without sending anything.
 *
 * Exported for `pnpm mail:test`, and deliberately built on the SAME transport
 * the app sends through: a check that constructed its own would be able to pass
 * while the app still failed, which is worse than no check at all.
 */
export async function verifyTransport(): Promise<void> {
  await transport.verify();
}

/** Exactly what the app will use, so a setup check can print it back */
export function mailSettings() {
  return isProduction
    ? {
        host: process.env.SMTP_HOST ?? 'in-v3.mailjet.com',
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        user: process.env.SMTP_USER || null,
        from: process.env.SMTP_FROM ?? 'EduRank <no-reply@edurank.local>',
        appUrl: process.env.APP_URL ?? 'http://localhost:3000',
      }
    : {
        host: 'localhost',
        port: 1025,
        secure: false,
        user: null,
        from: process.env.SMTP_FROM ?? 'EduRank <no-reply@edurank.local>',
        appUrl: process.env.APP_URL ?? 'http://localhost:3000',
      };
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? 'EduRank <no-reply@edurank.local>',
    ...message,
  });
}
