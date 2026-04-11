import type { PrismaClient } from '@readtube/database';

import type { TagData, VideoData } from '@/lib/types';

/**
 * Minimal raw row shape that a caller must supply when it wants triage
 * decoration. Kept structural (not a Prisma type alias) so callers can pick
 * the fields they need without pulling in the full Video model.
 */
export interface TriageRawRow {
  id: string;
  source_id: string;
  title: string;
  description: string | null;
  published_at: Date;
  duration_seconds: number | null;
  transcript_unavailable: boolean;
  channel_id: string;
  channel: { name: string; source_id: string };
}

interface TriageContext {
  starredIds: Set<string>;
  savedIds: Set<string>;
  archivedIds: Set<string>;
  snoozeById: Map<string, Date>;
  tagsByVideoId: Map<string, TagData[]>;
  noteCountsByVideoId: Map<string, number>;
}

/**
 * Load all triage state for a user across a set of videos in one pass.
 * Batches five small queries instead of N per-row lookups. Callers should
 * pass the *filtered* id set (not every video the user ever saw) to keep
 * each query bounded.
 */
export async function loadTriageContext(
  prisma: PrismaClient,
  userId: string,
  videoIds: string[]
): Promise<TriageContext> {
  if (videoIds.length === 0) {
    return {
      starredIds: new Set(),
      savedIds: new Set(),
      archivedIds: new Set(),
      snoozeById: new Map(),
      tagsByVideoId: new Map(),
      noteCountsByVideoId: new Map(),
    };
  }

  const [stars, saves, archives, snoozes, videoTags, noteCounts] = await Promise.all([
    prisma.videoStar.findMany({
      where: { user_id: userId, video_id: { in: videoIds } },
      select: { video_id: true },
    }),
    prisma.videoSave.findMany({
      where: { user_id: userId, video_id: { in: videoIds } },
      select: { video_id: true },
    }),
    prisma.videoArchive.findMany({
      where: { user_id: userId, video_id: { in: videoIds } },
      select: { video_id: true },
    }),
    prisma.videoSnooze.findMany({
      where: { user_id: userId, video_id: { in: videoIds } },
      select: { video_id: true, snooze_until: true },
    }),
    prisma.videoTag.findMany({
      where: { user_id: userId, video_id: { in: videoIds } },
      select: {
        video_id: true,
        tag: { select: { id: true, name: true, color: true } },
      },
    }),
    prisma.note.groupBy({
      by: ['video_id'],
      where: { user_id: userId, video_id: { in: videoIds } },
      _count: { _all: true },
    }),
  ]);

  const tagsByVideoId = new Map<string, TagData[]>();
  for (const row of videoTags) {
    const existing = tagsByVideoId.get(row.video_id) ?? [];
    existing.push({
      id: row.tag.id,
      name: row.tag.name,
      color: row.tag.color,
    });
    tagsByVideoId.set(row.video_id, existing);
  }

  const noteCountsByVideoId = new Map<string, number>();
  for (const row of noteCounts) {
    noteCountsByVideoId.set(row.video_id, row._count._all);
  }

  return {
    starredIds: new Set(stars.map((r) => r.video_id)),
    savedIds: new Set(saves.map((r) => r.video_id)),
    archivedIds: new Set(archives.map((r) => r.video_id)),
    snoozeById: new Map(snoozes.map((r) => [r.video_id, r.snooze_until])),
    tagsByVideoId,
    noteCountsByVideoId,
  };
}

/**
 * Decorate a raw Video row with triage flags + tags + note count. The
 * caller supplies `readAt` separately because it depends on the dual
 * watermark logic (per-subscription read_at + per-video consumption) that
 * lives in the page query.
 */
export function decorateVideo(
  row: TriageRawRow,
  context: TriageContext,
  readAt: Date | null
): VideoData {
  return {
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    description: row.description,
    publishedAt: row.published_at.toISOString(),
    readAt: readAt != null ? readAt.toISOString() : null,
    durationSeconds: row.duration_seconds,
    transcriptUnavailable: row.transcript_unavailable,
    channelId: row.channel_id,
    channelName: row.channel.name,
    channelSourceId: row.channel.source_id,
    isStarred: context.starredIds.has(row.id),
    isSaved: context.savedIds.has(row.id),
    isArchived: context.archivedIds.has(row.id),
    snoozedUntil: context.snoozeById.get(row.id)?.toISOString() ?? null,
    tags: context.tagsByVideoId.get(row.id) ?? [],
    noteCount: context.noteCountsByVideoId.get(row.id) ?? 0,
  };
}
