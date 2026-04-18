import { type PrismaClient, VideoPlatformType } from '@readtube/database';

import { hasChannelHandleConflict } from '@/lib/channels/handleConflict';
import type { ChannelSnapshot } from '@/lib/platforms/youtube/channelSnapshot';
import { buildRssUrl } from '@/lib/platforms/youtube/urls';
import { isEmptyString } from '@/lib/string';

export interface UpsertChannelResult {
  id: string;
  source_id: string;
  name: string;
  handle: string | null;
  // Nullable globally (Bilibili rows have none), but this helper only
  // creates YouTube channels so the returned row always has a value.
  rss_url: string | null;
  logo_url: string | null;
  created_at: Date;
  updated_at: Date;
  checked_at: Date | null;
}

/**
 * Upsert a Channel + its initial video list from a fresh snapshot.
 *
 * Intentionally does NOT use prisma.channel.upsert. Prisma compiles
 * that to `INSERT ... ON CONFLICT (source_type, source_id) DO UPDATE`.
 * If the row also already owns the scraped handle — i.e. exactly the
 * common case of "this channel is already in the DB" — the INSERT
 * simultaneously violates the `(source_type, handle)` unique
 * constraint, and Postgres can raise that P2002 instead of routing
 * through ON CONFLICT. The ON CONFLICT clause only catches conflicts
 * on the constraint it names.
 *
 * Split into findUnique + create / update so the INSERT path only
 * runs when there's truly no existing row. Handle updates are also
 * guarded: if *another* row owns the scraped handle (stale data,
 * rename upstream), we skip writing it here.
 */
export async function upsertChannelWithVideos(
  prisma: PrismaClient,
  sourceId: string,
  snapshot: ChannelSnapshot
): Promise<UpsertChannelResult> {
  console.info(`Upsert channel with video source id ${sourceId}`);

  const existing = await prisma.channel.findUnique({
    where: {
      channel_unique_source: { source_type: VideoPlatformType.YOUTUBE, source_id: sourceId },
    },
  });

  const hasHandle = !isEmptyString(snapshot.handle);

  if (existing != null) {
    console.info(`Channel with video source id ${sourceId} already exists, updating...`);
    // Update path: only refresh the handle when no other row owns it.
    // If the existing row already has the same handle, the update is a
    // no-op for that column; Prisma generates SET handle = '@x' which
    // is fine — Postgres doesn't re-check the unique constraint for
    // unchanged values.
    const conflictOnHandle = await hasChannelHandleConflict(prisma, snapshot.handle, existing.id);

    return prisma.channel.update({
      where: { id: existing.id },
      data: {
        ...(snapshot.logoUrl != null ? { logo_url: snapshot.logoUrl } : {}),
        ...(hasHandle && !conflictOnHandle ? { handle: snapshot.handle } : {}),
      },
    });
  }

  // Create path: only include handle when no existing row has it.
  const handleAlreadyUsed = await hasChannelHandleConflict(prisma, snapshot.handle, null);

  console.info(`Channel does not exist, creating...`);
  return prisma.channel.create({
    data: {
      source_type: VideoPlatformType.YOUTUBE,
      source_id: sourceId,
      name: snapshot.name,
      rss_url: buildRssUrl(sourceId),
      logo_url: snapshot.logoUrl,
      ...(hasHandle && !handleAlreadyUsed ? { handle: snapshot.handle } : {}),
      videos: {
        create: snapshot.videos.map((v) => ({
          source_id: v.videoId,
          title: v.title,
          description: v.description,
          published_at: v.publishedAt,
          thumbnail_url: v.thumbnailUrl,
          duration_seconds: v.durationSeconds,
        })),
      },
    },
  });
}
