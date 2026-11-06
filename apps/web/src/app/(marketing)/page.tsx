import type { Metadata } from 'next';

import CallToAction from '@/components/CallToAction';
import Faq from '@/components/Faq';
import Features from '@/components/Features';
import Hero from '@/components/Hero';
import Pricing from '@/components/Pricing';
import { DESCRIPTION, FULL_WEBSITE_URL, TITLE } from '@/constants';
import { serializeJsonLd } from '@/lib/seo/jsonLd';
import { ORGANIZATION_ID, organizationJsonLd } from '@/lib/seo/organization';

// Canonical must be set per page, never in a shared layout: layout
// metadata is inherited by every child page that doesn't override it,
// which would tell Google that all pages are duplicates of this one
// and deindex them.
export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': `${FULL_WEBSITE_URL}/#software`,
      name: TITLE,
      url: FULL_WEBSITE_URL,
      applicationCategory: 'ProductivityApplication',
      operatingSystem: 'Web',
      description: DESCRIPTION,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
    organizationJsonLd,
    {
      '@type': 'WebSite',
      '@id': `${FULL_WEBSITE_URL}/#website`,
      url: FULL_WEBSITE_URL,
      name: TITLE,
      description: DESCRIPTION,
      publisher: { '@id': ORGANIZATION_ID },
      inLanguage: 'en-US',
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <Hero />
      <Features />
      <Pricing />
      <CallToAction theme="light" />
      <Faq />
    </>
  );
}
