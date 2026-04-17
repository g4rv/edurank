// This single file handles all Auth.js HTTP requests:
// POST /api/auth/signin, GET /api/auth/session, POST /api/auth/signout, etc.
// The [...nextauth] catch-all route passes everything to Auth.js handlers.
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
