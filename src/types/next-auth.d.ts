import { Role } from '@/generated/prisma/client';

// Extends the built-in Auth.js types so TypeScript knows about
// our custom fields (id, role) on the session user object.
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      role: Role;
      professorId: string | null;
    };
  }

  interface User {
    role: Role;
    professorId: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: Role;
    professorId: string | null;
  }
}
