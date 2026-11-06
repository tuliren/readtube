import type { Metadata } from 'next';
import Link from 'next/link';

import InfoPage, { ExternalLink } from '@/components/marketing/InfoPage';
import {
  COMPANY_CRUNCHBASE_URL,
  COMPANY_LINKEDIN_URL,
  COMPANY_PRODUCT_HUNT_URL,
  CONTACT_EMAIL,
  GITHUB_REPO_URL,
  MAKER_GITHUB_URL,
  MAKER_LINKEDIN_URL,
  MAKER_NAME,
  TITLE,
} from '@/constants';

const DESCRIPTION = `What ${TITLE} is, who builds it, and how to reach us.`;

// Self-canonical: see the canonical note on the homepage.
export const metadata: Metadata = {
  title: 'About',
  description: DESCRIPTION,
  alternates: {
    canonical: '/about',
  },
};

export default function AboutPage() {
  return (
    <InfoPage title={`About ${TITLE}`}>
      <p>
        {TITLE} turns your YouTube subscriptions into a personal newsletter. Instead of a feed built
        to keep you watching, you get an inbox of new videos from the channels you follow, each with
        an AI-generated summary and a long-form article you can read, search, and annotate. It works
        with videos from YouTube and Bilibili.
      </p>
      <p>
        The goal is simple: keep the ideas you subscribed for and leave the distraction behind. Skim
        a headline, read a summary in under a minute, or open the full article when a video deserves
        your attention.
      </p>

      <h2>Who builds it</h2>
      <p>
        {TITLE} is built by {MAKER_NAME}, who is on{' '}
        <ExternalLink href={MAKER_GITHUB_URL}>GitHub</ExternalLink> and{' '}
        <ExternalLink href={MAKER_LINKEDIN_URL}>LinkedIn</ExternalLink>.
      </p>

      <h2>Source available</h2>
      <p>
        The full source code is on <ExternalLink href={GITHUB_REPO_URL}>GitHub</ExternalLink> under
        the Elastic License 2.0. You can read how it works, report issues, and self-host it.
      </p>

      <h2>Follow and contact</h2>
      <p>
        Follow {TITLE} on <ExternalLink href={COMPANY_LINKEDIN_URL}>LinkedIn</ExternalLink>, and
        find it on <ExternalLink href={COMPANY_CRUNCHBASE_URL}>Crunchbase</ExternalLink> and{' '}
        <ExternalLink href={COMPANY_PRODUCT_HUNT_URL}>Product Hunt</ExternalLink>. For questions or
        feedback, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or see the{' '}
        <Link href="/contact">contact page</Link>.
      </p>
    </InfoPage>
  );
}
