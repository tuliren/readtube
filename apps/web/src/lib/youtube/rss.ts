import { XMLParser } from 'fast-xml-parser';

export interface RssVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date;
}

export interface RssChannel {
  channelId: string;
  name: string;
  videos: RssVideo[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'entry',
});

export async function fetchRssFeed(rssUrl: string): Promise<RssChannel> {
  const response = await fetch(rssUrl, {
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new Error('Failed to parse RSS feed: malformed XML');
  }

  const feed = parsed.feed as Record<string, unknown> | undefined;
  if (!feed) {
    throw new Error('Invalid RSS feed: missing feed element');
  }

  // Channel ID from yt:channelId element
  const channelId = (feed['yt:channelId'] as string | undefined)?.trim();
  if (!channelId) {
    throw new Error('Invalid RSS feed: missing channel ID');
  }

  const channelName = (feed.title as string | undefined)?.trim() ?? 'Unknown Channel';

  const entries = (feed.entry as Record<string, unknown>[] | undefined) ?? [];

  const videos: RssVideo[] = entries
    .map((entry) => {
      const videoId = (entry['yt:videoId'] as string | undefined)?.trim();
      const title = (entry.title as string | undefined)?.trim();
      const published = entry.published as string | undefined;
      const mediaGroup = entry['media:group'] as Record<string, unknown> | undefined;
      const description = (mediaGroup?.['media:description'] as string | undefined)?.trim() ?? '';

      if (!videoId || !title || !published) {
        return null;
      }

      const publishedAt = new Date(published);
      if (isNaN(publishedAt.getTime())) {
        return null;
      }

      return { videoId, title, description, publishedAt };
    })
    .filter((v): v is RssVideo => v !== null);

  return { channelId, name: channelName, videos };
}
