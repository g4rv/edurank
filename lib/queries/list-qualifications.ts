import { db } from '@/lib/db';
import type { DocumentTypeKey, QualificationKindKey } from '@/lib/qualifications/options';

/** One record, as the list and the edit dialog read it. */
export interface QualificationRow {
  id: string;
  kind: QualificationKindKey;
  institution: string;
  documentType: DocumentTypeKey;
  series: string | null;
  number: string | null;
  url: string | null;
  topic: string;
  /** `YYYY-MM-DD` — a calendar date, read in UTC like every stored date. */
  issuedOn: string;
  /** Hundredths — see the `Qualification` model. */
  creditsHundredths: number;
  /** The scan, if one was attached. The key itself never leaves the server. */
  file: { name: string; sizeBytes: number } | null;
}

/**
 * Every record of one person, newest document first. **No permission check
 * here** — like every `lib/queries` function it trusts its caller, and each page
 * asks `qualificationAccessFor` before calling it.
 */
export async function listQualifications(staffId: string): Promise<QualificationRow[]> {
  const rows = await db.qualification.findMany({
    where: { staffId },
    orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }],
  });

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    institution: r.institution,
    documentType: r.documentType,
    series: r.series,
    number: r.number,
    url: r.url,
    topic: r.topic,
    issuedOn: r.issuedOn.toISOString().slice(0, 10),
    creditsHundredths: r.creditsHundredths,
    file: r.fileKey ? { name: r.fileName ?? 'файл', sizeBytes: r.fileSizeBytes ?? 0 } : null,
  }));
}
