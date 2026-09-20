import 'dotenv/config';
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
  type CORSRule,
} from '@aws-sdk/client-s3';

/**
 * Put the CORS rule on the R2 bucket — the one piece of R2 setup that lives in
 * neither an env var nor the database, and without which **every evidence
 * upload fails**.
 *
 * The browser PUTs straight to R2 (Next caps a server action's body at 1 MB,
 * and a scanned certificate has no business travelling through the VPS), so
 * the bucket has to allow the app's origin. With no rule the preflight is
 * refused for want of an `Access-Control-Allow-Origin` header, the PUT never
 * starts, and the app can only say «Не вдалося завантажити файл» — while the
 * presigned URL is perfectly valid, which is exactly what makes it hard to
 * diagnose. Measured on dev 2026-09-20: every upload failed this way.
 *
 * Reports by default; writes only with `--apply`, the same contract every
 * one-off in `prisma/` follows.
 *
 *   pnpm r2:cors                              # show what the bucket has now
 *   pnpm r2:cors --apply                      # write the rule for APP_URL
 *   pnpm r2:cors --apply --origin https://x   # …or for an origin you name
 *
 * Safe to re-run: `PutBucketCors` replaces the whole policy with what is
 * printed here, so the result never depends on what was there before.
 */

const ALLOWED_METHODS = ['PUT', 'GET', 'HEAD'];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Відсутня змінна середовища ${name}`);
  return value;
}

/** The same host rule `lib/science/r2.ts` applies — an EU bucket does not
 *  answer at the plain address, and reports «NoSuchBucket» with valid keys. */
function endpoint(): string {
  const jurisdiction = process.env.R2_JURISDICTION?.trim();
  return `https://${requireEnv('R2_ACCOUNT_ID')}.${jurisdiction ? `${jurisdiction}.` : ''}r2.cloudflarestorage.com`;
}

function originsFromArgs(): string[] {
  const flag = process.argv.indexOf('--origin');
  if (flag !== -1 && process.argv[flag + 1]) return [process.argv[flag + 1]];

  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) return [new URL(appUrl).origin];

  // A dev machine with no APP_URL set is the common case, and localhost is
  // where it is running.
  return ['http://localhost:3000'];
}

async function main() {
  const apply = process.argv.includes('--apply');
  const bucket = requireEnv('R2_BUCKET');
  const origins = originsFromArgs();

  const s3 = new S3Client({
    region: 'auto',
    endpoint: endpoint(),
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });

  console.log(`Бакет: ${bucket}`);
  console.log(`Адреса: ${endpoint()}`);

  try {
    const current = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
    console.log('Поточні правила CORS:');
    console.dir(current.CORSRules, { depth: 5 });
  } catch (e) {
    // R2 answers NoSuchCORSConfiguration when none was ever set — which is the
    // broken state this script exists to fix, not an error.
    const name = (e as { name?: string }).name ?? 'unknown';
    console.log(`Поточні правила CORS: немає (${name})`);
  }

  const rule: CORSRule = {
    AllowedOrigins: origins,
    AllowedMethods: ALLOWED_METHODS,
    // The presigned PUT signs `Content-Type`, so the browser must be allowed
    // to send it.
    AllowedHeaders: ['content-type'],
    ExposeHeaders: ['etag'],
    MaxAgeSeconds: 3600,
  };

  if (!apply) {
    console.log('\nБуде записано (додайте --apply, щоб застосувати):');
    console.dir([rule], { depth: 5 });
    return;
  }

  await s3.send(
    new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: [rule] } })
  );
  console.log(`\nЗаписано. Дозволені джерела: ${origins.join(', ')}`);
}

main().catch((e) => {
  const name = (e as { name?: string }).name ?? '';
  const message = e instanceof Error ? e.message : String(e);

  // The commonest failure by far, and «Access Denied» on its own sends people
  // looking at the wrong thing. An R2 token scoped to «Object Read & Write»
  // can upload and download all day and still not read or write the BUCKET's
  // own settings, which is what a CORS policy is.
  if (name === 'AccessDenied' || message.includes('Access Denied')) {
    console.error(
      [
        'Access Denied — токен R2 не має прав на налаштування бакета.',
        '',
        'Токен «Object Read & Write» вміє завантажувати файли, але не змінювати',
        'налаштування бакета. Є два шляхи:',
        '',
        '  1. Cloudflare → R2 → бакет → Settings → CORS policy — вставити правило,',
        '     яке друкує ця команда без --apply (воно ж у docs/deployment.md §3a);',
        '  2. або створити токен з правами «Admin Read & Write» і запустити знову.',
      ].join('\n')
    );
    process.exit(1);
  }

  console.error(message);
  process.exit(1);
});
