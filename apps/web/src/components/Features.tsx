import { Highlighter, Inbox, Languages, type LucideIcon, ScrollText, Search } from 'lucide-react';
import type { ReactNode } from 'react';

import { Container } from '@/components/Container';
import FeatureRow from '@/components/features/FeatureRow';
import ArticlePreview from '@/components/features/previews/ArticlePreview';
import InboxPreview from '@/components/features/previews/InboxPreview';
import NotesPreview from '@/components/features/previews/NotesPreview';
import SearchPreview from '@/components/features/previews/SearchPreview';
import TranslationPreview from '@/components/features/previews/TranslationPreview';
import {
  FEATURES,
  FEATURES_HEADING,
  FEATURES_INTRO,
  type FeatureCopy,
} from '@/lib/marketing/content';

const ICONS: Record<FeatureCopy['id'], LucideIcon> = {
  inbox: Inbox,
  article: ScrollText,
  translation: Languages,
  search: Search,
  notes: Highlighter,
};

const PREVIEWS: Record<FeatureCopy['id'], ReactNode> = {
  inbox: <InboxPreview />,
  article: <ArticlePreview />,
  translation: <TranslationPreview />,
  search: <SearchPreview />,
  notes: <NotesPreview />,
};

export default function Features() {
  return (
    <section
      id="features"
      aria-label="Features"
      className="bg-[#515ada] py-24 sm:py-32 dark:bg-indigo-950"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-medium tracking-tight text-white sm:text-5xl">
            {FEATURES_HEADING}
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-indigo-100 dark:text-indigo-200/80">
            {FEATURES_INTRO}
          </p>
        </div>

        <div className="mt-20 flex flex-col gap-24 sm:mt-24">
          {FEATURES.map((feature, i) => (
            <FeatureRow
              key={feature.id}
              icon={ICONS[feature.id]}
              title={feature.title}
              description={feature.description}
              preview={PREVIEWS[feature.id]}
              reverse={i % 2 === 1}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}
