import { prisma } from '@readtube/database';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import VideoReader from '@/components/reader/VideoReader';
import { FULL_WEBSITE_URL } from '@/constants';
import { capTitle } from '@/lib/format/title';
import { ENGLISH_LANGUAGE_CODE } from '@/lib/language/names';
import { parseShareLanguage } from '@/lib/language/publicShare';
import { serializeJsonLd } from '@/lib/seo/jsonLd';
import { BASE_OPEN_GRAPH, DEFAULT_OG_IMAGE } from '@/lib/seo/openGraph';
import { buildVideoJsonLd } from '@/lib/seo/videoJsonLd';
import { publicVideoMarkdownPath, publicVideoPath } from '@/lib/urls/publicVideoHref';
import { loadPublicContentMeta } from '@/lib/videos/loadPublicContentMeta';
import { loadPublicVideo } from '@/lib/videos/loadPublicVideo';
import { resolveVideoSourceId } from '@/lib/videos/resolveVideoSourceId';

interface Props {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type SearchParams = Awaited<Props['searchParams']>;

/**
 * ?language=<bcp47> selects which translated row to render and
 * ?language=original the Original; see `parseShareLanguage`. Arrays
 * (Next.js allows ?language=a&language=b) take the first value.
 */
function requestedLanguageOf(sp: SearchParams): string | null | undefined {
  const raw = Array.isArray(sp.language) ? sp.language[0] : sp.language;
  return parseShareLanguage(raw);
}

// Shared by generateMetadata and the page so a render queries the
// content rows once.
const getContentMeta = cache((videoId: string, requested: string | null | undefined) =>
  loadPublicContentMeta(prisma, videoId, requested)
);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { videoId } = await params;
  const requested = requestedLanguageOf(await searchParams);
  const stub = await resolveVideoSourceId(prisma, videoId);
  if (stub == null) {
    return {};
  }
  const video = await prisma.video.findUnique({
    where: { id: stub.id },
    select: { title: true },
  });
  if (video == null) {
    return {};
  }
  const contentMeta = await getContentMeta(stub.id, requested);
  // Root layout's title template appends " | ReadTube" automatically.
  // The self-referencing canonical (no query string) is what lets
  // Google index this page: it collapses the ?language= variants into
  // one URL and must match the sitemap entry, which is built from
  // source_id the same way. The text/markdown alternate advertises the
  // agent-readable copy (see "Agent-readable surfaces" in DESIGN.md).
  // `article` OpenGraph type emits article:published_time and
  // article:modified_time from the rendered content's generated_at.
  const canonical = publicVideoPath(stub.source_id);
  return {
    title: capTitle(video.title),
    alternates: {
      canonical,
      types: { 'text/markdown': publicVideoMarkdownPath(stub.source_id) },
    },
    openGraph: {
      ...BASE_OPEN_GRAPH,
      images: [DEFAULT_OG_IMAGE],
      type: 'article',
      url: canonical,
      publishedTime: contentMeta?.datePublished ?? undefined,
      modifiedTime: contentMeta?.dateModified ?? undefined,
    },
  };
}

/**
 * Public, unauthenticated video reader. Always renders the stripped-
 * down view (no notes, no triage actions). 404s when the video has
 * neither a summary nor an article — there's nothing to read.
 * Accessible regardless of auth state so shared links work for
 * anyone with the URL.
 */
export default async function PublicVideoPage({ params, searchParams }: Props) {
  const { videoId } = await params;
  const sp = await searchParams;

  // Empty / missing / unknown codes mean English: the bare URL is the
  // canonical one search engines index, so it defaults to the most
  // broadly readable version. The public API falls back (English →
  // Original → earliest) when the named row doesn't exist, so a
  // tampered URL still renders instead of 404'ing.
  const requestedLanguage = requestedLanguageOf(sp);
  const readerLanguage =
    requestedLanguage === undefined ? ENGLISH_LANGUAGE_CODE : requestedLanguage;

  const stub = await resolveVideoSourceId(prisma, videoId);
  if (stub == null) {
    notFound();
  }

  const [videoData, contentMeta] = await Promise.all([
    loadPublicVideo(prisma, stub.id),
    getContentMeta(stub.id, requestedLanguage),
  ]);
  if (videoData == null) {
    notFound();
  }
  const structuredData = buildVideoJsonLd({
    pageUrl: `${FULL_WEBSITE_URL}${publicVideoPath(stub.source_id)}`,
    video: videoData,
    content: contentMeta,
  });

  // Fixed-viewport layout (matches the dashboard's `h-screen
  // overflow-hidden` shell) so VideoReader's internal `overflow-y-auto`
  // pane is the actual scroll container. Without the height bound the
  // page would scroll on `window` instead, breaking the floating TOC's
  // Top / Bottom shortcuts which target the cached scroll ancestor.
  // `min-h-0` on `<main>` is what lets the flex child shrink below its
  // content's intrinsic height — without it, `flex-1` would overflow
  // the viewport and the inner pane would never establish a scroll
  // container.
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <Header
        compact
        centerSlot={
          <div className="flex min-w-0 items-center gap-2">
            {videoData.thumbnailUrl != null && (
              <img
                src={videoData.thumbnailUrl}
                alt=""
                aria-hidden
                referrerPolicy="no-referrer"
                className="h-6 w-10 shrink-0 rounded object-cover"
              />
            )}
            <span className="truncate text-sm font-medium text-foreground" title={videoData.title}>
              {videoData.title}
            </span>
          </div>
        }
      />
      <main className="flex min-h-0 flex-1 flex-col">
        <VideoReader
          video={videoData}
          publicMode
          preferredLanguage={readerLanguage}
          footerSlot={<Footer compact />}
        />
      </main>
    </div>
  );
}
