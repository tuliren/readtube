import { VideoPlatformType } from '@readtube/database';

import {
  type PlatformTranscriptResult,
  VideoPlatform,
  type VideoSnapshotResult,
} from '@/lib/platforms/base';
import type { ChannelSnapshot } from '@/lib/platforms/types';
import { fetchChannelSnapshot } from '@/lib/platforms/youtube/channelSnapshot';
import { detectScheduledVideo } from '@/lib/platforms/youtube/scheduledVideo';
import { fetchSubtitleViaTranscriptApi } from '@/lib/platforms/youtube/subtitles/fetchViaTranscriptApi';
import {
  YOUTUBE_VIDEO_ID_PATTERN,
  buildRssUrl,
  extractChannelId,
} from '@/lib/platforms/youtube/urls';
import { extractVideoId, fetchVideoSnapshot } from '@/lib/platforms/youtube/videoSnapshot';
import { parseUrlLoose } from '@/lib/urls/parseLoose';

export class YouTubePlatform extends VideoPlatform {
  readonly type = VideoPlatformType.YOUTUBE;

  matchesUrl(input: string): boolean {
    if (input == null || typeof input !== 'string') {
      return false;
    }
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return false;
    }
    // Bare 11-char YouTube id counts as a match so the existing
    // "paste the id" UX keeps working.
    if (this.matchesSourceId(trimmed)) {
      return true;
    }
    const url = parseUrlLoose(trimmed);
    if (url == null) {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return host === 'youtu.be' || host.endsWith('youtube.com');
  }

  matchesSourceId(sourceId: string): boolean {
    return YOUTUBE_VIDEO_ID_PATTERN.test(sourceId);
  }

  extractVideoId(input: string): string | null {
    return extractVideoId(input);
  }

  extractChannelSourceId(input: string): string | null {
    // YouTube @handle URLs need a scrape to resolve the UC id — the
    // add-channel route handles that case explicitly via
    // fetchChannelSnapshot({ channelPageUrl }).
    return extractChannelId(input);
  }

  fetchVideoSnapshot(videoId: string): Promise<VideoSnapshotResult> {
    return fetchVideoSnapshot(videoId);
  }

  fetchChannelSnapshot(channelSourceId: string): Promise<ChannelSnapshot> {
    return fetchChannelSnapshot({
      channelPageUrl: `https://www.youtube.com/channel/${channelSourceId}`,
      rssUrl: buildRssUrl(channelSourceId),
    });
  }

  async fetchTranscript(videoId: string): Promise<PlatformTranscriptResult> {
    return fetchSubtitleViaTranscriptApi(videoId);
  }

  async isScheduledVideo(
    videoId: string,
    opts: { channelSourceId?: string | null } = {}
  ): Promise<{ isScheduled: boolean; scheduledStartTime: Date | null }> {
    const result = await detectScheduledVideo(videoId, opts);
    return { isScheduled: result.isScheduled, scheduledStartTime: result.scheduledStartTime };
  }

  buildRssUrl(channelSourceId: string): string | null {
    return buildRssUrl(channelSourceId);
  }
}
