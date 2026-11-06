import { GITHUB_REPO_URL } from '@/constants';

/**
 * Homepage marketing copy as plain data. The React sections
 * (Features, Pricing, Faq) render it, and the agent-readable surfaces
 * (`/index.md`, `/llms-full.txt`, the FAQPage JSON-LD) read the same
 * entries, so the copy can never drift between what people see and
 * what crawlers and agents get. Keep everything here JSX-free: FAQ
 * answers are markdown, everything else is plain text.
 */

export interface FeatureCopy {
  /** Stable key the Features component uses to pick an icon and preview. */
  id: 'inbox' | 'article' | 'translation' | 'search' | 'notes';
  title: string;
  description: string;
}

export const FEATURES_HEADING = 'Built for depth, not distraction';
export const FEATURES_INTRO =
  'A quiet reading space for the videos worth your attention, and the thinking they deserve.';

export const FEATURES: readonly FeatureCopy[] = [
  {
    id: 'inbox',
    title: 'Read your subscriptions like a newsletter inbox',
    description:
      'Every channel you follow becomes a triaged inbox of readable videos. Star, save for later, archive, mark unread — the same muscle memory as your email, applied to videos you would have otherwise watched on autoplay.',
  },
  {
    id: 'article',
    title: 'Two summaries and a full-length article for every video',
    description:
      'A one-line headline and a paragraph for skimming, then a full narrative rewrite when you want to sit with the ideas. A 20-minute video becomes a five-minute read you can come back to.',
  },
  {
    id: 'translation',
    title: 'Read in your language',
    description:
      'Generate summaries and articles in the language you actually think in. Pick from the language menu and the entire piece switches in place — translated by the same model that wrote it, not a separate machine-translation pass.',
  },
  {
    id: 'search',
    title: 'Search the way you think',
    description:
      'Semantic search across every channel you follow. Your subscriptions become a personal archive of ideas, not a feed you scroll past.',
  },
  {
    id: 'notes',
    title: 'Notes and highlights you can sit with',
    description:
      'Pin timestamped notes alongside the article. Your thinking lives next to the source — not in a second app you forget to open.',
  },
];

export const PRICING_HEADING = 'Pricing that scales with your reading';
export const PRICING_INTRO =
  'ReadTube is source available and free to self-host. Cloud plans are free during the beta. Quotas will kick in later.';

export const PRICING_FREQUENCIES = [
  { value: 'monthly', label: 'Monthly', priceSuffix: '/ month' },
  { value: 'annually', label: 'Annually', priceSuffix: '/ year' },
] as const;

export type PricingFrequency = (typeof PRICING_FREQUENCIES)[number];

export interface PricingTier {
  name: string;
  id: string;
  href: string;
  price: { monthly: number | null; annually: number | null };
  free?: boolean;
  description: string;
  features: string[];
  mostPopular?: boolean;
  available: boolean;
}

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    name: 'Reader',
    id: 'tier-reader',
    href: GITHUB_REPO_URL,
    price: { monthly: 0, annually: 0 },
    free: true,
    description: 'Self-host on your own infrastructure with full access.',
    features: [
      'Source available on ELv2 license',
      'Bring your own API keys',
      'Unlimited videos, channels, playlists',
    ],
    available: true,
  },
  {
    name: 'Curator',
    id: 'tier-curator',
    href: '/sign-up',
    price: { monthly: 10, annually: 60 },
    description:
      'For people who follow a steady set of channels and want to read instead of watch.',
    features: [
      '7 days free trial',
      'Personal RSS-style inbox',
      'Summary and article generation',
      '500 video transcription per month',
      '5 hours of Gemini transcription per month',
      'Track 30 channels & playlists',
      'Save 1,000 standalone videos',
      'Export as markdown',
      'Unlimited notes and highlights (coming soon)',
    ],
    mostPopular: false,
    available: false,
  },
  {
    name: 'Scholar',
    id: 'tier-scholar',
    href: '/sign-up',
    price: { monthly: 30, annually: 180 },
    description: 'For researchers and lifelong learners building a deep personal archive.',
    features: [
      'All features included in Curator',
      '2,000 video transcription per month',
      '15 hours of Gemini transcription per month',
      'Track 100 channels and playlists',
      'Save 10,000 standalone videos',
    ],
    available: false,
  },
];

export interface FaqEntry {
  question: string;
  /**
   * Markdown. Stick to paragraphs, `-` bullet lists, and `**bold**`:
   * the homepage styles exactly those elements, and
   * {@link markdownToPlainText} (used for the FAQPage JSON-LD) only
   * understands those.
   */
  answer: string;
}

export const FAQ_HEADING = 'Frequently asked questions';

export const FAQS: readonly FaqEntry[] = [
  {
    question: 'What platforms are supported?',
    answer: `ReadTube pulls transcripts from public videos on:

- **YouTube**: videos, channels, and playlists
- **Bilibili**: videos and channels

Paste any supported URL and we handle the rest: fetching the transcript, generating headlines, and turning long videos into readable articles.`,
  },
  {
    question: 'What videos are not supported?',
    answer: `A few kinds of videos don't fit ReadTube's reading-first model:

- **Short videos**. YouTube Shorts and other sub-minute clips are skipped. They're designed for quick visual viewing, and a transcript rarely adds much on top.
- **Videos without captions**. Music videos, silent footage, and anything the platform can't auto-caption have no transcript for us to read from.
- **Private or age-restricted videos**. We only fetch what's publicly accessible.`,
  },
  {
    question: 'Who is ReadTube designed for?',
    answer:
      'Curious readers who subscribe to thoughtful creators (interviews, lectures, tech talks, essays) and want to consume them without the algorithmic pull of the feed. If you save videos for "later" and rarely return, ReadTube is for you.',
  },
  {
    question: 'Who is ReadTube not designed for?',
    answer:
      "If you mostly use YouTube for entertainment, vlogs, music, or visual content, ReadTube probably isn't the right fit. We leave out short videos, autoplay, and the recommendation feed on purpose, so the experience can feel quiet compared to a typical video app. It works best when you come for the ideas and want room to read and think.",
  },
  {
    question: 'How is this different from just watching at 2x speed?',
    answer: `Reading is faster than listening, and reading with structure (headlines, summaries, timestamps) lets you skim, skip, and return. A 20-minute talk becomes a 5-minute read.

More importantly, ReadTube turns your subscriptions into a searchable archive you can actually think with: highlight passages, pin notes, and search semantically across every channel you follow. A 2x playback speed can never give you that.`,
  },
  {
    question: "How is this different from YouTube's AI summaries or other summarizers?",
    answer: `Most YouTube summarizers, and YouTube's own AI features, give you a one-off summary for the video you're currently watching, then forget it the moment you close the tab. The summary is the product, and nothing compounds.

ReadTube is built the other way around. Every video you add becomes a durable entry in your own library: searchable across every channel you follow, annotatable, and organized so you can return to an idea weeks or months later. The summary is a starting point, not the destination.`,
  },
  {
    question: 'Do I need a YouTube or Bilibili account?',
    answer:
      'No. ReadTube uses public video transcripts: no creator account, no importing your subscriptions. Add the channels you want to follow.',
  },
  {
    question: 'What happens to my notes and highlights?',
    answer:
      'Everything you highlight or annotate lives in your personal library. Notes are timestamped back to the source video, searchable across your whole archive, and yours to keep.',
  },
  {
    question: 'Does ReadTube work for videos without captions?',
    answer:
      'ReadTube relies on transcripts, either creator-provided or auto-generated by the video platforms. Most talks, interviews, and long-form content are covered. Music videos and silent footage are not a good fit.',
  },
  {
    question: 'Is ReadTube free to use?',
    answer: `Yes, in two ways. ReadTube is source available under the Elastic License 2.0, so you can self-host the full product on your own infrastructure with your own AI provider keys for free.

The cloud version at read.tube is also free during the beta. Quotas on the paid tiers will start being enforced later, but anything you read, highlight, or annotate during the beta stays in your library.`,
  },
];

/**
 * Flatten the small markdown subset FAQ answers use (paragraphs, `-`
 * bullets, `**bold**`) into plain text for structured data, where
 * markup would show up literally. Paragraphs and list items each
 * become their own line.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1'))
    .join('\n');
}
