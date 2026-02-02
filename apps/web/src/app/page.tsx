'use client';

import CallToAction from '@/components/CallToAction';
import Faqs from '@/components/Faqs';
import Hero from '@/components/Hero';
import Pricing from '@/components/Pricing';
import PrimaryFeatures from '@/components/PrimaryFeatures';
import SecondaryFeatures from '@/components/SecondaryFeatures';

export default function Home() {
  return (
    <>
      <Hero />
      <PrimaryFeatures />
      <SecondaryFeatures />
      <CallToAction />
      <Pricing />
      <Faqs />
    </>
  );
}
