import { prisma } from '@readtube/database';

import { findTargetLanguage } from './names';
import { parseLanguageQuery } from './prompt';

/**
 * Resolve the effective target language for an API request.
 *
 * Resolution order:
 *  1. Query string (`?language=...`):
 *     - `target` → validate against the curated TARGET_LANGUAGES list.
 *       Unknown codes silently fall through to the next step instead
 *       of being passed straight to the prompt builder + DB column
 *       (defense in depth — the picker only ever sends curated codes,
 *       but the route is reachable directly).
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
  if (parsed.kind === 'target' && findTargetLanguage(parsed.code) != null) {
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
