import { VideoPlatformType } from '@readtube/database';

import {
  type PlatformTranscriptResult,
  VideoPlatform,
  type VideoSnapshotResult,
} from '@/lib/platforms/base';
import { fetchBilibiliChannelSnapshot } from '@/lib/platforms/bilibili/channelSnapshot';
import { fetchBilibiliTranscript } from '@/lib/platforms/bilibili/transcript';
import {
  BVID_PATTERN,
  extractBilibiliChannelMid,
  extractBilibiliVideoId,
} from '@/lib/platforms/bilibili/urls';
import { fetchBilibiliVideoSnapshot } from '@/lib/platforms/bilibili/videoSnapshot';
import type { ChannelSnapshot } from '@/lib/platforms/types';

export class BilibiliPlatform extends VideoPlatform {
  readonly type = VideoPlatformType.BILIBILI;

  matchesUrl(input: string): boolean {
    if (input == null || typeof input !== 'string') {
      return false;
    }
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return false;
    }
    // Bare BV id (BV + 10 alphanumeric chars).
    if (this.matchesSourceId(trimmed)) {
      return true;
    }
    try {
      const host = new URL(trimmed).hostname.toLowerCase();
      // b23.tv short links aren't accepted here because
      // extractBilibiliVideoId is sync and can't follow the redirect
      // to recover the BV id — claiming the URL here would produce a
      // misleading "Invalid video URL" a step later.
      return host.endsWith('bilibili.com');
    } catch {
      return false;
    }
  }

  matchesSourceId(sourceId: string): boolean {
    return BVID_PATTERN.test(sourceId);
  }

  extractVideoId(input: string): string | null {
    return extractBilibiliVideoId(input);
  }

  extractChannelSourceId(input: string): string | null {
    return extractBilibiliChannelMid(input);
  }

  async fetchVideoSnapshot(videoId: string): Promise<VideoSnapshotResult> {
    // Bilibili's `view` API already returns everything we need in a
    // single call, with no realistic rate-limit risk against our
    // serverless egress. No fallback path — the transcript is fetched
    // separately by the reader.
    const snapshot = await fetchBilibiliVideoSnapshot(videoId);
    return { snapshot, prefetchedTranscript: null };
  }

  fetchChannelSnapshot(channelSourceId: string): Promise<ChannelSnapshot> {
    return fetchBilibiliChannelSnapshot(channelSourceId);
  }

  fetchTranscript(videoId: string): Promise<PlatformTranscriptResult> {
    return fetchBilibiliTranscript(videoId);
  }

  buildRssUrl(_channelSourceId: string): string | null {
    // Bilibili has no native RSS feed. Channel rows for Bilibili are
    // stored with rss_url = null; the refresh-channels cron picks
    // them up the same way YouTube rows, dispatching via
    // getPlatformByType(source_type).fetchChannelSnapshot.
    return null;
  }
}
