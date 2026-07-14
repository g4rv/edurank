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
