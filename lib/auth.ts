import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import type { Role } from '@/lib/generated/prisma/client';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) return null;

        const valid = await compare(credentials.password as string, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          staffId: user.staffId,
          tokenVersion: user.tokenVersion,
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
      const dbUser = await db.user.findUnique({
        where: { id: token.id as string },
        select: { role: true, staffId: true, tokenVersion: true },
      });

      if (!dbUser || dbUser.tokenVersion !== token.tokenVersion) return null;

      token.role = dbUser.role;
      token.staffId = dbUser.staffId;
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
