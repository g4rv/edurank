import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { LoginForm } from './login-form';

// Server side of the login route. The proxy deliberately lets everyone reach
// /login — it only knows whether a session cookie exists, and bouncing on a
// stale one would ping-pong against the dashboard's own auth() redirect.
// The real check belongs here, where the session is actually verified.
export default async function LoginPage() {
  const session = await auth();
  if (session) redirect(session.user.role === 'USER' ? '/profile' : '/staff');

  return <LoginForm />;
}
