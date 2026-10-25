import { ListVideo, type LucideIcon, Radio, Video } from 'lucide-react';

import type { AddKind } from '@/lib/add/detectAddTarget';

export interface AddKindInfo {
  kind: AddKind;
  icon: LucideIcon;
  /** Short heading, e.g. "Channels". */
  title: string;
  /** One line on what adding this kind does. */
  blurb: string;
  /** URL shapes the classifier accepts, shown as format hints. */
  formats: string[];
}

/**
 * Display metadata for each addable kind, shared by the Add dialog's
 * format hints and the onboarding panel's "what you can add" cards so
 * both always describe the same accepted link shapes.
 */
export const ADD_KINDS: Record<AddKind, AddKindInfo> = {
  channel: {
    kind: 'channel',
    icon: Radio,
    title: 'Channels',
    blurb: 'Follow a creator. Every new upload lands in your inbox as an article.',
    formats: ['youtube.com/@handle', 'youtube.com/channel/UC…', 'space.bilibili.com/<id>'],
  },
  video: {
    kind: 'video',
    icon: Video,
    title: 'Videos',
    blurb: 'Read one video right now, without following the channel.',
    formats: ['youtube.com/watch?v=…', 'youtu.be/…', 'bilibili.com/video/BV…'],
  },
  playlist: {
    kind: 'playlist',
    icon: ListVideo,
    title: 'Playlists',
    blurb: 'Turn a course, series, or watch list into a reading list.',
    formats: ['youtube.com/playlist?list=…'],
  },
};

export const ADD_KIND_ORDER: AddKind[] = ['channel', 'video', 'playlist'];
