import type { PrismaClient } from '@readtube/database';
import type { MetadataRoute } from 'next';

import { FULL_WEBSITE_URL } from '@/constants';

/**
 * Cap on public video entries in the sitemap. The sitemap protocol
 * allows 50,000 URLs per file, so this is nowhere near a hard limit —
 * the cap exists to keep the file lean and focused on recent content
 * (entries are newest-first, so the cap drops the oldest videos) and
 * to bound the build-time query as the library grows.
 */
export const PUBLIC_VIDEO_SITEMAP_CAP = 5000;

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
 * summary or article on some transcript, newest-first. The public page
 * (/p/videos/[videoId]) 404s unless the *latest* transcript has READY
 * content, and that per-video "latest" check isn't expressible in a
 * single Prisma filter — so this query over-selects slightly and
 * {@link buildVideoSitemapEntries} re-checks the latest transcript
 * (which is also why the cap is applied there instead of as a DB-level
 * `take`). Runs once per build, so the unbounded candidate fetch is
 * acceptable.
 *
 * Ordering is fully specified (effectively unique key `id` as the
 * tiebreak, nulls last) so the sitemap is deterministic for a given
 * database state.
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
    orderBy: [{ published_at: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
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
