import type { UserJSON } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';

function extractName(user: UserJSON): string {
  const parts = [user.first_name, user.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

function extractPrimaryEmail(user: UserJSON): string | null {
  const primary = user.email_addresses.find((e) => e.id === user.primary_email_address_id);
  return primary?.email_address ?? null;
}

export async function upsertClerkUser(user: UserJSON): Promise<void> {
  const name = extractName(user);
  const email = extractPrimaryEmail(user);

  if (!email) {
    console.warn(`No primary email found for user ${user.id}, skipping upsert`);
    return;
  }

  await prisma.clerkUser.upsert({
    where: { user_id: user.id },
    create: {
      user_id: user.id,
      name,
      email,
      image: user.image_url || null,
    },
    update: {
      name,
      email,
      image: user.image_url || null,
    },
  });

  console.info(`Upserted ClerkUser for ${email} (${user.id})`);
}

export async function deleteClerkUser(userId: string): Promise<void> {
  await prisma.clerkUser.delete({ where: { user_id: userId } });
  console.info(`Deleted ClerkUser for ${userId}`);
}
