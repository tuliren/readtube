import { VideoPlatformType } from '@readtube/database';

import { fetchSubtitleViaTranscriptApi } from '@/lib/subtitles/fetchViaTranscriptApi';
import { buildRssUrl } from '@/lib/youtube/urls';
import { extractVideoId, fetchVideoSnapshot } from '@/lib/youtube/videoSnapshot';

import { type PlatformTranscriptResult, VideoPlatform } from './base';
import type { VideoSnapshot } from './types';

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
    if (/^[\w-]{11}$/.test(trimmed)) {
      return true;
    }
    try {
      const host = new URL(trimmed).hostname.toLowerCase();
      return host === 'youtu.be' || host.endsWith('youtube.com');
    } catch {
      return false;
    }
  }

  extractVideoId(input: string): string | null {
    return extractVideoId(input);
  }

  fetchVideoSnapshot(videoId: string): Promise<VideoSnapshot> {
    return fetchVideoSnapshot(videoId);
  }

  async fetchTranscript(videoId: string): Promise<PlatformTranscriptResult> {
    return fetchSubtitleViaTranscriptApi(videoId);
  }

  buildRssUrl(channelSourceId: string): string | null {
    return buildRssUrl(channelSourceId);
  }
}
