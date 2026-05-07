import { DESCRIPTION, DOMAIN, GITHUB_REPO_URL, TITLE } from '@/constants';

const SHORT_WEBSITE_URL = `https://${DOMAIN}`;

export const PH_TAGLINE = 'Turn YouTube subscriptions into a personal newsletter';

export const PH_DESCRIPTION =
  'Turn YouTube subscriptions into a personal newsletter. Every channel becomes a triaged inbox of readable videos. Two summaries plus a full article for every video. Translate into your own language, search semantically, add notes, and create a personal library. Built for depth, not distraction.';

export const PH_TOPICS = [
  'Productivity',
  'Reading',
  'Artificial Intelligence',
  'Open Source',
  'Education',
];

export const PH_FIRST_COMMENT = `Hi Product Hunt 👋

I'm Liren, the maker of ${TITLE}.

This is an app that turns YouTube subscriptions into a personal newsletter.

YouTube has lots of high quality content. But videos can be difficult to consume efficiently, especially those that are long and about series topics (e.g. general relativity, quantum physics). So I created this app to solve this need.

There are already tons of existing YouTube AI transcription websites. However, ReadTube is one step further in that it periodically fetches the updates from the channels I subscribe to so I don't need to paste in the video URL each time. Also it can generate two different versions of summary: one short and one long, as well as a full length article. I can pick which length to consume according to the type of videos.

Some other features: playlist import, translation, custom folders, notes, semantic search. I also plan to add chatting with videos in the future.

I use the Transcript API to get transcripts for YouTube videos (https://transcriptapi.com/), and JustOneAPI for Bilibili (https://justoneapi.com). These services rely on the video's native transcripts. So this app does have this one limitation that if a video has no native transcript, it won't work.

The app is built with the "standard" stack: Next.js on Vercel, Tailwind CSS, Postgres on Neon / Prisma, Clerk for auth, GPT for summary and article generation. This is my first fully agentically coded project. Claude Code did most of the heavy lifting. I set up the infra and worked as a PM.

It is source available under the Elastic License 2.0, and free during the beta.

Personally, I really enjoy using this app. There are so many seemingly interesting but long interview videos that I would be curious about but never have the time to check out (e.g. Lex Fridman). Now I can easily skim through the summary and decide whether it is worth reading or watching. Hope that it is helpful to you too.

Scroll less. Read more.

-- Liren

${SHORT_WEBSITE_URL}
${GITHUB_REPO_URL}`;

export const PH_LINKS = {
  website: SHORT_WEBSITE_URL,
  github: GITHUB_REPO_URL,
};

export const HERO_HEADLINE = 'Read YouTube videos';
export const HERO_SUBTITLE = DESCRIPTION;

export const FEATURES_HEADLINE = 'Built for depth, not distraction';
export const FEATURES_SUBHEADLINE =
  'A quiet reading space for the videos worth your attention, and the thinking they deserve.';

export const CTA_HEADLINE = 'Stop scrolling. Start reading.';
export const CTA_SUBHEADLINE =
  'The feed is engineered to hold your attention. ReadTube is built to return it.';

export interface FeatureCopy {
  key: string;
  title: string;
  description: string;
  overviewDescription?: string;
}

export const FEATURES: readonly FeatureCopy[] = [
  {
    key: 'inbox',
    title: 'Read your subscriptions like a newsletter inbox',
    description:
      'Every channel you follow becomes a triaged inbox of readable videos. Star, save for later, archive, mark unread — the same muscle memory as your email, applied to videos you would have otherwise watched on autoplay.',
    overviewDescription:
      'Every channel you follow becomes a triaged inbox of readable videos. Star, save, archive, mark unread — the same muscle memory as email.',
  },
  {
    key: 'article',
    title: 'Two summaries and a full-length article for every video',
    description:
      'A one-line headline and a paragraph for skimming, then a full narrative rewrite when you want to sit with the ideas. A 20-minute video becomes a five-minute read you can come back to.',
    overviewDescription:
      'A headline and a paragraph for skimming, then a full narrative rewrite when you want to sit with the ideas. A 20-minute video becomes a five-minute read.',
  },
  {
    key: 'translation',
    title: 'Read in your language',
    description:
      'Generate summaries and articles in the language you actually think in. Pick from the language menu and the entire piece switches in place — translated by the same model that wrote it, not a separate machine-translation pass.',
    overviewDescription:
      'Generate summaries and articles in the language you actually think in. Pick from the menu and the whole piece switches in place.',
  },
  {
    key: 'search',
    title: 'Search the way you think',
    description:
      'Semantic search across every channel you follow. Your subscriptions become a personal archive of ideas, not a feed you scroll past.',
  },
  {
    key: 'notes',
    title: 'Notes and highlights you can sit with',
    description:
      'Pin timestamped notes alongside the article. Your thinking lives next to the source — not in a second app you forget to open.',
  },
];
