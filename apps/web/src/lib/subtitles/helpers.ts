import type { CaptionTrack } from './types';

export const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
};

export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Standard: https://www.youtube.com/watch?v=VIDEO_ID
    if (parsed.hostname.includes('youtube.com') && parsed.pathname === '/watch') {
      return parsed.searchParams.get('v');
    }

    // Short: https://youtu.be/VIDEO_ID
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('?')[0] || null;
    }

    // Shorts: https://www.youtube.com/shorts/VIDEO_ID
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?]+)/);
    if (shortsMatch) {
      return shortsMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts a JSON object from an HTML string starting at `marker`.
 * Handles nested braces and quoted strings robustly.
 */
export function extractJsonFromHtml(html: string, marker: string): Record<string, unknown> | null {
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) {
    return null;
  }

  const startIdx = html.indexOf('{', markerIdx);
  if (startIdx === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < html.length; i++) {
    const ch = html[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(startIdx, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

export function parseCaptionTracks(playerResponse: Record<string, unknown>): CaptionTrack[] {
  const captions = playerResponse?.captions as Record<string, unknown> | undefined;
  const renderer = captions?.playerCaptionsTracklistRenderer as Record<string, unknown> | undefined;
  const raw = renderer?.captionTracks as Record<string, unknown>[] | undefined;

  if (!raw || raw.length === 0) {
    return [];
  }

  return raw.map((t) => {
    const nameObj = t.name as Record<string, unknown> | undefined;
    return {
      baseUrl: t.baseUrl as string,
      languageCode: t.languageCode as string,
      name: (nameObj?.simpleText ?? nameObj?.runs?.[0]) as string,
      kind: t.kind as string | undefined,
    };
  });
}

/** Prefers manual captions over auto-generated (ASR). Falls back to first track. */
export function pickNativeTrack(tracks: CaptionTrack[]): CaptionTrack {
  return tracks.find((t) => !t.kind) ?? tracks[0];
}
