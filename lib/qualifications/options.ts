/**
 * The vocabulary of a qualification record — client-safe (no Prisma, no Node),
 * so the form, the list and the schema read one definition.
 *
 * The keys match the `QualificationKind` / `QualificationDocumentType` enums in
 * `prisma/schema.prisma`; the Ukrainian is the owner's wording (2026-10-13).
 */

export const QUALIFICATION_KINDS = ['TRAINING', 'INTERNSHIP'] as const;
export type QualificationKindKey = (typeof QUALIFICATION_KINDS)[number];

export const QUALIFICATION_KIND_LABELS: Record<QualificationKindKey, string> = {
  TRAINING: 'Підвищення кваліфікації',
  INTERNSHIP: 'Стажування',
};

export const DOCUMENT_TYPES = ['REFERENCE', 'CERTIFICATE', 'DIPLOMA'] as const;
export type DocumentTypeKey = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentTypeKey, string> = {
  REFERENCE: 'Довідка',
  CERTIFICATE: 'Сертифікат',
  DIPLOMA: 'Диплом',
};

/**
 * What the topic box is called. A диплом names a спеціальність; a довідка or a
 * сертифікат names the тема of the course or internship (owner, 2026-10-13).
 * One column holds both — only the label moves.
 */
export function topicLabel(documentType: DocumentTypeKey | ''): string {
  return documentType === 'DIPLOMA' ? 'Спеціальність' : 'Тема стажування';
}

/** The tab's own title, used by the tab bar and both pages. */
export const QUALIFICATIONS_TAB_LABEL = 'Підвищення кваліфікації/Стажування';
