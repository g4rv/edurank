import { presignAvatar, saveAvatar } from '@/app/(dashboard)/profile/avatar-actions';

/**
 * Send a framed photo to R2 and bind it to the person — the whole of «save the
 * photo», run when the profile form is saved and at no other moment.
 *
 * Three steps, and the browser does the heavy one itself: ask the server for a
 * short-lived upload URL, PUT the file straight to R2, then tell the server it is
 * there so it can check the stored bytes and keep only that one.
 *
 * Returns a Ukrainian sentence on failure and never throws, so the form can say
 * what happened to the photo separately from what happened to the fields.
 */
export async function uploadAvatar(blob: Blob): Promise<{ ok: true } | { error: string }> {
  const ticket = await presignAvatar({ contentType: blob.type, sizeBytes: blob.size });
  if ('error' in ticket) return { error: ticket.error };

  let put: Response;
  try {
    put = await fetch(ticket.url, {
      method: 'PUT',
      headers: { 'Content-Type': blob.type },
      body: blob,
    });
  } catch {
    // A network failure and a missing CORS rule on the bucket look the same from
    // here: the browser refuses to say which.
    return { error: 'Не вдалося завантажити фото. Спробуйте ще раз' };
  }
  if (!put.ok) return { error: 'Не вдалося завантажити фото. Спробуйте ще раз' };

  const saved = await saveAvatar({ objectKey: ticket.objectKey });
  return 'error' in saved ? { error: saved.error } : { ok: true };
}
