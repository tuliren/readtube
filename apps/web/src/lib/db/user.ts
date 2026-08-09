import { clerkClient } from '@clerk/nextjs/server';
import type { User as ClerkUser, UserJSON } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';

import { isEmptyString } from '@/lib/string';
import { VercelEnv, getVercelEnv } from '@/lib/vercelEnv';

interface UserAttributes {
  sourceId: string;
  name: string;
  email: string;
  image: string | null;
}

function extractName(user: UserJSON): string {
  const parts = [user.first_name, user.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

function extractPrimaryEmail(user: UserJSON): string | null {
  const primary = user.email_addresses.find((e) => e.id === user.primary_email_address_id);
  return primary?.email_address ?? null;
}

/**
 * Persists Clerk user attributes into the User table.
 *
 * Non-production deployments authenticate against the Clerk development
 * instance but run on a Neon branch forked from production data, so the
 * same person (matched by the unique email) already has a row whose
 * source_id is their production Clerk id. Outside production we adopt
 * that row by rewriting source_id to the currently authenticated Clerk
 * id — every user-owned table references User.source_id with ON UPDATE
 * CASCADE, so child rows follow automatically. In production a
 * source_id/email mismatch is a real inconsistency, so the upsert still
 * fails on the unique email constraint.
 */
async function saveUser({ sourceId, name, email, image }: UserAttributes): Promise<void> {
  if (getVercelEnv(process.env.VERCEL_ENV) !== VercelEnv.PRODUCTION) {
    // updateMany rather than update: it accepts the non-unique NOT
    // condition (so the mismatch check and the write are one atomic
    // statement) and matches zero rows instead of throwing when there
    // is nothing to adopt. The unique email constraint guarantees at
    // most one row can match.
    const reassigned = await prisma.user.updateMany({
      where: { email, NOT: { source_id: sourceId } },
      data: { source_id: sourceId, name, image },
    });
    if (reassigned.count > 0) {
      console.info(`Reassigned User ${email} to source_id ${sourceId}`);
      return;
    }
  }

  await prisma.user.upsert({
    where: { source_id: sourceId },
    create: { source_id: sourceId, name, email, image },
    update: { name, email, image },
  });
}

export async function upsertUser(user: UserJSON): Promise<void> {
  const name = extractName(user);
  const email = extractPrimaryEmail(user);

  if (isEmptyString(email)) {
    console.warn(`No primary email found for user ${user.id}, skipping upsert`);
    return;
  }

  await saveUser({ sourceId: user.id, name, email, image: user.image_url ?? null });

  console.info(`Upserted User for ${email} (${user.id})`);
}

export async function deleteUser(userId: string): Promise<void> {
  await prisma.user.deleteMany({ where: { source_id: userId } });
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

  if (existing != null) {
    return;
  }

  const client = await clerkClient();
  const user: ClerkUser = await client.users.getUser(userId);

  const parts = [user.firstName, user.lastName].filter(Boolean);
  const name = parts.length > 0 ? parts.join(' ') : 'Unknown';
  const primaryEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  const email = primaryEmail?.emailAddress ?? null;

  if (isEmptyString(email)) {
    console.warn(`No primary email found for user ${userId}, skipping upsert`);
    return;
  }

  await saveUser({ sourceId: userId, name, email, image: user.imageUrl ?? null });

  console.info(`Upserted User for ${email} (${userId}) via fallback`);
}
