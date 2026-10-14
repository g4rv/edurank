import type { Prisma } from '@/lib/generated/prisma/client';
import { formatIssuedOn } from '@/lib/qualifications/format';
import {
  CERTIFICATE_FIELDS,
  CERTIFICATE_KINDS,
  certificateNumber,
  type CertificateKind,
} from '@/lib/language-certificates/options';
import { isLanguageCertificateKeyOf } from '@/lib/science/r2';
import { safeDeleteObject, verifyUploadedObject } from '@/lib/science/file-intake';
import type { VerifiedFile } from '@/lib/science/file-intake';
import type {
  EnglishCertificateData,
  UkrainianCertificateData,
} from '@/validations/language-certificate';

/**
 * Saving the two language certificates of an НПП's «Освіта» (owner, 2026-10-14).
 *
 * **They are not Staff columns** — a `LanguageCertificate` row each — so the
 * profile saves (`updateStaff`, `updateOwnProfile`) take them OUT of the payload
 * (`takeCertificates`) before the Staff update, and this module does the rest in
 * three steps that mirror the qualifications' scan flow:
 *
 *   1. `prepareCertificates` — before the transaction: verify each staged scan
 *      from its STORED bytes (a refusal has already dropped the object);
 *   2. `applyCertificates` — inside it: write or delete the rows, and say which
 *      R2 objects the save leaves behind and what changed, for the audit entry;
 *   3. the caller deletes the leftovers AFTER the commit (`dropObjects`). A
 *      save that fails leaves the staged scan alone — the form still holds its
 *      key and the retry must find it; an abandoned one costs storage, no more.
 *
 * The caller has already decided WHO may write which certificate (the НПП their
 * own, ADMIN anybody's, an editor only with the grant) — by filtering
 * `updateData` before this runs. Nothing here looks at a session.
 */

type CertificateData = NonNullable<EnglishCertificateData> | NonNullable<UkrainianCertificateData>;

/** What a save sent for one kind: `null` clears it, an object writes it. */
export type CertificateChanges = Partial<
  Record<CertificateKind, EnglishCertificateData | UkrainianCertificateData>
>;

/**
 * Lifts the certificates out of an update payload, so the rest can go to
 * `tx.staff.update`. Only a kind that was SENT is in the result — an absent key
 * means «this form does not carry it», and what is stored stays.
 */
export function takeCertificates(updateData: Record<string, unknown>): CertificateChanges {
  const taken: CertificateChanges = {};
  for (const kind of CERTIFICATE_KINDS) {
    const field = CERTIFICATE_FIELDS[kind];
    if (field in updateData) {
      taken[kind] = (updateData[field] ?? null) as CertificateChanges[CertificateKind];
      delete updateData[field];
    }
  }
  return taken;
}

export function hasCertificateChanges(changes: CertificateChanges): boolean {
  return CERTIFICATE_KINDS.some((kind) => kind in changes);
}

/** One kind, ready to write: the values, and what to do with the scan. */
export interface PreparedCertificate {
  kind: CertificateKind;
  /** `null`: the block was emptied — the certificate goes, scan included */
  values: CertificateData | null;
  /** undefined: keep the stored scan · null: take it away · a file: replace it */
  file: VerifiedFile | null | undefined;
}

export async function prepareCertificates(input: {
  staffId: string;
  userId: string;
  changes: CertificateChanges;
  /** Log scope of the ACTION calling, so a report names the operation */
  scope: string;
}): Promise<{ ok: true; prepared: PreparedCertificate[] } | { error: string }> {
  const prepared: PreparedCertificate[] = [];
  const verifiedKeys: string[] = [];
  const dropVerified = () =>
    Promise.all(
      verifiedKeys.map((key) =>
        safeDeleteObject(input.scope, key, { userId: input.userId, entityId: input.staffId })
      )
    );

  for (const kind of CERTIFICATE_KINDS) {
    if (!(kind in input.changes)) continue;
    const values = (input.changes[kind] ?? null) as CertificateData | null;

    if (values === null) {
      prepared.push({ kind, values: null, file: undefined });
      continue;
    }

    const staged = values.file;
    if (!staged) {
      prepared.push({ kind, values, file: staged === null ? null : undefined });
      continue;
    }

    if (!isLanguageCertificateKeyOf(input.staffId, staged.objectKey)) {
      // Not ours to delete: the key names somebody else's folder, or none.
      await dropVerified();
      return { error: 'Файл не знайдено. Спробуйте завантажити ще раз' };
    }
    const verified = await verifyUploadedObject({
      objectKey: staged.objectKey,
      fileName: staged.fileName,
      scope: input.scope,
      context: { userId: input.userId, entityId: input.staffId },
      allowDuplicate: true,
    });
    if ('error' in verified) {
      await dropVerified();
      return { error: verified.error };
    }
    verifiedKeys.push(verified.file.objectKey);
    prepared.push({ kind, values, file: verified.file });
  }

  return { ok: true, prepared };
}

/** Best-effort cleanup of R2 objects — see `safeDeleteObject`. */
export function dropObjects(
  scope: string,
  keys: readonly string[],
  context: { userId: string; entityId: string }
): Promise<unknown> {
  return Promise.all(keys.map((key) => safeDeleteObject(scope, key, context)));
}

/** A stored row, as the audit and the form read it. */
interface StoredCertificate {
  series: string | null;
  number: string;
  issuedOn: Date;
  issuedBy: string | null;
  level: string | null;
  decisionNumber: string | null;
  decisionDate: Date | null;
  fileName: string | null;
  fileKey: string | null;
}

/**
 * One certificate as a line a person can read in the audit log — `diffChanges`
 * compares primitives, and «АБ № 123 · British Council · 15.03.2024» says more
 * than a JSON diff.
 */
export function certificateSummary(
  kind: CertificateKind,
  v: {
    series: string | null;
    number: string;
    issuedOn: string;
    issuedBy: string | null;
    level: string | null;
    decisionNumber: string | null;
    decisionDate: string | null;
  },
  fileName: string | null
): string {
  const parts = [certificateNumber(v.series, v.number)];
  // Both kinds carry a level (owner, 2026-10-14: the English one is B2 and up).
  if (v.level) parts.push(`рівень ${v.level}`);
  if (kind === 'ENGLISH') {
    if (v.issuedBy) parts.push(v.issuedBy);
  } else {
    if (v.decisionNumber && v.decisionDate) {
      parts.push(`рішення № ${v.decisionNumber} від ${formatIssuedOn(v.decisionDate)}`);
    }
  }
  parts.push(formatIssuedOn(v.issuedOn));
  if (fileName) parts.push(`файл: ${fileName}`);
  return parts.join(' · ');
}

function summaryOfStored(kind: CertificateKind, row: StoredCertificate): string {
  return certificateSummary(
    kind,
    {
      series: row.series,
      number: row.number,
      issuedOn: row.issuedOn.toISOString().slice(0, 10),
      issuedBy: row.issuedBy,
      level: row.level,
      decisionNumber: row.decisionNumber,
      decisionDate: row.decisionDate ? row.decisionDate.toISOString().slice(0, 10) : null,
    },
    row.fileKey ? row.fileName : null
  );
}

const toDate = (iso: string | null | undefined) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);

function fileColumns(file: VerifiedFile | null) {
  return {
    fileKey: file?.objectKey ?? null,
    fileName: file?.fileName ?? null,
    fileContentType: file?.contentType ?? null,
    fileSizeBytes: file?.sizeBytes ?? null,
    fileSha256: file?.sha256 ?? null,
  };
}

export interface AppliedCertificates {
  /** The audit entries, keyed by the field name (`englishCertificate`) */
  changes: Record<string, { from: string | null; to: string | null }>;
  /** R2 objects this save left with no row pointing at them — delete after the commit */
  orphaned: string[];
}

export async function applyCertificates(
  tx: Prisma.TransactionClient,
  staffId: string,
  prepared: readonly PreparedCertificate[]
): Promise<AppliedCertificates> {
  const result: AppliedCertificates = { changes: {}, orphaned: [] };
  if (prepared.length === 0) return result;

  const stored = await tx.languageCertificate.findMany({ where: { staffId } });

  for (const item of prepared) {
    const before = stored.find((row) => row.kind === item.kind) ?? null;
    const beforeText = before ? summaryOfStored(item.kind, before) : null;
    let afterText: string | null = null;

    if (item.values === null) {
      if (before) {
        await tx.languageCertificate.delete({ where: { id: before.id } });
        if (before.fileKey) result.orphaned.push(before.fileKey);
      }
    } else {
      const v = item.values;
      // The scan the row ends up with: kept, replaced, or taken away.
      const keptFile = item.file === undefined;
      const finalFileName = keptFile
        ? before?.fileKey
          ? before.fileName
          : null
        : (item.file?.fileName ?? null);

      const columns = {
        series: v.series,
        number: v.number as string,
        issuedOn: toDate(v.issuedOn) as Date,
        // Each kind keeps only its own fields; the other kind's are cleared, so a
        // row never carries a stale «Ким виданий» on a Ukrainian certificate. The
        // level belongs to both.
        issuedBy:
          item.kind === 'ENGLISH' ? ((v as { issuedBy?: string | null }).issuedBy ?? null) : null,
        level: (v as { level?: string | null }).level ?? null,
        decisionNumber:
          item.kind === 'UKRAINIAN'
            ? ((v as { decisionNumber?: string | null }).decisionNumber ?? null)
            : null,
        decisionDate:
          item.kind === 'UKRAINIAN'
            ? toDate((v as { decisionDate?: string | null }).decisionDate)
            : null,
      };

      await tx.languageCertificate.upsert({
        where: { staffId_kind: { staffId, kind: item.kind } },
        create: { staffId, kind: item.kind, ...columns, ...fileColumns(item.file ?? null) },
        update: { ...columns, ...(keptFile ? {} : fileColumns(item.file ?? null)) },
      });

      if (!keptFile && before?.fileKey && before.fileKey !== item.file?.objectKey) {
        result.orphaned.push(before.fileKey);
      }

      afterText = certificateSummary(
        item.kind,
        {
          series: columns.series,
          number: columns.number,
          issuedOn: v.issuedOn as string,
          issuedBy: columns.issuedBy,
          level: columns.level,
          decisionNumber: columns.decisionNumber,
          decisionDate: (v as { decisionDate?: string | null }).decisionDate ?? null,
        },
        finalFileName
      );
    }

    if (beforeText !== afterText) {
      result.changes[CERTIFICATE_FIELDS[item.kind]] = { from: beforeText, to: afterText };
    }
  }

  return result;
}
