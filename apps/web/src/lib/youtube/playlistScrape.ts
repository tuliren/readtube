/**
 * Scrape a YouTube playlist page to extract the playlist title and
 * video list from the embedded `ytInitialData` JSON blob.
 *
 * This is the fallback for playlists whose RSS feed returns 404
 * (user-created playlists, mix playlists, etc.). Channel upload
 * playlists (PL/UU-prefixed) usually have a working RSS feed and
 * should prefer `fetchRssFeed` since it's cheaper and more stable.
 */
import { buildThumbnailUrl } from './urls';

const YT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface PlaylistVideoItem {
  videoId: string;
  title: string;
  /** Playlist page scrape doesn't expose descriptions. */
  description: string;
  thumbnailUrl: string;
  /** Scraped from lengthText; null for live / premiere entries. */
  durationSeconds: number | null;
}

export interface ScrapedPlaylist {
  title: string;
  /** Channel ID of the playlist owner. */
  channelId: string;
  channelName: string;
  videos: PlaylistVideoItem[];
}

/**
 * Thrown when a playlist can't be read because it's private (or its
 * owner has restricted access). Used to surface a friendly hint to
 * the user: unlisted playlists work, private ones don't.
 */
export class PrivatePlaylistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivatePlaylistError';
  }
}

const PRIVATE_ERROR_MESSAGE = [
  'This playlist is private, and cannot be imported.',
  'You can change the playlist visibility to Unlisted (not Public) on YouTube and try again.',
  'Unlisted playlists stay out of YouTube search but are importable here.',
].join(' ');

/**
 * Fetches and parses a YouTube playlist page. Extracts metadata from
 * the `ytInitialData` JSON blob embedded in the page source.
 */
export async function scrapePlaylist(playlistId: string): Promise<ScrapedPlaylist> {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': YT_USER_AGENT },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch playlist page: ${res.status}`);
  }
  const html = await res.text();

  // Extract the ytInitialData JSON blob.
  const dataMatch = html.match(/var ytInitialData = ({[\s\S]+?});<\/script>/);
  if (dataMatch == null) {
    throw new Error('Could not extract ytInitialData from playlist page');
  }

  let data: any;
  try {
    data = JSON.parse(dataMatch[1]);
  } catch {
    throw new Error('Failed to parse ytInitialData JSON');
  }

  // Private / deleted / restricted playlists surface as an alerts
  // array on ytInitialData. The alertRenderer's text usually reads
  // "This playlist does not exist" or similar.
  const alerts = data?.alerts as any[] | undefined;
  if (Array.isArray(alerts) && alerts.length > 0) {
    const firstAlert = alerts[0]?.alertRenderer ?? alerts[0]?.alertWithButtonRenderer;
    const alertText =
      firstAlert?.text?.simpleText ??
      (firstAlert?.text?.runs as any[] | undefined)?.map((r) => r.text).join('') ??
      '';
    console.error(alertText);
    throw new PrivatePlaylistError(PRIVATE_ERROR_MESSAGE);
  }

  // Navigate the deeply nested YouTube data structure.
  // The playlist metadata + video list sits at:
  // contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content
  //   .sectionListRenderer.contents[0].itemSectionRenderer.contents[0]
  //   .playlistVideoListRenderer.contents
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs;
  const tabContent = tabs?.[0]?.tabRenderer?.content;
  const sectionContents = tabContent?.sectionListRenderer?.contents;
  const itemSection = sectionContents?.[0]?.itemSectionRenderer?.contents?.[0];
  const videoListRenderer = itemSection?.playlistVideoListRenderer;
  const videoItems = videoListRenderer?.contents as any[] | undefined;

  // Playlist title — try metadata renderer first (modern YT), then
  // the legacy playlistHeaderRenderer, then microformat.
  const metadataRenderer = data?.metadata?.playlistMetadataRenderer;
  const headerRenderer = data?.header?.playlistHeaderRenderer;
  const microformat = data?.microformat?.microformatDataRenderer;
  const title: string =
    metadataRenderer?.title ??
    headerRenderer?.title?.simpleText ??
    microformat?.title ??
    `Playlist ${playlistId}`;

  // Channel info — try sidebar secondary info (modern YT), then the
  // legacy header's ownerText.
  const sidebarItems = data?.sidebar?.playlistSidebarRenderer?.items;
  const secondaryInfo =
    sidebarItems?.[1]?.playlistSidebarSecondaryInfoRenderer?.videoOwner?.videoOwnerRenderer;
  const channelId: string =
    secondaryInfo?.navigationEndpoint?.browseEndpoint?.browseId ??
    headerRenderer?.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ??
    '';
  const channelName: string =
    secondaryInfo?.title?.runs?.[0]?.text ??
    headerRenderer?.ownerText?.runs?.[0]?.text ??
    'Unknown Channel';

  if (videoItems == null || videoItems.length === 0) {
    return { title, channelId, channelName, videos: [] };
  }

  const videos: PlaylistVideoItem[] = [];
  for (const item of videoItems) {
    const renderer = item?.playlistVideoRenderer;
    if (renderer == null) {
      continue;
    }
    const videoId = renderer.videoId as string | undefined;
    const videoTitle =
      (renderer.title?.runs as any[])?.[0]?.text ?? (renderer.title?.simpleText as string);
    if (videoId == null || videoTitle == null) {
      continue;
    }

    // Duration from lengthText (e.g. "12:34")
    const lengthText = renderer.lengthText?.simpleText as string | undefined;
    let durationSeconds: number | null = null;
    if (lengthText != null) {
      const parts = lengthText.split(':');
      if (parts.length >= 2 && parts.length <= 3) {
        let total = 0;
        let valid = true;
        for (const part of parts) {
          if (!/^\d+$/.test(part)) {
            valid = false;
            break;
          }
          total = total * 60 + parseInt(part, 10);
        }
        if (valid && total > 0) {
          durationSeconds = total;
        }
      }
    }

    // Best thumbnail
    const thumbnails = renderer.thumbnail?.thumbnails as any[] | undefined;
    const thumbnailUrl =
      thumbnails != null && thumbnails.length > 0
        ? (thumbnails[thumbnails.length - 1].url as string)
        : buildThumbnailUrl(videoId);

    videos.push({
      videoId,
      title: videoTitle,
      description: '',
      thumbnailUrl,
      durationSeconds,
    });
  }

  return { title, channelId, channelName, videos };
}
