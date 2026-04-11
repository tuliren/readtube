import { Resend } from 'resend';

import { prisma } from '@/lib/db';

/**
 * Daily digest email. Selects the top-N unread videos for a user based
 * on channel priority + recency, renders a plain HTML template, and
 * sends via Resend. The list is intentionally small (default 10) — the
 * goal is "what should I read today", not "everything unread".
 *
 * Env: RESEND_API_KEY must be set for real sends. In dev, leaving it
 * unset returns { sent: false, reason: 'no-resend-key' } so the cron
 * endpoint stays runnable without cross-project coordination.
 */

const DEFAULT_LIMIT = 10;

interface DigestPick {
  id: string;
  title: string;
  channelName: string;
  publishedAt: Date;
  sourceId: string;
  priority: number;
}

export async function pickDigestVideos(
  userId: string,
  limit: number = DEFAULT_LIMIT
): Promise<DigestPick[]> {
  const subs = await prisma.userSubscription.findMany({
    where: { user_id: userId },
    select: { channel_id: true, read_at: true, priority: true },
  });
  if (subs.length === 0) {
    return [];
  }

  const channelIds = subs.map((s) => s.channel_id);
  const watermark = new Map(subs.map((s) => [s.channel_id, s.read_at]));
  const priority = new Map(subs.map((s) => [s.channel_id, s.priority]));

  // Pull a generous candidate set, score in memory, take the top N. The
  // index on (channel_id, published_at) keeps the fetch cheap.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const videos = await prisma.video.findMany({
    where: {
      channel_id: { in: channelIds },
      published_at: { gte: since },
      consumptions: { none: { user_id: userId } },
      archives: { none: { user_id: userId } },
      snoozes: { none: { user_id: userId, snooze_until: { gt: new Date() } } },
    },
    select: {
      id: true,
      source_id: true,
      title: true,
      published_at: true,
      channel_id: true,
      channel: { select: { name: true } },
    },
    orderBy: { published_at: 'desc' },
    take: 200,
  });

  const filtered = videos.filter((v) => {
    const mark = watermark.get(v.channel_id);
    return mark == null || v.published_at.getTime() > mark.getTime();
  });

  // Score = priority (scale: -1, 0, +1) + recency bonus (newer → higher).
  // Convert publish time to a 0..1 fraction of the 7-day window.
  const sinceMs = since.getTime();
  const windowMs = Date.now() - sinceMs;
  const scored = filtered.map((v) => {
    const pri = priority.get(v.channel_id) ?? 0;
    const recency = (v.published_at.getTime() - sinceMs) / Math.max(1, windowMs);
    return { v, score: pri * 2 + recency };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ v }) => ({
    id: v.id,
    sourceId: v.source_id,
    title: v.title,
    channelName: v.channel.name,
    publishedAt: v.published_at,
    priority: priority.get(v.channel_id) ?? 0,
  }));
}

export function renderDigestHtml(videos: DigestPick[], appBaseUrl: string): string {
  const rows = videos
    .map(
      (v) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #eee;">
        <a href="${appBaseUrl}/inbox/${encodeURIComponent(v.id)}" style="color:#111;text-decoration:none;font-weight:600;font-size:15px;">${escapeHtml(v.title)}</a>
        <div style="color:#888;font-size:12px;margin-top:4px;">${escapeHtml(v.channelName)} · ${v.publishedAt.toLocaleDateString()}</div>
      </td>
    </tr>`
    )
    .join('');

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f7f7f7;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;">
      <h1 style="margin:0 0 4px 0;font-size:20px;">Your ReadTube digest</h1>
      <p style="color:#666;margin:0 0 16px 0;font-size:13px;">${videos.length} unread video${videos.length === 1 ? '' : 's'} to catch up on.</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <p style="margin:16px 0 0 0;color:#999;font-size:12px;">
        <a href="${appBaseUrl}/inbox" style="color:#515ada;text-decoration:none;">Open inbox →</a>
      </p>
    </div>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface SendResult {
  sent: boolean;
  reason?: string;
}

export async function sendDigest(
  userId: string,
  email: string,
  appBaseUrl: string
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey == null || apiKey === '') {
    return { sent: false, reason: 'no-resend-key' };
  }

  const videos = await pickDigestVideos(userId);
  if (videos.length === 0) {
    await prisma.digestRun.create({
      data: {
        user_id: userId,
        video_ids: [] as unknown as object,
        email_status: 'skipped',
        error: 'no-unread',
      },
    });
    return { sent: false, reason: 'no-unread' };
  }

  const html = renderDigestHtml(videos, appBaseUrl);
  const resend = new Resend(apiKey);

  try {
    await resend.emails.send({
      from: 'ReadTube <digest@readtube.app>',
      to: email,
      subject: `Your ReadTube digest — ${videos.length} video${videos.length === 1 ? '' : 's'}`,
      html,
    });
    await prisma.digestRun.create({
      data: {
        user_id: userId,
        video_ids: videos.map((v) => v.id) as unknown as object,
        email_status: 'sent',
      },
    });
    return { sent: true };
  } catch (err) {
    await prisma.digestRun.create({
      data: {
        user_id: userId,
        video_ids: videos.map((v) => v.id) as unknown as object,
        email_status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return { sent: false, reason: 'resend-error' };
  }
}
