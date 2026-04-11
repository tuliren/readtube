import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

import { prisma } from '@/lib/db';
import { sendDigest } from '@/lib/email/digest';
import { isEmptyString } from '@/lib/string';

/**
 * Daily digest cron. Walks every user who has digest_enabled = true AND
 * whose digest_hour_utc matches the current UTC hour, and fires sendDigest
 * for each. Bearer-token authed like /api/cron/refresh.
 *
 * Intended to be triggered on an hourly cron schedule; users whose
 * digest_hour_utc doesn't match are skipped for that invocation.
 */

function verifyToken(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (isEmptyString(secret)) {
    return false;
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader == null || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice(7);
  try {
    const secretBuf = new TextEncoder().encode(secret);
    const tokenBuf = new TextEncoder().encode(token);
    if (secretBuf.length !== tokenBuf.length) {
      return false;
    }
    return timingSafeEqual(secretBuf, tokenBuf);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!verifyToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Allow ?force=1 to ignore the hour match, for manual testing.
  const force = request.nextUrl.searchParams.get('force') === '1';
  const nowHour = new Date().getUTCHours();

  const prefs = await prisma.userPreference.findMany({
    where: {
      digest_enabled: true,
      ...(force ? {} : { digest_hour_utc: nowHour }),
    },
    select: { user_id: true },
  });

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://readtube.app';

  const results: { userId: string; sent: boolean; reason?: string }[] = [];
  for (const pref of prefs) {
    const user = await prisma.user.findUnique({
      where: { source_id: pref.user_id },
      select: { email: true },
    });
    if (user == null) {
      results.push({ userId: pref.user_id, sent: false, reason: 'no-user' });
      continue;
    }
    const result = await sendDigest(pref.user_id, user.email, appBaseUrl);
    results.push({ userId: pref.user_id, ...result });
  }

  return NextResponse.json({ processed: prefs.length, results });
}
