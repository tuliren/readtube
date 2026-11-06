import type { Metadata } from 'next';

import { DESCRIPTION, FULL_WEBSITE_URL, TITLE } from '@/constants';

/**
 * The site-wide share image rendered by `app/opengraph-image.tsx`.
 * The file convention only reaches pages that inherit the root
 * `openGraph`, so a page that sets its own must list this explicitly.
 */
export const DEFAULT_OG_IMAGE = {
  url: '/opengraph-image',
  alt: `${TITLE}: Turn YouTube subscriptions into a personal newsletter`,
  width: 1200,
  height: 630,
  type: 'image/png',
};

/**
 * Site-wide OpenGraph defaults, set by the root layout. Next.js
 * replaces (not merges) a parent's `openGraph` when a page sets its
 * own, so a page that overrides any OpenGraph field must spread this
 * (and list {@link DEFAULT_OG_IMAGE}) to keep the rest.
 */
export const BASE_OPEN_GRAPH = {
  type: 'website',
  siteName: TITLE,
  title: TITLE,
  description: DESCRIPTION,
  url: FULL_WEBSITE_URL,
  locale: 'en_US',
} satisfies Metadata['openGraph'];
