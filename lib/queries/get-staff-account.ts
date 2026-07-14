import { db } from '@/lib/db';

// Account state for the ADMIN card on the staff detail page.
// passwordHash itself never leaves this function — only its presence.
export async function getStaffAccount(id: string) {
  const staff = await db.staff.findUnique({
    where: { id },
    select: {
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
  };
}

export type StaffAccount = NonNullable<Awaited<ReturnType<typeof getStaffAccount>>>;
