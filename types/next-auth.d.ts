import { Role } from '@/lib/generated/prisma/client';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      role: Role;
      staffId: string | null;
    };
  }

  interface User {
    role: Role;
    staffId: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: Role;
    staffId: string | null;
    tokenVersion: number;
  }
}
