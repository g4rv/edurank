import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import type { Role } from '@/lib/generated/prisma/client';

// NextAuth reads AUTH_SECRET on its own and, when it is missing, fails at the
// first request with a message that does not name it. In production that is a
// dead site; in development it only costs sessions across a restart, so a
// warning is enough there and a fresh clone still runs.
if (!process.env.AUTH_SECRET) {
  const message =
    'AUTH_SECRET is not set — generate one with `openssl rand -base64 32` (see .env.example).';
  if (process.env.NODE_ENV === 'production') throw new Error(message);
  console.warn(`[auth] ${message} Sessions will not survive a restart.`);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const staff = await db.staff.findUnique({
          where: { email: credentials.email as string },
          select: { id: true, email: true, role: true, passwordHash: true, tokenVersion: true },
        });

        // passwordHash === null → account not activated yet (no password to check)
        if (!staff?.passwordHash) return null;

        const valid = await compare(credentials.password as string, staff.passwordHash);
        if (!valid) return null;

        return {
          id: staff.id,
          email: staff.email,
          role: staff.role,
          // Alias kept for the ~34 existing readers: after the User→Staff merge
          // the account id IS the staff id, so staffId always equals id.
          staffId: staff.id,
          tokenVersion: staff.tokenVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.staffId = user.staffId;
        token.tokenVersion = (user as unknown as { tokenVersion: number }).tokenVersion;
        return token;
      }

      // On every subsequent request, re-read from DB to pick up role changes
      // and validate tokenVersion — bumping it forces an immediate re-login
      const dbStaff = await db.staff.findUnique({
        where: { id: token.id as string },
        select: { role: true, tokenVersion: true },
      });

      if (!dbStaff || dbStaff.tokenVersion !== token.tokenVersion) return null;

      token.role = dbStaff.role;
      token.staffId = token.id;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      session.user.staffId = token.staffId as string | null;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
