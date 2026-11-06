import type { PrismaClient } from '@readtube/database';

import { FULL_WEBSITE_URL } from '@/constants';
import { languageNameForPrompt } from '@/lib/language/names';
import { languageQueryFragment } from '@/lib/language/prompt';
import { parseShareLanguage } from '@/lib/language/publicShare';
import { buildVideoMarkdown } from '@/lib/markdown/video';
import { parseMarkdownDocument } from '@/lib/markdownFrontmatter';
import { publicVideoPath } from '@/lib/urls/publicVideoHref';
import { buildChannelLink, buildWatchLink } from '@/lib/urls/watchUrl';
import { loadPublicVideoWithTranscript } from '@/lib/videos/loadPublicVideo';
import { loadPublicArticle, loadPublicSummary } from '@/lib/videos/publicContent';
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
  const loaded = await loadPublicVideoWithTranscript(prisma, stub.id);
  if (loaded == null) {
    return null;
  }
  const { video, transcriptId } = loaded;

  const requested = parseShareLanguage(rawLanguage);
  const [summary, article] = await Promise.all([
    loadPublicSummary(prisma, transcriptId, requested),
    loadPublicArticle(prisma, transcriptId, requested),
  ]);

  const watch = buildWatchLink(video.platform, video.sourceId);
  const channel = buildChannelLink(video.platform, video.channelSourceId);
  // Link the reader to the version the URL asked for; the bare URL
  // means English, so an explicit choice must carry over.
  const readerPath = publicVideoPath(video.sourceId);
  const readerUrl =
    requested === undefined
      ? `${FULL_WEBSITE_URL}${readerPath}`
      : `${FULL_WEBSITE_URL}${readerPath}?${languageQueryFragment(requested)}`;

  return buildVideoMarkdown({
    title: video.title,
    channelName: video.channelName,
    channelUrl: channel.url,
    publishedAt: video.publishedAt,
    platformName: watch.platformName,
    watchUrl: watch.url,
    readerUrl,
    summary:
      summary == null
        ? null
        : {
            headline: summary.headline,
            short: parseMarkdownDocument(summary.short).content,
            full: parseMarkdownDocument(summary.full).content,
            languageName: languageLabel(summary.language),
          },
    article:
      article == null
        ? null
        : {
            content: parseMarkdownDocument(article.content).content,
            languageName: languageLabel(article.language),
          },
  });
}
