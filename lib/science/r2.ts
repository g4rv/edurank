import { randomUUID } from 'crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Evidence for наукова робота records: a scanned certificate, an offprint, a
 * conference programme. Uploading is a browser-direct presigned PUT straight
 * to R2, and reading is a short-lived signed GET issued only to somebody
 * entitled to see that record — see the R2_* block in `.env.example`. This is
 * the ONLY file that knows R2 exists; every caller goes through the six
 * functions below.
 */

/** Both PUT and GET links expire in 5 minutes — long enough for a browser
 *  upload or a page render to use them, short enough that a leaked link (a
 *  forwarded email, a browser history entry) is not a standing hole. */
const PRESIGN_EXPIRY_SECONDS = 300;

/**
 * R2 credentials are OPTIONAL AT BOOT — a developer with no R2 access must
 * still be able to run the rest of the app. Every function that actually
 * talks to R2 calls this itself, at the moment it needs the value, so
 * importing this module never throws.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Відсутня змінна середовища ${name} — R2 не налаштовано.`);
  }
  return value;
}

/**
 * **A bucket created with the EU jurisdiction does NOT answer at
 * `<account>.r2.cloudflarestorage.com`** — it answers at
 * `<account>.eu.r2.cloudflarestorage.com`, and the default address reports
 * «NoSuchBucket» with credentials that are perfectly valid. That cost an hour
 * on 2026-09-15. `R2_JURISDICTION` is the segment; empty for a plain bucket.
 */
function endpoint(): string {
  const jurisdiction = process.env.R2_JURISDICTION?.trim();
  const part = jurisdiction ? `${jurisdiction}.` : '';
  return `https://${requireEnv('R2_ACCOUNT_ID')}.${part}r2.cloudflarestorage.com`;
}

let client: S3Client | null = null;

/** Built lazily, once, on first real use — never at import time. */
function s3(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: 'auto',
    endpoint: endpoint(),
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
  return client;
}

function bucket(): string {
  return requireEnv('R2_BUCKET');
}

/** `evidence/<templateId>/<cuid>.<ext>` — keyed by the навчальний рік and
 *  nothing else. EVERY segment is server-generated; nothing the user typed
 *  reaches the key. `evidence/` is the top-level folder already made in both
 *  R2 buckets, alongside `avatars/`.
 *
 *  **It deliberately does NOT name the work.** It used to, and that was what
 *  forced the upload to happen AFTER the record was saved — there was no
 *  workId to build a key from before it existed. That order cost two things:
 *  a record proved only by a file was impossible (D27's whole reason for
 *  shipping files in this stage), and a failed upload left a saved record
 *  with no evidence and no way back. The file's OWNER is still the work —
 *  `ScienceRecordFile.workId` says so, and that is what the app reads. A key
 *  is an address, not a relationship.
 *
 *  Needs no R2 credentials at all — pure string building — so it works even
 *  when nothing else in this file does. */
export function objectKeyFor(input: { templateId: string; ext: string }): string {
  const random = randomUUID();
  return `evidence/${input.templateId}/${random}.${input.ext}`;
}

/** A presigned PUT for the browser to upload directly — the app never sees
 *  the file body, only this URL. Expires in 5 minutes. */
export async function presignPut(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType });
  return getSignedUrl(s3(), command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
}

/** A presigned GET for a page to render a link from — same 5-minute expiry,
 *  issued only after the caller has already checked the viewer may see the
 *  record this key belongs to. */
export async function presignGet(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(s3(), command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
}

/** `null` when the object does not exist — never throws for that case, so a
 *  caller can treat a missing upload as "not there yet" rather than a defect. */
export async function headObject(
  key: string
): Promise<{ sizeBytes: number; contentType: string } | null> {
  try {
    const result = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return {
      sizeBytes: result.ContentLength ?? 0,
      contentType: result.ContentType ?? 'application/octet-stream',
    };
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

/** Collects the whole object into memory — evidence files are certificates
 *  and offprints, not video, so this is fine for what the app hands it. */
export async function getObjectBytes(key: string): Promise<Buffer> {
  const result = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!result.Body) throw new Error(`Порожній об'єкт у R2: ${key}`);
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
