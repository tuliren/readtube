import {
  COMPANY_LINKEDIN_URL,
  CONTACT_EMAIL,
  DESCRIPTION,
  FULL_WEBSITE_URL,
  GITHUB_REPO_URL,
  MAKER_GITHUB_URL,
  MAKER_LINKEDIN_URL,
  MAKER_NAME,
  TITLE,
} from '@/constants';

/**
 * Stable `@id` of the ReadTube Organization node. Other JSON-LD nodes
 * (WebSite publisher, public video Article author/publisher) point at
 * it by reference so search engines merge them into one entity.
 */
export const ORGANIZATION_ID = `${FULL_WEBSITE_URL}/#organization`;

export const organizationJsonLd = {
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: TITLE,
  url: FULL_WEBSITE_URL,
  logo: `${FULL_WEBSITE_URL}/android-chrome-512x512.png`,
  description: DESCRIPTION,
  email: CONTACT_EMAIL,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: CONTACT_EMAIL,
  },
  sameAs: [COMPANY_LINKEDIN_URL, GITHUB_REPO_URL],
  founder: {
    '@type': 'Person',
    name: MAKER_NAME,
    sameAs: [MAKER_GITHUB_URL, MAKER_LINKEDIN_URL],
  },
};
