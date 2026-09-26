import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logError } from '@/lib/log';
import { getObjectBytes } from '@/lib/science/r2';
import { sniffType } from '@/lib/science/file-checks';

/**
 * A person's profile photo, for an `<img>`.
 *
 * The bucket is private, so a browser cannot read it directly. This route is the
 * one door: it checks the login, reads the object and streams it back. Streamed
 * rather than redirected to a signed link — a redirect would hand the browser an
 * R2 address, and the app's CSP allows no origin but its own.
 *
 * **Any signed-in user may see any photo**, the same people who may see the
 * profile it belongs to. Nothing here is confidential the way a ставка is.
 *
 * The proxy matcher excludes /api entirely, so this route authenticates itself.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ staffId: string }> }) {
  const session = await auth();
  if (!session) return new Response(null, { status: 401 });

  const { staffId } = await params;
  const row = await db.staff.findUnique({ where: { id: staffId }, select: { avatarKey: true } });
  if (!row?.avatarKey) return new Response(null, { status: 404 });

  try {
    const bytes = await getObjectBytes(row.avatarKey);
    // The first bytes decide the type, not the key's extension.
    const type = sniffType(bytes);
    if (type !== 'image/jpeg' && type !== 'image/png') return new Response(null, { status: 404 });

    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': type,
        // Private (a login guards it) and short: a new upload changes the `?v=`
        // in the URL, so this only has to survive a page's own re-renders.
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    logError('avatar.read', e, { userId: session.user.id });
    return new Response(null, { status: 502 });
  }
}
