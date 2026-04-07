import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) return null;

        const passwordMatch = await compare(
          credentials.password as string,
          user.passwordHash,
        );

        if (!passwordMatch) return null;

        // Return only what goes into the JWT token — keep it minimal
        return { id: user.id, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    // jwt() runs when the token is created (login) or read (every request).
    // We add id and role so they're available in the session.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    // session() shapes what your app code sees when it calls auth().
    // It reads from the token (never touches the DB).
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      return session;
    },
  },
});
