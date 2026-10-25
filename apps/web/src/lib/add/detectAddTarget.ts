/**
 * Client-safe classifier behind the unified "Add" dialog. Given
 * whatever the user pasted, decide which entity it names (channel,
 * video, or playlist) on which platform, so one input box can route
 * to the right `POST /api/{channels,videos,playlists}` endpoint.
 *
 * Pure and synchronous: it only reuses the platform URL extractors
 * (which have no network or server-only imports), so it runs on every
 * keystroke to drive the dialog's live "Detected: …" hint.
 */
import {
  BVID_PATTERN,
  extractBilibiliChannelMid,
  extractBilibiliVideoId,
} from '@/lib/platforms/bilibili/urls';
import {
  YOUTUBE_VIDEO_ID_PATTERN,
  extractChannelId,
  extractHandle,
  extractPlaylistId,
  extractVideoId,
} from '@/lib/platforms/youtube/urls';
import { parseUrlLoose } from '@/lib/urls/parseLoose';

export type AddKind = 'channel' | 'video' | 'playlist';
export type AddPlatform = 'youtube' | 'bilibili';

export interface AddTarget {
  kind: AddKind;
  platform: AddPlatform;
  /** The value to send as `{ url }` to the endpoint for `kind`.
   *  Usually the trimmed input; a bare `@handle` is expanded to a
   *  full YouTube URL because the channel endpoint needs the host. */
  url: string;
}

export interface AddDetection {
  /** The most likely reading of the input, submitted by default. */
  primary: AddTarget;
  /** Other valid readings the user can switch to, e.g. the playlist
   *  behind a `watch?v=…&list=…` link. Empty for unambiguous input. */
  alternatives: AddTarget[];
}

// Mirrors the handle charset `extractHandle` accepts. Built with
// `new RegExp` because the TS target rejects the `u` flag on literals.
const BARE_HANDLE_PATTERN = new RegExp('^@[\\p{L}\\p{N}._-]+$', 'u');
const BARE_YOUTUBE_CHANNEL_ID_PATTERN = /^UC[\w-]{20,}$/;
const BARE_DIGITS_PATTERN = /^\d+$/;

/**
 * Classify a pasted link or id. Returns null when nothing matches,
 * which the dialog surfaces as "not a supported link".
 */
export function detectAddTarget(input: string): AddDetection | null {
  if (input == null || typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const target = (kind: AddKind, platform: AddPlatform, url = trimmed): AddTarget => ({
    kind,
    platform,
    url,
  });
  const only = (primary: AddTarget): AddDetection => ({ primary, alternatives: [] });

  // ── Bare ids and handles (no host to go on) ──────────────────────
  // Checked before URL parsing because `parseUrlLoose` would happily
  // turn `@name` or a bare id into a bogus https URL. Order matters:
  // a UC channel id and a BV id both also fit the bare playlist-id
  // shape, so the more specific patterns run first.
  if (BARE_HANDLE_PATTERN.test(trimmed)) {
    return only(target('channel', 'youtube', `https://www.youtube.com/${trimmed}`));
  }
  if (BARE_YOUTUBE_CHANNEL_ID_PATTERN.test(trimmed)) {
    return only(target('channel', 'youtube'));
  }
  if (BVID_PATTERN.test(trimmed)) {
    return only(target('video', 'bilibili'));
  }
  if (BARE_DIGITS_PATTERN.test(trimmed)) {
    // Bilibili uploader mids are numeric. An 11-digit run is also a
    // valid YouTube video id, so offer that reading as a fallback.
    const mid = extractBilibiliChannelMid(trimmed);
    const youtubeVideo = YOUTUBE_VIDEO_ID_PATTERN.test(trimmed) ? [target('video', 'youtube')] : [];
    if (mid != null) {
      return { primary: target('channel', 'bilibili'), alternatives: youtubeVideo };
    }
    return youtubeVideo.length > 0 ? only(youtubeVideo[0]) : null;
  }
  if (YOUTUBE_VIDEO_ID_PATTERN.test(trimmed)) {
    return only(target('video', 'youtube'));
  }

  const url = parseUrlLoose(trimmed);
  if (url == null || !url.hostname.includes('.')) {
    // A bare playlist id has no dot and no scheme; anything else
    // without a real host is not something we can add.
    return extractPlaylistId(trimmed) != null ? only(target('playlist', 'youtube')) : null;
  }

  // ── YouTube ──────────────────────────────────────────────────────
  const videoId = extractVideoId(trimmed);
  const playlistId = extractPlaylistId(trimmed);
  if (videoId != null) {
    // `watch?v=…&list=…` is a video played inside a playlist. The
    // video is what the user was looking at, so it wins; the playlist
    // stays one click away.
    return {
      primary: target('video', 'youtube'),
      alternatives: playlistId != null ? [target('playlist', 'youtube')] : [],
    };
  }
  if (playlistId != null) {
    return only(target('playlist', 'youtube'));
  }
  if (extractChannelId(trimmed) != null || extractHandle(trimmed) != null) {
    return only(target('channel', 'youtube'));
  }

  // ── Bilibili ─────────────────────────────────────────────────────
  if (extractBilibiliVideoId(trimmed) != null) {
    return only(target('video', 'bilibili'));
  }
  if (extractBilibiliChannelMid(trimmed) != null) {
    return only(target('channel', 'bilibili'));
  }

  return null;
}

const KIND_LABELS: Record<AddKind, string> = {
  channel: 'Channel',
  video: 'Video',
  playlist: 'Playlist',
};

const PLATFORM_LABELS: Record<AddPlatform, string> = {
  youtube: 'YouTube',
  bilibili: 'Bilibili',
};

/** Human label for a detected target, e.g. "YouTube channel". */
export function describeAddTarget(target: Pick<AddTarget, 'kind' | 'platform'>): string {
  return `${PLATFORM_LABELS[target.platform]} ${KIND_LABELS[target.kind].toLowerCase()}`;
}

/** Capitalized entity name for buttons, e.g. "Channel". */
export function addKindLabel(kind: AddKind): string {
  return KIND_LABELS[kind];
}
