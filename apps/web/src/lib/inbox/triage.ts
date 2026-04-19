import type { PrismaClient, VideoPlatformType } from '@readtube/database';

import { buildThumbnailUrl } from '@/lib/platforms/youtube/urls';
import type { TagData, VideoData } from '@/lib/types';

/**
 * Minimal raw row shape that a caller must supply when it wants triage
 * decoration. Kept structural (not a Prisma type alias) so callers can pick
 * the fields they need without pulling in the full Video model.
 */
export interface TriageRawRow {
  id: string;
  source_id: string;
  source_type: VideoPlatformType;
  title: string;
  description: string | null;
  published_at: Date | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  transcript_unavailable: boolean;
  channel_id: string;
  channel: { name: string; source_id: string; handle: string | null };
  /**
   * Latest Transcript row (or none) plus whether it has a Summary
   * row attached and whether it has at least one Article row. The
   * caller should `take: 1` on this relation; we only need to know
   * presence, not the full payload.
   *
   * Shape kept structural so callers can pick the cheapest possible
   * select clause: a single Transcript row with id, summary id, and
   * one Article id is all we need.
   */
  transcripts: Array<{
    summary: { transcript_id: string } | null;
    articles: Array<{ id: string }>;
  }>;
}

interface TriageContext {
  starredIds: Set<string>;
  savedIds: Set<string>;
  archivedIds: Set<string>;
  standaloneIds: Set<string>;
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
      standaloneIds: new Set(),
      tagsByVideoId: new Map(),
      noteCountsByVideoId: new Map(),
    };
  }

  const [stars, saves, archives, standalones, videoTags, noteCounts] = await Promise.all([
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
    prisma.standaloneVideo.findMany({
      where: { user_id: userId, video_id: { in: videoIds } },
      select: { video_id: true },
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
    standaloneIds: new Set(standalones.map((r) => r.video_id)),
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
  // Derive the artifact-presence flags from the latest Transcript
  // row. The caller's Prisma select uses `take: 1` ordered by
  // created_at desc, so transcripts[0] is the latest snapshot.
  const latestTranscript = row.transcripts[0];
  const hasTranscript = latestTranscript != null;
  const hasSummary = latestTranscript?.summary != null;
  const hasArticle = (latestTranscript?.articles.length ?? 0) > 0;

  return {
    id: row.id,
    sourceId: row.source_id,
    platform: row.source_type,
    title: row.title,
    description: row.description,
    publishedAt: row.published_at?.toISOString() ?? null,
    readAt: readAt != null ? readAt.toISOString() : null,
    durationSeconds: row.duration_seconds,
    // YouTube: some older rows predate the always-populate-thumbnail
    // rule and have null thumbnail_url — fall back to the deterministic
    // hqdefault URL. Bilibili: the snapshot always populates pic; if
    // we ever end up with null, render nothing rather than invent a
    // URL on a CDN that would just 404.
    thumbnailUrl:
      row.thumbnail_url ??
      (row.source_type === 'YOUTUBE' ? buildThumbnailUrl(row.source_id) : null),
    transcriptUnavailable: row.transcript_unavailable,
    hasTranscript,
    hasSummary,
    hasArticle,
    channelId: row.channel_id,
    channelName: row.channel.name,
    channelSourceId: row.channel.source_id,
    channelHandle: row.channel.handle,
    isStarred: context.starredIds.has(row.id),
    isSaved: context.savedIds.has(row.id),
    isArchived: context.archivedIds.has(row.id),
    isStandalone: context.standaloneIds.has(row.id),
    tags: context.tagsByVideoId.get(row.id) ?? [],
    noteCount: context.noteCountsByVideoId.get(row.id) ?? 0,
  };
}
