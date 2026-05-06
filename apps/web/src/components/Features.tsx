import { Highlighter, Inbox, Languages, ScrollText, Search } from 'lucide-react';

import { Container } from '@/components/Container';
import FeatureRow from '@/components/features/FeatureRow';
import ArticlePreview from '@/components/features/previews/ArticlePreview';
import InboxPreview from '@/components/features/previews/InboxPreview';
import NotesPreview from '@/components/features/previews/NotesPreview';
import SearchPreview from '@/components/features/previews/SearchPreview';
import TranslationPreview from '@/components/features/previews/TranslationPreview';

const FEATURES = [
  {
    icon: Inbox,
    title: 'Read your subscriptions like a newsletter inbox',
    description:
      'Every channel you follow becomes a triaged inbox of readable videos. Star, save for later, archive, mark unread — the same muscle memory as your email, applied to videos you would have otherwise watched on autoplay.',
    preview: <InboxPreview />,
  },
  {
    icon: ScrollText,
    title: 'Two summaries and a full-length article for every video',
    description:
      'A one-line headline and a paragraph for skimming, then a full narrative rewrite when you want to sit with the ideas. A 20-minute video becomes a five-minute read you can come back to.',
    preview: <ArticlePreview />,
  },
  {
    icon: Languages,
    title: 'Read in your language',
    description:
      'Generate summaries and articles in the language you actually think in. Pick from the language menu and the entire piece switches in place — translated by the same model that wrote it, not a separate machine-translation pass.',
    preview: <TranslationPreview />,
  },
  {
    icon: Search,
    title: 'Search the way you think',
    description:
      'Semantic search across every channel you follow. Your subscriptions become a personal archive of ideas, not a feed you scroll past.',
    preview: <SearchPreview />,
  },
  {
    icon: Highlighter,
    title: 'Notes and highlights you can sit with',
    description:
      'Pin timestamped notes alongside the article. Your thinking lives next to the source — not in a second app you forget to open.',
    preview: <NotesPreview />,
  },
];

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
            Built for depth, not distraction
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-indigo-100 dark:text-indigo-200/80">
            A quiet reading space for the videos worth your attention, and the thinking they
            deserve.
          </p>
        </div>

        <div className="mt-20 flex flex-col gap-24 sm:mt-24">
          {FEATURES.map((feature, i) => (
            <FeatureRow
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              preview={feature.preview}
              reverse={i % 2 === 1}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}
