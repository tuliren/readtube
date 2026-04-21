import type { PrismaClient, VideoPlatformType } from '@readtube/database';

import { hasChannelHandleConflict } from '@/lib/channels/handleConflict';
import type { VideoPlatform } from '@/lib/platforms';
import type { ChannelSnapshot, SnapshotVideo } from '@/lib/platforms/types';
import { isEmptyString } from '@/lib/string';

export interface UpsertChannelResult {
  id: string;
  source_id: string;
  name: string;
  handle: string | null;
  /** Populated for platforms that expose an RSS feed (YouTube); null
   *  for platforms that don't (Bilibili) — mirrors the DB column. */
  rss_url: string | null;
  logo_url: string | null;
  created_at: Date;
  updated_at: Date;
  checked_at: Date | null;
}

/**
 * Upsert a Channel + its full snapshot (metadata + videos).
 *
 * Intentionally does NOT use prisma.channel.upsert. Prisma compiles
 * that to `INSERT ... ON CONFLICT (source_type, source_id) DO UPDATE`.
 * If the row also already owns the scraped handle — i.e. exactly the
 * common case of "this channel is already in the DB" — the INSERT
 * simultaneously violates the `(source_type, handle)` unique
 * constraint, and Postgres can raise that P2002 instead of routing
 * through ON CONFLICT. The ON CONFLICT clause only catches conflicts
 * on the constraint it names. Split into findUnique + create / update
 * so the INSERT path only runs when there's truly no existing row.
 * Handle updates are also guarded: if *another* row owns the scraped
 * handle (stale data, rename upstream), we skip writing it here.
 *
 * On BOTH create and update paths, the snapshot's videos are persisted
 * (upsert per video) and `checked_at` is set to now. This matters when
 * a row was first created as a "shadow" channel by the add-video or
 * add-playlist flow (metadata only, no videos, checked_at = null) and
 * the user now explicitly adds the channel: we want it fully hydrated,
 * not just its logo/handle patched.
 */
export async function upsertChannelWithVideos(
  prisma: PrismaClient,
  platform: VideoPlatform,
  sourceId: string,
  snapshot: ChannelSnapshot
): Promise<UpsertChannelResult> {
  console.info(`Upsert ${platform.type} channel with source id ${sourceId}`);

  const existing = await prisma.channel.findUnique({
    where: {
      channel_unique_source: { source_type: platform.type, source_id: sourceId },
    },
  });

  const hasHandle = !isEmptyString(snapshot.handle);

  if (existing != null) {
    console.info(`Channel ${sourceId} exists — updating metadata + upserting videos`);

    // Handle updates are guarded: if another row owns the scraped
    // handle, we skip writing it here. If the existing row already has
    // the same handle, the update is a no-op for that column; Prisma
    // generates SET handle = '@x' which is fine — Postgres doesn't
    // re-check the unique constraint for unchanged values.
    const conflictOnHandle = await hasChannelHandleConflict(
      prisma,
      snapshot.handle,
      existing.id,
      platform.type
    );

    await upsertSnapshotVideos(prisma, platform.type, existing.id, snapshot.videos);

    return prisma.channel.update({
      where: { id: existing.id },
      data: {
        name: snapshot.name,
        ...(snapshot.logoUrl != null ? { logo_url: snapshot.logoUrl } : {}),
        ...(hasHandle && !conflictOnHandle ? { handle: snapshot.handle } : {}),
        checked_at: new Date(),
      },
    });
  }

  // Create path — include handle only when no existing row has it.
  const handleAlreadyUsed = await hasChannelHandleConflict(
    prisma,
    snapshot.handle,
    null,
    platform.type
  );

  console.info(`Channel ${sourceId} does not exist — creating with videos`);
  // Create the channel first, then upsert videos individually. Using a
  // nested `videos: { create: [...] }` would batch-INSERT and crash with
  // P2002 if any snapshot video already exists under a different
  // channel (e.g. a playlist-owner shadow channel) — the per-video
  // upsert below correctly re-points `channel_id` instead.
  const channel = await prisma.channel.create({
    data: {
      source_type: platform.type,
      source_id: sourceId,
      name: snapshot.name,
      rss_url: platform.buildRssUrl(sourceId),
      logo_url: snapshot.logoUrl,
      checked_at: new Date(),
      ...(hasHandle && !handleAlreadyUsed ? { handle: snapshot.handle } : {}),
    },
  });
  await upsertSnapshotVideos(prisma, platform.type, channel.id, snapshot.videos);
  return channel;
}

/**
 * Persist snapshot videos against a known channel id. Scoped by
 * `video_unique_source` (source_type + source_id, globally unique) so a
 * video already stored under a different channel (typically a
 * playlist-owner shadow channel from the add-playlist flow) is
 * re-pointed to the real owner instead of crashing with P2002.
 *
 * `isScraped` videos are create-or-skip: their truncated
 * title/description and approximate publishedAt would regress richer
 * data already stored from a prior RSS hit, so the update branch is a
 * no-op. Source-type is always set explicitly on create — the column
 * defaults to YOUTUBE in the schema, which would mis-tag Bilibili rows
 * and break downstream platform dispatch.
 */
async function upsertSnapshotVideos(
  prisma: PrismaClient,
  sourceType: VideoPlatformType,
  channelId: string,
  videos: SnapshotVideo[]
): Promise<void> {
  for (const video of videos) {
    await prisma.video.upsert({
      where: {
        video_unique_source: {
          source_type: sourceType,
          source_id: video.videoId,
        },
      },
      create: {
        channel_id: channelId,
        source_type: sourceType,
        source_id: video.videoId,
        title: video.title,
        description: video.description,
        published_at: video.publishedAt,
        thumbnail_url: video.thumbnailUrl,
        duration_seconds: video.durationSeconds,
      },
      update:
        video.isScraped === true
          ? // Preserve title/description/publishedAt (truncated scrape
            // data would regress richer RSS data), but still re-point
            // channel_id so a video previously stored under a shadow
            // channel migrates to the real owner. Same→same is a no-op.
            { channel_id: channelId }
          : {
              channel_id: channelId,
              title: video.title,
              ...(isEmptyString(video.description) ? {} : { description: video.description }),
              ...(video.publishedAt != null ? { published_at: video.publishedAt } : {}),
              thumbnail_url: video.thumbnailUrl,
              ...(video.durationSeconds != null ? { duration_seconds: video.durationSeconds } : {}),
            },
    });
  }
}
