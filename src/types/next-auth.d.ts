import { Role } from "@/generated/prisma/client";

// Extends the built-in Auth.js types so TypeScript knows about
// our custom fields (id, role) on the session user object.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      role: Role;
    };
  }

  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
