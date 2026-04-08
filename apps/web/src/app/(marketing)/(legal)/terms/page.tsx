import type { Metadata } from 'next';
import { use } from 'react';

import CustomMarkdown from '@/components/CustomMarkdown';
import { getFileContent } from '@/lib/file';

export const metadata: Metadata = {
  title: 'Terms of Service',
};

async function getTermsOfServiceContent() {
  return await getFileContent('src/legal/terms.md');
}

export default function TermsOfServicePage() {
  const content = use(getTermsOfServiceContent());

  return (
    <div className="mx-1 py-12 text-slate-800">
      <CustomMarkdown markdown={content} />
    </div>
  );
}
