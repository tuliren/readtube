import { BookOpen, Highlighter, ScrollText, Search } from 'lucide-react';

import { Container } from '@/components/Container';
import FeatureRow from '@/components/features/FeatureRow';
import ArticlePreview from '@/components/features/previews/ArticlePreview';
import NotesPreview from '@/components/features/previews/NotesPreview';
import ReadPreview from '@/components/features/previews/ReadPreview';
import SearchPreview from '@/components/features/previews/SearchPreview';

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Read instead of watch',
    description:
      'Full transcripts with AI-generated headlines and multi-level summaries. Skim in ten seconds, read in two minutes, without thumbnails, autoplay, or a feed tugging you toward the next thing.',
    preview: <ReadPreview />,
  },
  {
    icon: ScrollText,
    title: 'Long videos as articles you can sit with',
    description:
      'AI rewrites talks and lectures as narrative or dialogue articles. A 20-minute video becomes a 5-minute read you can annotate, re-read, and return to.',
    preview: <ArticlePreview />,
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
    title: 'A library you build on purpose',
    description:
      'Highlight passages, pin timestamped notes, and keep only what you chose to think about. Turn watch time into understanding.',
    preview: <NotesPreview />,
  },
];

export default function Features() {
  return (
    <section id="features" aria-label="Features" className="bg-white py-24 sm:py-32">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-medium tracking-tight text-slate-700 sm:text-5xl">
            Built for depth, not distraction
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-slate-500">
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
