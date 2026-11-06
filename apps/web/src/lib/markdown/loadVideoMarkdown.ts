import type { PrismaClient } from '@readtube/database';

import { FULL_WEBSITE_URL } from '@/constants';
import { languageNameForPrompt } from '@/lib/language/names';
import { parseShareLanguage } from '@/lib/language/publicShare';
import { buildVideoMarkdown } from '@/lib/markdown/video';
import { parseMarkdownDocument } from '@/lib/markdownFrontmatter';
import { publicVideoPath } from '@/lib/urls/publicVideoHref';
import { buildChannelLink, buildWatchLink } from '@/lib/urls/watchUrl';
import { loadPublicVideo } from '@/lib/videos/loadPublicVideo';
import {
  findPublicTranscript,
  loadPublicArticle,
  loadPublicSummary,
} from '@/lib/videos/publicContent';
import { resolveVideoSourceId } from '@/lib/videos/resolveVideoSourceId';

function languageLabel(language: string | null): string {
  return language == null ? 'Original (source language)' : languageNameForPrompt(language);
}

/**
 * Load everything the markdown rendition of `/p/videos/[videoId]`
 * needs and render it. Returns null exactly when the HTML page would
 * 404: unknown id, or no READY summary or article on the latest
 * transcript.
 *
 * `rawLanguage` is the URL's `?language=` value, resolved the same way
 * as the HTML page: a missing / unknown value means English, then the
 * shared English → Original → earliest fallback applies.
 */
export async function loadVideoMarkdown(
  prisma: PrismaClient,
  sourceId: string,
  rawLanguage: string | null
): Promise<string | null> {
  const stub = await resolveVideoSourceId(prisma, sourceId);
  if (stub == null) {
    return null;
  }
  const video = await loadPublicVideo(prisma, stub.id);
  if (video == null) {
    return null;
  }
  const { transcriptId } = await findPublicTranscript(prisma, stub.id);
  if (transcriptId == null) {
    return null;
  }

  const requested = parseShareLanguage(rawLanguage);
  const [summary, article] = await Promise.all([
    loadPublicSummary(prisma, transcriptId, requested),
    loadPublicArticle(prisma, transcriptId, requested),
  ]);

  const watch = buildWatchLink(video.platform, video.sourceId);
  const channel = buildChannelLink(video.platform, video.channelSourceId);
  const shownLanguage = summary != null ? summary.language : (article?.language ?? null);

  return buildVideoMarkdown({
    title: video.title,
    channelName: video.channelName,
    channelUrl: channel.url,
    publishedAt: video.publishedAt,
    platformName: watch.platformName,
    watchUrl: watch.url,
    readerUrl: `${FULL_WEBSITE_URL}${publicVideoPath(video.sourceId)}`,
    languageName: summary == null && article == null ? null : languageLabel(shownLanguage),
    summary:
      summary == null
        ? null
        : {
            headline: summary.headline,
            short: parseMarkdownDocument(summary.short).content,
            full: parseMarkdownDocument(summary.full).content,
          },
    article: article == null ? null : parseMarkdownDocument(article.content).content,
  });
}
