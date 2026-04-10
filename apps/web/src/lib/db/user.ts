import { clerkClient } from '@clerk/nextjs/server';
import type { User as ClerkUser, UserJSON } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';

function extractName(user: UserJSON): string {
  const parts = [user.first_name, user.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

function extractPrimaryEmail(user: UserJSON): string | null {
  const primary = user.email_addresses.find((e) => e.id === user.primary_email_address_id);
  return primary?.email_address ?? null;
}

export async function upsertUser(user: UserJSON): Promise<void> {
  const name = extractName(user);
  const email = extractPrimaryEmail(user);

  if (email == null) {
    console.warn(`No primary email found for user ${user.id}, skipping upsert`);
    return;
  }

  await prisma.user.upsert({
    where: { source_id: user.id },
    create: {
      source_id: user.id,
      name,
      email,
      image: user.image_url ?? null,
    },
    update: {
      name,
      email,
      image: user.image_url ?? null,
    },
  });

  console.info(`Upserted User for ${email} (${user.id})`);
}

export async function deleteUser(userId: string): Promise<void> {
  await prisma.user.delete({ where: { source_id: userId } });
  console.info(`Deleted User for ${userId}`);
}

/**
 * Ensures a User row exists in the database, fetching from Clerk if needed.
 * Call this on login entry points and before any write that has a user_id FK.
 */
export async function ensureUserExists(userId: string): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { source_id: userId },
    select: { source_id: true },
  });

  if (existing) {
    return;
  }

  const client = await clerkClient();
  const user: ClerkUser = await client.users.getUser(userId);

  const parts = [user.firstName, user.lastName].filter(Boolean);
  const name = parts.length > 0 ? parts.join(' ') : 'Unknown';
  const primaryEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  const email = primaryEmail?.emailAddress ?? null;

  if (email == null) {
    console.warn(`No primary email found for user ${userId}, skipping upsert`);
    return;
  }

  await prisma.user.upsert({
    where: { source_id: userId },
    create: { source_id: userId, name, email, image: user.imageUrl ?? null },
    update: { name, email, image: user.imageUrl ?? null },
  });

  console.info(`Upserted User for ${email} (${userId}) via fallback`);
}
