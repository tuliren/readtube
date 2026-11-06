import type { Metadata } from 'next';
import { use } from 'react';

import CustomMarkdown from '@/components/CustomMarkdown';
import { TITLE } from '@/constants';
import { getFileContent } from '@/lib/file';
import { pageSocialMetadata } from '@/lib/seo/openGraph';

const DESCRIPTION = `How ${TITLE} collects and uses your data.`;

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: DESCRIPTION,
  ...pageSocialMetadata({ path: '/privacy', title: 'Privacy Policy', description: DESCRIPTION }),
  alternates: {
    canonical: '/privacy',
  },
};

async function getPrivacyPolicyContent() {
  return await getFileContent('src/legal/privacy.md');
}

export default function PrivacyPolicyPage() {
  const content = use(getPrivacyPolicyContent());

  return (
    <main className="mx-1 py-12 text-slate-800 dark:text-slate-100">
      <CustomMarkdown markdown={content} />
    </main>
  );
}
