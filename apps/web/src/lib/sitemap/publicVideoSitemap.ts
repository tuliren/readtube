import type { PrismaClient } from '@readtube/database';
import type { MetadataRoute } from 'next';

import { FULL_WEBSITE_URL } from '@/constants';

/**
 * Cap on public video entries in the sitemap, applied both as the
 * candidate query's `take` (bounds the build-time fetch; ~0.3s per
 * thousand rows measured warm against Neon) and as a truncation in
 * {@link buildVideoSitemapEntries}. The sitemap protocol allows
 * 50,000 URLs per file, so this is nowhere near a hard limit — the
 * cap keeps the file lean and focused on recent content (entries are
 * newest-first, so the cap drops the oldest videos).
 */
export const PUBLIC_VIDEO_SITEMAP_CAP = 10_000;

/** Row shape produced by {@link querySitemapVideos}. */
export interface SitemapVideoRow {
  source_id: string;
  transcripts: {
    summaries: { generated_at: Date }[];
    articles: { generated_at: Date }[];
  }[];
}

/**
 * Fetch candidate videos for the sitemap: any video with a READY
 * summary or article on some transcript, newest-first, at most
 * {@link PUBLIC_VIDEO_SITEMAP_CAP} rows so the build-time fetch stays
 * bounded no matter how large the library grows.
 *
 * The public page (/p/videos/[videoId]) 404s unless the *latest*
 * transcript has READY content, and that per-video "latest" check
 * isn't expressible in a single Prisma filter — so this query
 * over-selects slightly and {@link buildVideoSitemapEntries} re-checks
 * the latest transcript. A dropped candidate therefore leaves the
 * sitemap marginally under the cap even when more qualifying videos
 * exist past the `take` window; that case (a video whose newest
 * transcript lost its content to a refetch) is rare and a slightly
 * under-filled sitemap is harmless.
 *
 * Ordered by `id DESC`: cuid ids are timestamp-prefixed, so this is
 * newest-added-first — the right eviction policy for the cap (a
 * backfilled old video still counts as fresh content on our side).
 * It's also a total order on the primary key, which keeps the sitemap
 * deterministic with no tie-break column, and unlike `published_at`
 * (which has no standalone index) it lets Postgres serve the
 * ORDER BY + LIMIT from the PK index with early termination if the
 * cap ever binds on a much larger table.
 */
export async function querySitemapVideos(prisma: PrismaClient): Promise<SitemapVideoRow[]> {
  return prisma.video.findMany({
    where: {
      transcripts: {
        some: {
          OR: [
            { summaries: { some: { status: 'READY' } } },
            { articles: { some: { status: 'READY' } } },
          ],
        },
      },
    },
    orderBy: { id: 'desc' },
    take: PUBLIC_VIDEO_SITEMAP_CAP,
    select: {
      source_id: true,
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          summaries: { where: { status: 'READY' }, select: { generated_at: true } },
          articles: { where: { status: 'READY' }, select: { generated_at: true } },
        },
      },
    },
  });
}

/**
 * Turn candidate rows into sitemap entries, mirroring the public
 * page's 404 rule: only videos whose latest transcript has at least
 * one READY summary or article are included. `lastModified` is the
 * newest READY generation timestamp on that transcript — a stored
 * value, never "now", so rebuilding against an unchanged database
 * yields a byte-identical sitemap.
 */
export function buildVideoSitemapEntries(videos: SitemapVideoRow[]): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const video of videos) {
    if (entries.length >= PUBLIC_VIDEO_SITEMAP_CAP) {
      break;
    }
    const latest = video.transcripts[0];
    if (latest == null) {
      continue;
    }
    const generatedAts = [...latest.summaries, ...latest.articles].map((row) =>
      row.generated_at.getTime()
    );
    if (generatedAts.length === 0) {
      continue;
    }
    entries.push({
      url: `${FULL_WEBSITE_URL}/p/videos/${encodeURIComponent(video.source_id)}`,
      lastModified: new Date(Math.max(...generatedAts)),
    });
  }
  return entries;
}
