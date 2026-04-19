'use client';

import { useState } from 'react';

import { resizeGoogleAvatar } from '@/lib/platforms/youtube/urls';

interface Props {
  url: string;
  /** Pixel size to request from Google's CDN (the `=sN` parameter).
   *  Pass 2x the CSS display size for retina screens. */
  size: number;
  /** Tailwind height+width classes, e.g. "h-5 w-5" */
  cssSize: string;
}

/**
 * Small channel avatar with React-state-based error handling.
 *
 * If the Google CDN returns an error (404, timeout, etc.), the
 * component un-mounts the `<img>` entirely via a `failed` state
 * flag so the layout collapses cleanly. Previous attempts used
 * `onError → e.target.style.display = 'none'` which is a DOM
 * mutation outside React's lifecycle — it survives re-renders
 * inconsistently and doesn't work at all during SSR hydration.
 */
export default function ChannelAvatar({ url, size, cssSize }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return null;
  }

  return (
    <img
      src={resizeGoogleAvatar(url, size)}
      alt=""
      className={`${cssSize} shrink-0 rounded-full`}
      loading="lazy"
      // hdslb (Bilibili) 403s when the Referer points at a non-
      // bilibili origin; no-referrer is a harmless no-op for YouTube
      // avatars, and fixes Bilibili avatars without a round-trip
      // through our own proxy.
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
