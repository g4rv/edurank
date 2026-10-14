'use server';

import { db } from '@/lib/db';
import { logError } from '@/lib/log';
import { authoriseCertificateWrite } from '@/lib/language-certificates/access';
import { CERTIFICATE_KINDS, type CertificateKind } from '@/lib/language-certificates/options';
import { authoriseQualifications } from '@/lib/qualifications/guard';
import { fileProblem } from '@/lib/science/file-checks';
import { safeDeleteObject } from '@/lib/science/file-intake';
import {
  isLanguageCertificateKeyOf,
  languageCertificateKeyFor,
  presignGet,
  presignPut,
} from '@/lib/science/r2';

// The scan of an НПП's English or Ukrainian language certificate (owner,
// 2026-10-14). The same flow as the qualification scans
// (`app/(dashboard)/qualifications/file-actions.ts`): the browser PUTs straight to
// R2 and the app never sees the bytes; the profile save later carries the key
// and verifies it from the stored bytes (`lib/staff/language-certificates.ts`).

const EXTENSION_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const isKind = (value: unknown): value is CertificateKind =>
  (CERTIFICATE_KINDS as readonly unknown[]).includes(value);

/**
 * A presigned PUT. The caller must be allowed to WRITE this certificate, so a
 * person can only mint keys in their own folder, ADMIN in anybody's, and an
 * editor only where their division holds the grant.
 */
export async function presignCertificateUpload(input: {
  staffId: string;
  kind: CertificateKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ ok: true; url: string; objectKey: string } | { error: string }> {
  if (!isKind(input.kind)) return { error: 'Недостатньо прав' };
  const allowed = await authoriseCertificateWrite(input.staffId, input.kind);
  if ('error' in allowed) return { error: allowed.error };

  const typeFault = fileProblem({ declaredType: input.contentType, sizeBytes: input.sizeBytes });
  if (typeFault) return { error: typeFault };

  const objectKey = languageCertificateKeyFor({
    staffId: input.staffId,
    ext: EXTENSION_BY_TYPE[input.contentType] ?? 'bin',
  });

  try {
    const url = await presignPut(objectKey, input.contentType);
    return { ok: true, url, objectKey };
  } catch (e) {
    // Every R2 misconfiguration lands here; none of it is the person's doing.
    logError('languageCertificates.presignUpload', e, { userId: allowed.userId });
    return { error: 'Не вдалося підготувати завантаження файлу' };
  }
}

/**
 * Throw away an upload nobody ended up pointing at. Fire-and-forget from the
 * browser; it never touches an object a certificate holds, and never one outside
 * a folder the caller may write.
 */
export async function discardCertificateUpload(
  staffId: string,
  kind: CertificateKind,
  objectKey: string
): Promise<{ ok: true }> {
  if (!isKind(kind)) return { ok: true };
  const allowed = await authoriseCertificateWrite(staffId, kind);
  if ('error' in allowed) return { ok: true };
  if (!isLanguageCertificateKeyOf(staffId, objectKey)) return { ok: true };

  const held = await db.languageCertificate.findUnique({
    where: { fileKey: objectKey },
    select: { id: true },
  });
  if (!held) {
    await safeDeleteObject('languageCertificates.discardUpload', objectKey, {
      userId: allowed.userId,
    });
  }
  return { ok: true };
}

/**
 * A short-lived signed GET (5 minutes) — no object is ever public. Whoever may
 * READ a person's records may open the scan: the НПП, ADMIN, and a division with
 * «Перегляд підвищення кваліфікації» (owner, 2026-10-14) — the rule
 * `authoriseQualifications` already holds, so the two kinds of scan answer to one
 * definition.
 */
export async function languageCertificateFileUrl(
  staffId: string,
  kind: CertificateKind
): Promise<{ ok: true; url: string } | { error: string }> {
  if (!isKind(kind)) return { error: 'Сертифікат не знайдено' };
  const authorised = await authoriseQualifications(staffId, 'read');
  if ('error' in authorised) return { error: 'У вас немає доступу до цього файлу' };

  const row = await db.languageCertificate.findUnique({
    where: { staffId_kind: { staffId, kind } },
    select: { fileKey: true },
  });
  if (!row) return { error: 'Сертифікат не знайдено' };
  if (!row.fileKey) return { error: 'До цього сертифіката файл не додано' };

  try {
    return { ok: true, url: await presignGet(row.fileKey) };
  } catch (e) {
    logError('languageCertificates.fileUrl', e, { userId: authorised.caller.userId });
    return { error: 'Не вдалося отримати посилання на файл' };
  }
}
