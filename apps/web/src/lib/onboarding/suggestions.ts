import type { Prisma, PrismaClient, VideoPlatformType } from '@readtube/database';

import { primaryLanguage } from './language';
import { resolveContentLanguage } from './resolveLanguage';
import type { OnboardingSuggestions, SuggestedChannel, SuggestedVideo } from './types';

/** Max channels returned to the onboarding page (across all languages). */
export const CHANNEL_SUGGESTION_LIMIT = 60;
/** Max videos returned to the onboarding page (across all languages). */
export const VIDEO_SUGGESTION_LIMIT = 60;
/**
 * Max videos from any one channel. Ordering by recency alone lets one
 * prolific channel fill the whole grid; a new user should see range.
 */
export const MAX_VIDEOS_PER_CHANNEL = 2;
/** Recent videos per channel used for the title preview and language. */
const CHANNEL_SAMPLE_VIDEOS = 8;
/** Titles shown on each channel card. */
const CHANNEL_PREVIEW_TITLES = 2;
/**
 * Candidate videos fetched before the per-channel cap. Over-selects so
 * the cap still leaves {@link VIDEO_SUGGESTION_LIMIT} videos to show
 * when a few channels dominate the newest uploads.
 */
const VIDEO_CANDIDATE_LIMIT = VIDEO_SUGGESTION_LIMIT * 4;

/**
 * The only platform offered during onboarding, for now. Bilibili rows
 * exist, but a new user is shown one platform so the page reads as one
 * coherent feed. Applied to the suggestions and to what
 * `POST /api/onboarding` and the channel preview accept.
 */
export const ONBOARDING_PLATFORM = 'YOUTUBE' satisfies VideoPlatformType;

/**
 * Channels whose feed is loaded and refreshing fine: the only ones the
 * onboarding page can follow (or preview) straight from the database,
 * on the onboarding platform,
 * since a shadow or failing channel would give the user an empty feed.
 */
export const FOLLOWABLE_CHANNEL = {
  source_type: ONBOARDING_PLATFORM,
  checked_at: { not: null },
  refresh_failed_at: null,
} satisfies Prisma.ChannelWhereInput;

/**
 * Videos on the onboarding platform with a READY summary or article on
 * some transcript: the ones with a public share page. Only these are
 * offered (and accepted back by `POST /api/onboarding`), so a new user
 * always lands on something readable.
 */
export const OFFERABLE_VIDEO = {
  source_type: ONBOARDING_PLATFORM,
  transcripts: {
    some: {
      OR: [
        { summaries: { some: { status: 'READY' } } },
        { articles: { some: { status: 'READY' } } },
      ],
    },
  },
} satisfies Prisma.VideoWhereInput;

/**
 * True when the user has added nothing at all: no channel subscriptions,
 * no standalone library videos, no playlists. These users get the
 * onboarding page in place of their (empty) inbox.
 */
export async function isNewUser(prisma: PrismaClient, userId: string): Promise<boolean> {
  const [subscription, standalone, playlist] = await Promise.all([
    prisma.userSubscription.findFirst({ where: { user_id: userId }, select: { id: true } }),
    prisma.standaloneVideo.findFirst({ where: { user_id: userId }, select: { id: true } }),
    prisma.playlist.findFirst({ where: { user_id: userId }, select: { id: true } }),
  ]);
  return subscription == null && standalone == null && playlist == null;
}

/**
 * Load the channels and videos to offer a new user, drawn from what is
 * already in the database so picking one costs no upstream fetch.
 * Both lists are newest-first and carry a resolved `language` so the
 * page can filter them locally (English by default).
 */
export async function loadOnboardingSuggestions(
  prisma: PrismaClient
): Promise<OnboardingSuggestions> {
  const [channels, videos] = await Promise.all([
    loadSuggestedChannels(prisma),
    loadSuggestedVideos(prisma),
  ]);
  return { channels, videos };
}

/**
 * The onboarding suggestions for a user who hasn't added anything, or
 * null when the regular page should render instead: the user has added
 * something, or there is nothing to suggest. Every top-level page a new
 * user can land on (the inbox, Standalone videos) shows the same
 * onboarding page through this.
 */
export async function loadNewUserSuggestions(
  prisma: PrismaClient,
  userId: string
): Promise<OnboardingSuggestions | null> {
  if (!(await isNewUser(prisma, userId))) {
    return null;
  }
  const suggestions = await loadOnboardingSuggestions(prisma);
  if (suggestions.channels.length === 0 && suggestions.videos.length === 0) {
    return null;
  }
  return suggestions;
}

/**
 * Channels someone on ReadTube follows, ordered by their newest video.
 *
 * - Followed: a follower is the signal that a channel was added on
 *   purpose. Channels with none are mostly shadow rows created as a side
 *   effect of adding a single video, and nobody chose to follow them.
 * - Hydrated (`checked_at` set) and not failing to refresh, so following
 *   one fills the inbox right away. Following goes straight to a
 *   subscription with no upstream fetch, which is only safe for these.
 * - Ordered by newest video: "recently updated" is what makes a feed
 *   worth following. `checked_at` would not do, since the cron touches
 *   every followed channel every half hour.
 */
async function loadSuggestedChannels(prisma: PrismaClient): Promise<SuggestedChannel[]> {
  const ranked = await prisma.$queryRaw<
    Array<{ id: string; follower_count: bigint; latest_video_at: Date }>
  >`
    SELECT
      c."id"                   AS id,
      COUNT(DISTINCT s."id")   AS follower_count,
      latest."at"              AS latest_video_at
    FROM "Channel" c
    JOIN "UserSubscription" s ON s."channel_id" = c."id"
    JOIN LATERAL (
      SELECT MAX(v."published_at") AS at
      FROM "Video" v
      WHERE v."channel_id" = c."id"
    ) latest ON latest."at" IS NOT NULL
    WHERE c."source_type" = ${ONBOARDING_PLATFORM}::"VideoPlatformType"
      AND c."checked_at" IS NOT NULL
      AND c."refresh_failed_at" IS NULL
    GROUP BY c."id", latest."at"
    ORDER BY latest."at" DESC, c."id" DESC
    LIMIT ${CHANNEL_SUGGESTION_LIMIT}
  `;
  if (ranked.length === 0) {
    return [];
  }

  const rows = await prisma.channel.findMany({
    where: { id: { in: ranked.map((r) => r.id) } },
    select: {
      id: true,
      source_type: true,
      source_id: true,
      name: true,
      handle: true,
      logo_url: true,
      description: true,
      videos: {
        orderBy: [{ published_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: CHANNEL_SAMPLE_VIDEOS,
        select: {
          title: true,
          transcripts: { orderBy: { created_at: 'desc' }, take: 1, select: { language: true } },
        },
      },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  const channels: SuggestedChannel[] = [];
  for (const rank of ranked) {
    const row = byId.get(rank.id);
    if (row == null) {
      continue;
    }
    const titles = row.videos.map((v) => v.title);
    channels.push({
      id: row.id,
      sourceId: row.source_id,
      platform: row.source_type,
      name: row.name,
      handle: row.handle,
      logoUrl: row.logo_url,
      followerCount: Number(rank.follower_count),
      latestVideoAt: rank.latest_video_at.toISOString(),
      recentVideoTitles: titles.slice(0, CHANNEL_PREVIEW_TITLES),
      language: resolveContentLanguage(
        row.videos.map((v) => v.transcripts[0]?.language ?? null),
        [...titles, row.description ?? ''].join('\n')
      ),
    });
  }
  return channels;
}

/**
 * The newest videos that already have a generated summary or article,
 * so a new user can open one and start reading immediately. These are
 * exactly the videos with a public share page, so offering them here
 * reveals nothing that isn't already public.
 */
async function loadSuggestedVideos(prisma: PrismaClient): Promise<SuggestedVideo[]> {
  const rows = await prisma.video.findMany({
    where: { thumbnail_url: { not: null }, ...OFFERABLE_VIDEO },
    orderBy: [{ published_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    take: VIDEO_CANDIDATE_LIMIT,
    select: {
      id: true,
      channel_id: true,
      source_type: true,
      source_id: true,
      title: true,
      description: true,
      thumbnail_url: true,
      duration_seconds: true,
      published_at: true,
      channel: { select: { name: true, logo_url: true } },
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          language: true,
          summaries: {
            where: { status: 'READY' },
            select: { headline: true, language: true },
          },
        },
      },
    },
  });

  return capPerKey(rows, (row) => row.channel_id, MAX_VIDEOS_PER_CHANNEL)
    .slice(0, VIDEO_SUGGESTION_LIMIT)
    .map((row) => {
      const transcript = row.transcripts[0];
      const language = resolveContentLanguage(
        [transcript?.language ?? null],
        [row.title, row.description ?? ''].join('\n')
      );
      return {
        id: row.id,
        sourceId: row.source_id,
        platform: row.source_type,
        title: row.title,
        thumbnailUrl: row.thumbnail_url,
        durationSeconds: row.duration_seconds,
        publishedAt: row.published_at?.toISOString() ?? null,
        channelName: row.channel.name,
        channelLogoUrl: row.channel.logo_url,
        headline: pickHeadline(transcript?.summaries ?? [], language),
        language,
      };
    });
}

/**
 * Keep at most `max` items per key, preserving the input order. Used to
 * stop one channel from crowding out the rest of a newest-first list.
 */
export function capPerKey<T>(items: T[], keyOf: (item: T) => string, max: number): T[] {
  const seen = new Map<string, number>();
  const kept: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    const count = seen.get(key) ?? 0;
    if (count >= max) {
      continue;
    }
    seen.set(key, count + 1);
    kept.push(item);
  }
  return kept;
}

/**
 * The headline to show on a video card, in the card's own language:
 * the Original summary (written in the video's language), else a
 * translation labelled with that language, else none. A card only
 * shows under its own language's chip (or "All languages"), so this
 * keeps the headline in the language the visitor chose. There is no
 * English fallback: an English line under, say, a Chinese title is
 * what the chip was meant to rule out. Labels are trusted as stored.
 * Blank headlines are skipped.
 */
export function pickHeadline(
  summaries: { headline: string | null; language: string | null }[],
  language: string | null
): string | null {
  const usable = summaries.filter((s) => s.headline != null && s.headline.trim() !== '');
  const original = usable.find((s) => s.language == null);
  const sameLanguage =
    language == null
      ? undefined
      : usable.find((s) => s.language != null && primaryLanguage(s.language) === language);
  return (original ?? sameLanguage)?.headline?.trim() ?? null;
}
