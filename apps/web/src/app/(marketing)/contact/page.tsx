import type { Metadata } from 'next';

import InfoPage, { ExternalLink } from '@/components/marketing/InfoPage';
import { CONTACT_EMAIL, GITHUB_ISSUES_URL, TITLE } from '@/constants';

const DESCRIPTION = `How to reach the ${TITLE} team: email or GitHub issues.`;

// Self-canonical: see the canonical note on the homepage.
export const metadata: Metadata = {
  title: 'Contact',
  description: DESCRIPTION,
  alternates: {
    canonical: '/contact',
  },
};

export default function ContactPage() {
  return (
    <InfoPage title={`Contact ${TITLE}`}>
      <p>Questions, feedback, and bug reports are all welcome.</p>

      <h2>Email</h2>
      <p>
        For questions, feedback, account help, or privacy requests, email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Bug reports and feature requests</h2>
      <p>
        {TITLE} is source available. Report a bug or suggest a feature in the{' '}
        <ExternalLink href={GITHUB_ISSUES_URL}>GitHub issue tracker</ExternalLink>.
      </p>
    </InfoPage>
  );
}
