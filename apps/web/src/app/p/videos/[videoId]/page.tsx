import { prisma } from '@readtube/database';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import VideoReader from '@/components/reader/VideoReader';
import { capTitle } from '@/lib/format/title';
import { ENGLISH_LANGUAGE_CODE } from '@/lib/language/names';
import { parseShareLanguage } from '@/lib/language/publicShare';
import { publicVideoMarkdownPath, publicVideoPath } from '@/lib/urls/publicVideoHref';
import { loadPublicVideo } from '@/lib/videos/loadPublicVideo';
import { resolveVideoSourceId } from '@/lib/videos/resolveVideoSourceId';

interface Props {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { videoId } = await params;
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
  // Root layout's title template appends " | ReadTube" automatically.
  // The self-referencing canonical (no query string) is what lets
  // Google index this page: it collapses the ?language= variants into
  // one URL and must match the sitemap entry, which is built from
  // source_id the same way. The text/markdown alternate advertises the
  // agent-readable copy (see "Agent-readable surfaces" in DESIGN.md).
  return {
    title: capTitle(video.title),
    alternates: {
      canonical: publicVideoPath(stub.source_id),
      types: { 'text/markdown': publicVideoMarkdownPath(stub.source_id) },
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

  // ?language=<bcp47> selects which translated row to render and
  // ?language=original the Original. Empty / missing / unknown codes
  // mean English: the bare URL is the canonical one search engines
  // index, so it defaults to the most broadly readable version. The
  // public API falls back (English → Original → earliest) when the
  // named row doesn't exist, so a tampered URL still renders instead
  // of 404'ing. Arrays (Next.js allows ?language=a&language=b) take
  // the first value.
  const rawLang = Array.isArray(sp.language) ? sp.language[0] : sp.language;
  const requestedLanguage = parseShareLanguage(rawLang);
  const readerLanguage =
    requestedLanguage === undefined ? ENGLISH_LANGUAGE_CODE : requestedLanguage;

  const stub = await resolveVideoSourceId(prisma, videoId);
  if (stub == null) {
    notFound();
  }

  const videoData = await loadPublicVideo(prisma, stub.id);
  if (videoData == null) {
    notFound();
  }

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
