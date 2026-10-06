/** One row of lib/aspirants/aspirants.json — see scripts/build-aspirants.ts */
export interface SourceAspirant {
  lastName: string;
  firstName: string;
  middleName: string;
  speciality: string;
  departmentText: string;
  admissionYear: number | null;
  studyForm: string;
  /** The «Науковий керівник» cell as printed — `parseSupervisors` reads it */
  supervisorsRaw: string;
}

/** What identifies an аспірант across lists, with the спеціальність */
export function aspirantKey(a: {
  lastName: string;
  firstName: string;
  middleName: string;
}): string {
  return [a.lastName, a.firstName, a.middleName]
    .join(' ')
    .toLowerCase()
    .replace(/[’ʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
