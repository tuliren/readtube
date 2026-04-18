import { VideoPlatformType } from '@readtube/database';

import { fetchBilibiliTranscript } from '@/lib/bilibili/transcript';
import { extractBilibiliVideoId } from '@/lib/bilibili/urls';
import { fetchBilibiliVideoSnapshot } from '@/lib/bilibili/videoSnapshot';

import { type PlatformTranscriptResult, VideoPlatform } from './base';
import type { VideoSnapshot } from './types';

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
    if (/^BV[A-Za-z0-9]{10}$/.test(trimmed)) {
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

  extractVideoId(input: string): string | null {
    return extractBilibiliVideoId(input);
  }

  fetchVideoSnapshot(videoId: string): Promise<VideoSnapshot> {
    return fetchBilibiliVideoSnapshot(videoId);
  }

  fetchTranscript(videoId: string): Promise<PlatformTranscriptResult> {
    return fetchBilibiliTranscript(videoId);
  }

  buildRssUrl(_channelSourceId: string): string | null {
    // Bilibili has no native RSS feed. Channel rows for Bilibili are
    // created with rss_url = null; the refresh-channels cron skips
    // them because its SQL filters on rss_url IS NOT NULL.
    return null;
  }
}
