import type { Metadata } from 'next';
import { use } from 'react';

import CustomMarkdown from '@/components/CustomMarkdown';
import { getFileContent } from '@/lib/file';

export const metadata: Metadata = {
  title: 'Privacy Policy',
};

async function getPrivacyPolicyContent() {
  return await getFileContent('src/legal/privacy.md');
}

export default function PrivacyPolicyPage() {
  const content = use(getPrivacyPolicyContent());

  return (
    <div className="mx-1 py-12 text-slate-800">
      <CustomMarkdown markdown={content} />
    </div>
  );
}
