import 'dotenv/config';
import { mailSettings, sendMail, verifyTransport } from '../lib/mail/mailer';

// «Чи працює пошта?» — answered without writing to a real colleague.
//
// Before this, the only way to find out whether SMTP was configured correctly
// was to press «надіслати запрошення» on a real person and watch. If it failed,
// the app said «Не вдалося надіслати лист. Перевірте налаштування пошти» and
// the reason lived only in the container log.
//
//   pnpm mail:test you@example.com
//
// Two steps, reported separately, because they fail for different reasons:
// connecting and authenticating is about the KEYS, delivering is about the
// FROM address the provider has verified.

const RECIPIENT = process.argv[2];

/**
 * Turns a provider's error into the thing to actually go and change.
 *
 * Matched on the code AND the message, because nodemailer normalises some of
 * them and not others: a wrong host arrives as `EDNS` carrying «ENOTFOUND» in
 * its text, never as `ENOTFOUND` itself. Keying on the code alone printed the
 * raw error for the single most likely typo of the lot.
 */
function explain(error: unknown): string[] {
  const e = error as { code?: string; responseCode?: number; message?: string };
  const message = e?.message ?? String(error);
  const status = e?.responseCode ?? 0;
  const haystack = `${e?.code ?? ''} ${message}`;
  const has = (...needles: string[]) => needles.some((n) => haystack.includes(n));
  const settings = mailSettings();

  if (has('EAUTH') || status === 535 || /authenticat/i.test(message)) {
    return [
      'The provider refused the credentials.',
      '  · SMTP_USER must be the Mailjet API KEY, not your account email',
      '  · SMTP_PASS must be the Mailjet SECRET KEY',
      '  · Both are at https://app.mailjet.com/account/apikeys',
    ];
  }
  if (has('EDNS', 'ENOTFOUND', 'EAI_AGAIN')) {
    return [`No such host: ${settings.host}`, '  · Mailjet is in-v3.mailjet.com'];
  }
  if (has('ETIMEDOUT', 'ECONNREFUSED', 'ESOCKET', 'ECONNRESET')) {
    return [
      `Could not reach ${settings.host}:${settings.port}`,
      '  · Mailjet takes 587 (STARTTLS) or 465 (SSL)',
      '  · Some networks block outbound 587 — try 465',
      '  · Port 1025 with no auth is Mailpit, the local catcher, not a real provider',
    ];
  }
  if (
    status === 550 ||
    status === 553 ||
    /sender|from address|not allowed|unauthenticated/i.test(message)
  ) {
    return [
      `The provider would not send AS ${settings.from}`,
      '  · That exact address, or its domain, must be authenticated in Mailjet',
      '  · https://app.mailjet.com/account/sender',
      '  · A verified domain covers every address on it; a verified address covers only itself',
    ];
  }
  if (/self.signed|certificate|wrong version number/i.test(message)) {
    return [
      'TLS refused the connection.',
      '  · SMTP_PORT 465 is implicit TLS, 587 is STARTTLS — swapping them looks like this',
    ];
  }
  return [message];
}

async function main() {
  const s = mailSettings();

  console.log('\nWhat the app will use');
  console.log(`  host      ${s.host}:${s.port}${s.secure ? ' (implicit TLS)' : ' (STARTTLS)'}`);
  console.log(`  auth      ${s.user ? `yes, as ${s.user.slice(0, 6)}…` : 'NONE — anonymous'}`);
  console.log(`  from      ${s.from}`);
  console.log(`  links use ${s.appUrl}`);

  if (s.host === 'localhost' && s.port === 1025) {
    console.log('\n  → This is Mailpit, the local catcher. Nothing leaves your machine.');
    console.log('    Read what it caught at http://localhost:8025');
  }
  if (!s.user && s.host !== 'localhost') {
    console.log('\n  ! SMTP_USER is empty against a real host — that will be refused.');
  }

  console.log('\n1. Connect and authenticate');
  try {
    await verifyTransport();
    console.log('   ok');
  } catch (error) {
    console.log('   FAILED');
    for (const line of explain(error)) console.log(`   ${line}`);
    process.exitCode = 1;
    return;
  }

  if (!RECIPIENT) {
    console.log('\n2. Send a letter — skipped, no recipient given');
    console.log('   pnpm mail:test you@example.com');
    console.log('\nThe credentials work. Nothing was sent.');
    return;
  }

  console.log(`\n2. Send a letter to ${RECIPIENT}`);
  try {
    await sendMail({
      to: RECIPIENT,
      subject: 'EduRank — перевірка пошти',
      text:
        'Це тестовий лист із EduRank.\n\n' +
        'Якщо ви його бачите, надсилання листів налаштовано правильно: ' +
        'запрошення та скидання паролю працюватимуть.\n',
      html:
        '<p>Це тестовий лист із <strong>EduRank</strong>.</p>' +
        '<p>Якщо ви його бачите, надсилання листів налаштовано правильно: ' +
        'запрошення та скидання паролю працюватимуть.</p>',
    });
    console.log('   accepted by the provider');
  } catch (error) {
    console.log('   FAILED');
    for (const line of explain(error)) console.log(`   ${line}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nDone. «Accepted» means the provider took it, not that it landed —');
  console.log("check the inbox, and the spam folder, and Mailjet's own event log.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
