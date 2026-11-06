import type { ChannelPreview } from '@/lib/onboarding/types';
import type { VideoData } from '@/lib/types';

/** Flat-color placeholder image, so stories need no network. */
export function swatch(hue: number, width: number, height: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="hsl(${hue},55%,60%)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const HOUR_MS = 60 * 60 * 1000;

export function sampleChannelPreview(id: string, name: string): ChannelPreview {
  const now = Date.now();
  return {
    id,
    sourceId: `${id}-source`,
    platform: 'YOUTUBE',
    name,
    handle: '@placeholder',
    logoUrl: swatch(210, 128, 128),
    description:
      'A placeholder channel description.\nIt runs a few lines so the clamp and the Show more toggle have something to do. New uploads every week about placeholder topics, with links and sponsor notes that channel descriptions tend to carry.',
    followerCount: 3,
    videos: Array.from({ length: 5 }, (_, i) => ({
      id: `${id}-video-${i}`,
      title:
        i === 0
          ? 'A long placeholder title that wraps onto a second line to check the clamp in the list'
          : `Placeholder upload ${i + 1}`,
      thumbnailUrl: swatch(30 + i * 40, 480, 270),
      durationSeconds: 420 + i * 300,
      publishedAt: new Date(now - (i + 1) * 20 * HOUR_MS).toISOString(),
      headline: i === 3 ? null : `One-line headline for placeholder upload ${i + 1}.`,
      readable: i !== 3,
    })),
  };
}

export function sampleVideoData(id: string): VideoData {
  return {
    id,
    sourceId: `${id}-source`,
    platform: 'YOUTUBE',
    title: 'Placeholder video in the preview',
    description: 'A placeholder description for the preview.',
    publishedAt: new Date(Date.now() - 5 * HOUR_MS).toISOString(),
    readAt: null,
    durationSeconds: 900,
    thumbnailUrl: swatch(260, 480, 270),
    transcriptUnavailable: false,
    hasTranscript: true,
    hasSummary: true,
    hasArticle: false,
    channelId: 'channel-0',
    channelName: 'Sample Science Lab',
    channelSourceId: 'channel-0-source',
    channelHandle: null,
    isStarred: false,
    isSaved: false,
    isArchived: false,
    isStandalone: false,
    noteCount: 0,
  };
}

const SAMPLE_SUMMARY = {
  headline: 'A one-sentence placeholder headline.',
  short: '- First placeholder takeaway.\n- Second placeholder takeaway.',
  full: '## Placeholder section\n\nA paragraph of placeholder summary text, long enough to look like a real summary in the preview.',
};

/** Answer the preview's requests with fixtures; never call a real API. */
export function mockPreviewRequests() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.split('?')[0];
    const channel = path.match(/^\/api\/onboarding\/preview\/channels\/([^/]+)$/);
    if (channel != null) {
      return Response.json(
        sampleChannelPreview(decodeURIComponent(channel[1]), 'Sample Science Lab')
      );
    }
    const video = path.match(/^\/api\/onboarding\/preview\/videos\/([^/]+)$/);
    if (video != null) {
      return Response.json(sampleVideoData(decodeURIComponent(video[1])));
    }
    if (/^\/api\/public\/videos\/[^/]+\/summary$/.test(path)) {
      return Response.json(SAMPLE_SUMMARY);
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}
