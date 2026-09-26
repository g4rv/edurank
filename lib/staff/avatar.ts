/**
 * The profile photo — the rules that both the browser and the server apply.
 *
 * Pure on purpose (no `node:` imports), so the file picker can refuse a wrong
 * file before it spends an upload and the server can say the same sentence again:
 * a browser's word is not evidence, the stored bytes are (`saveAvatar`).
 *
 * **JPEG and PNG only.** They are the two picture types `sniffType` already
 * recognises from their first bytes, and a photo needs nothing else. A PDF is an
 * allowed evidence file and must never become somebody's face.
 */

export const AVATAR_TYPES = ['image/jpeg', 'image/png'] as const;

/** A photo, not a scan: 2 MB is far more than a 512px portrait weighs. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/**
 * What a person may PICK. Far more than the 2 MB the server accepts, because the
 * picture is cropped to 512×512 in the browser before it goes anywhere: a phone
 * photo is 3–6 MB and refusing it for that would refuse nearly every photo there
 * is. What is UPLOADED is the small crop, and the server holds that to
 * `AVATAR_MAX_BYTES`.
 */
export const AVATAR_PICK_MAX_BYTES = 15 * 1024 * 1024;

/** The `accept` attribute for the picker — a hint to the dialog, never a guarantee. */
export const ACCEPT_AVATAR_TYPES = AVATAR_TYPES.join(',');

export const AVATAR_EXTENSION: Record<(typeof AVATAR_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** A Ukrainian sentence, or null when the file passes. */
export function avatarProblem(input: { declaredType: string; sizeBytes: number }): string | null {
  const allowed: readonly string[] = AVATAR_TYPES;
  if (!allowed.includes(input.declaredType)) return 'Підтримуються лише фото JPG і PNG';
  if (input.sizeBytes === 0) return 'Файл порожній';
  if (input.sizeBytes > AVATAR_MAX_BYTES) {
    return `Фото завелике — не більше ${AVATAR_MAX_BYTES / 1024 / 1024} МБ`;
  }
  return null;
}

/** The picker's check on the file BEFORE it is cropped — see `AVATAR_PICK_MAX_BYTES`. */
export function avatarPickProblem(input: {
  declaredType: string;
  sizeBytes: number;
}): string | null {
  const allowed: readonly string[] = AVATAR_TYPES;
  if (!allowed.includes(input.declaredType)) return 'Підтримуються лише фото JPG і PNG';
  if (input.sizeBytes === 0) return 'Файл порожній';
  if (input.sizeBytes > AVATAR_PICK_MAX_BYTES) {
    return `Фото завелике — не більше ${AVATAR_PICK_MAX_BYTES / 1024 / 1024} МБ`;
  }
  return null;
}

/**
 * `avatars/<staffId>/<uuid>.<ext>`. Every segment is server-generated: the staff
 * id comes from the session and nothing the person typed reaches the key. The
 * folder is per person so «this key is yours» is a prefix check.
 */
export function avatarKeyFor(staffId: string, ext: string): string {
  return `avatars/${staffId}/${globalThis.crypto.randomUUID()}.${ext}`;
}

export function isAvatarKeyOf(staffId: string, key: string): boolean {
  return (
    key.startsWith(`avatars/${staffId}/`) && !key.slice(`avatars/${staffId}/`.length).includes('/')
  );
}

/**
 * Where an `<img>` reads the photo from, or null for the initials.
 *
 * `?v=` is the key's own uuid: a new upload is a new key, so the URL changes and
 * the browser does not keep showing the old face out of its cache.
 */
export function avatarSrc(staff: { id: string; avatarKey: string | null }): string | null {
  if (!staff.avatarKey) return null;
  const version = staff.avatarKey.split('/').pop()?.split('.')[0] ?? '';
  return `/api/avatar/${staff.id}?v=${encodeURIComponent(version)}`;
}

/**
 * Who may set a photo, and whose. ADMIN and their own only, for now (owner,
 * 2026-09-26: «for users later, now only for admin»). Opening it to everybody is
 * a change to this one line — the column, the upload and the route already
 * belong to nobody in particular.
 */
export function canSetOwnAvatar(role: string): boolean {
  return role === 'ADMIN';
}
