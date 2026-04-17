import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { Button, Input } from '@/components/ui';

async function loginAction(formData: FormData) {
  'use server';

  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return redirect('/login?error=invalid');
    }
    throw error;
  }

  redirect('/');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-zinc-900">Вхід</h1>

        {error === 'invalid' && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            Невірний email або пароль.
          </p>
        )}

        <form action={loginAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-sm font-medium text-zinc-700"
            >
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-sm font-medium text-zinc-700"
            >
              Пароль
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="mt-2 w-full">
            Увійти
          </Button>
        </form>
      </div>
    </div>
  );
}
