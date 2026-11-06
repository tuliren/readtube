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
 * own, so pages override it through {@link pageSocialMetadata}.
 */
export const BASE_OPEN_GRAPH = {
  type: 'website',
  siteName: TITLE,
  title: TITLE,
  description: DESCRIPTION,
  url: FULL_WEBSITE_URL,
  locale: 'en_US',
} satisfies Metadata['openGraph'];

/** Site-wide Twitter card defaults, set by the root layout. */
export const BASE_TWITTER = {
  card: 'summary_large_image',
  title: TITLE,
  description: DESCRIPTION,
} satisfies Metadata['twitter'];

/**
 * OpenGraph and Twitter card metadata for a page with its own URL,
 * title, and description, so a shared link previews that page rather
 * than the homepage. `title` is the page title without the site
 * suffix; the share title gets the same ` | ReadTube` suffix as the
 * document title. Keeps the site-wide share image, which a page-level
 * `openGraph` would otherwise drop.
 */
export function pageSocialMetadata({
  path,
  title,
  description,
}: {
  path: string;
  title: string;
  description: string;
}) {
  const shareTitle = `${title} | ${TITLE}`;
  return {
    openGraph: {
      ...BASE_OPEN_GRAPH,
      images: [DEFAULT_OG_IMAGE],
      url: path,
      title: shareTitle,
      description,
    },
    twitter: { ...BASE_TWITTER, title: shareTitle, description },
  } satisfies Pick<Metadata, 'openGraph' | 'twitter'>;
}
