import { prisma } from '@readtube/database';

import { parseLanguageQuery } from './prompt';

/**
 * Resolve the effective target language for an API request.
 *
 * Resolution order:
 *  1. Query string (`?language=...`):
 *     - `target` → use the code as-is.
 *     - `original` → null (skip user preference).
 *     - `unspecified` → fall through to user preference.
 *  2. The user's `preferred_language` setting.
 *  3. null — Original.
 *
 * `userId` is the Clerk user id (matches `User.source_id`). We tolerate
 * the user not existing in the DB yet (returns null) so this never
 * throws on an unauthenticated edge.
 */
export async function resolveTargetLanguage(
  userId: string,
  rawQueryLanguage: string | null | undefined
): Promise<string | null> {
  const parsed = parseLanguageQuery(rawQueryLanguage);
  if (parsed.kind === 'target') {
    return parsed.code;
  }
  if (parsed.kind === 'original') {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { source_id: userId },
    select: { preferred_language: true },
  });
  return user?.preferred_language ?? null;
}
