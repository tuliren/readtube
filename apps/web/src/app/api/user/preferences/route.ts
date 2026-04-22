import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { findTargetLanguage } from '@/lib/language/names';

/**
 * Update the signed-in user's reader preferences.
 *
 * Body: { preferred_language?: string | null }
 *
 * The body is intentionally permissive — every field is optional, and
 * `null` for `preferred_language` clears the preference (reader falls
 * back to "Original"). Unknown language codes are rejected so the
 * picker and the prompt stay in sync.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { preferred_language?: string | null };
  try {
    body = (await request.json()) as { preferred_language?: string | null };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const data: { preferred_language?: string | null } = {};
  if ('preferred_language' in body) {
    if (body.preferred_language == null) {
      data.preferred_language = null;
    } else if (typeof body.preferred_language === 'string') {
      const code = body.preferred_language.trim();
      if (code.length === 0) {
        data.preferred_language = null;
      } else if (findTargetLanguage(code) == null) {
        return NextResponse.json({ error: `Unsupported language code: ${code}` }, { status: 400 });
      } else {
        data.preferred_language = code;
      }
    } else {
      return NextResponse.json(
        { error: 'preferred_language must be a string or null' },
        { status: 400 }
      );
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No preferences to update' }, { status: 400 });
  }

  await prisma.user.update({
    where: { source_id: userId },
    data,
  });

  return NextResponse.json({ ok: true });
}
