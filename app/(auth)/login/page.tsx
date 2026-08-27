import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { safeCallbackPath } from '@/lib/auth/callback-url';
import { LoginForm } from './login-form';

// Server side of the login route. The proxy deliberately lets everyone reach
// /login — it only knows whether a session cookie exists, and bouncing on a
// stale one would ping-pong against the dashboard's own auth() redirect.
// The real check belongs here, where the session is actually verified.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { callbackUrl } = await searchParams;
  const session = await auth();
  if (session) {
    // Somebody already signed in who lands here — a bookmark, a back button —
    // still goes where they were headed, if that is a same-site path.
    const wanted = safeCallbackPath(typeof callbackUrl === 'string' ? callbackUrl : null);
    redirect(wanted ?? (session.user.role === 'USER' ? '/profile' : '/staff'));
  }

  return <LoginForm />;
}
