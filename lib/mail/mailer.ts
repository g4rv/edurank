import nodemailer from 'nodemailer';

// Provider-agnostic SMTP: dev = Mailpit (localhost:1025, no auth),
// prod = any real provider via the same env vars.
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

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
  return {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    user: process.env.SMTP_USER || null,
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
