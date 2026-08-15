import { filterChannels, filterLabeled, filterPlaylists } from '@/lib/inbox/sidebarFilter';

describe('filterChannels', () => {
  const channels = [
    { name: 'Fireship', handle: '@fireship' },
    { name: '🚀 Rocket Lab', handle: null },
    { name: 'MKBHD', handle: '@mkbhd' },
    { name: 'Veritasium', handle: null },
  ];

  it.each([
    ['matches by name', 'fireship', ['Fireship']],
    ['matches by handle', '@mkbhd', ['MKBHD']],
    ['matches case-insensitively', 'VERITASIUM', ['Veritasium']],
    ['matches the emoji-stripped display name as a prefix', 'rocket', ['🚀 Rocket Lab']],
    ['returns empty when nothing matches', 'linus', []],
    ['returns empty for an empty query', '', []],
  ])('%s', (_name, query, expected) => {
    expect(filterChannels(channels, query).map((c) => c.name)).toEqual(expected);
  });
});

describe('filterPlaylists', () => {
  const playlists = [
    { name: 'Watch Later Imports', customName: null },
    { name: 'PL-history-docs', customName: 'History Documentaries' },
  ];

  it.each([
    ['matches the original name', 'watch later', ['Watch Later Imports']],
    ['matches the custom rename', 'documentaries', ['PL-history-docs']],
    ['returns empty when nothing matches', 'cooking', []],
  ])('%s', (_name, query, expected) => {
    expect(filterPlaylists(playlists, query).map((p) => p.name)).toEqual(expected);
  });
});

describe('filterLabeled', () => {
  const views = [
    { label: 'Inbox' },
    { label: 'Unread' },
    { label: 'Starred' },
    { label: 'Read Later' },
    { label: 'Archived' },
  ];

  it.each([
    ['matches a view label', 'starred', ['Starred']],
    ['prefix beats word-boundary match', 'read', ['Read Later', 'Unread']],
    ['returns empty when nothing matches', 'settings', []],
  ])('%s', (_name, query, expected) => {
    expect(filterLabeled(views, query).map((v) => v.label)).toEqual(expected);
  });
});
