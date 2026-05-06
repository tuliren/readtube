import CallToAction from '@/components/CallToAction';
import Faq from '@/components/Faq';
import Features from '@/components/Features';
import Hero from '@/components/Hero';
import Pricing from '@/components/Pricing';
import { DESCRIPTION, FULL_WEBSITE_URL, TITLE } from '@/constants';

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
    {
      '@type': 'Organization',
      '@id': `${FULL_WEBSITE_URL}/#organization`,
      name: TITLE,
      url: FULL_WEBSITE_URL,
      logo: `${FULL_WEBSITE_URL}/android-chrome-512x512.png`,
    },
    {
      '@type': 'WebSite',
      '@id': `${FULL_WEBSITE_URL}/#website`,
      url: FULL_WEBSITE_URL,
      name: TITLE,
      description: DESCRIPTION,
      publisher: { '@id': `${FULL_WEBSITE_URL}/#organization` },
      inLanguage: 'en-US',
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Hero />
      <Features />
      <Pricing />
      <CallToAction theme="light" />
      <Faq />
    </>
  );
}
