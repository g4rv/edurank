import { db } from '@/lib/db';
import { emailLockedUntil } from '@/lib/auth/throttle';

// Account state for the ADMIN card on the staff detail page.
// passwordHash itself never leaves this function — only its presence.
export async function getStaffAccount(id: string) {
  const staff = await db.staff.findUnique({
    where: { id },
    select: {
      email: true,
      role: true,
      passwordHash: true,
      activationToken: { select: { createdAt: true, expiresAt: true } },
    },
  });

  if (!staff) return null;

  return {
    role: staff.role,
    isActivated: staff.passwordHash !== null,
    invite: staff.activationToken
      ? {
          sentAt: staff.activationToken.createdAt,
          expired: staff.activationToken.expiresAt < new Date(),
        }
      : null,
    /**
     * Locked out of the login by failed attempts, and until when.
     *
     * On the card because until Mailjet is live nobody can reset their own
     * password, so a locked person has no way out but waiting — and the first
     * place anybody looks when «я не можу зайти» arrives is this page.
     */
    lockedUntil: await emailLockedUntil(staff.email),
  };
}

export type StaffAccount = NonNullable<Awaited<ReturnType<typeof getStaffAccount>>>;
