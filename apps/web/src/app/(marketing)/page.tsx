import CallToAction from '@/components/CallToAction';
import Faq from '@/components/Faq';
import Features from '@/components/Features';
import Hero from '@/components/Hero';
import Pricing from '@/components/Pricing';

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      <Pricing />
      <CallToAction theme="light" />
      <Faq />
    </>
  );
}
