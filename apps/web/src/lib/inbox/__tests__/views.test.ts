import type { InboxQuery } from '@/lib/types';

import { INBOX_VIEWS, inboxViewHref, resolveInboxView } from '../views';

describe('resolveInboxView', () => {
  it.each<{ query: InboxQuery; expectedKey: string | null; desc: string }>([
    { query: {}, expectedKey: 'inbox', desc: 'empty query → Inbox' },
    { query: { starred: true }, expectedKey: 'starred', desc: 'starred=true → Starred' },
    { query: { saved: true }, expectedKey: 'saved', desc: 'saved=true → Read Later' },
    { query: { archived: true }, expectedKey: 'archived', desc: 'archived=true → Archived' },
    { query: { sort: 'oldest' }, expectedKey: null, desc: 'a non-default sort is not Inbox' },
    {
      query: { q: 'rust' },
      expectedKey: null,
      desc: 'free-text search has no matching named view',
    },
    {
      query: { channelId: 'abc' },
      expectedKey: null,
      desc: 'a channel narrow has no matching named view',
    },
    {
      query: { unread: true },
      expectedKey: 'unread',
      desc: 'unread=true → Unread',
    },
    {
      query: { folderId: 'f1' },
      expectedKey: null,
      desc: 'folder narrow has no matching named view',
    },
  ])('$desc', ({ query, expectedKey }) => {
    expect(resolveInboxView(query)?.key ?? null).toBe(expectedKey);
  });

  it('every view in INBOX_VIEWS has a label, icon, and emptyMessage', () => {
    for (const view of INBOX_VIEWS) {
      expect(view.label.length).toBeGreaterThan(0);
      expect(view.emptyMessage.length).toBeGreaterThan(0);
      expect(view.icon).toBeDefined();
    }
  });
});

describe('inboxViewHref', () => {
  it.each([
    ['inbox', '/inbox'],
    ['unread', '/inbox?unread=1'],
    ['starred', '/inbox?starred=1'],
    ['saved', '/inbox?saved=1'],
    ['archived', '/inbox?archived=1'],
  ])('view %s links to %s', (key, expected) => {
    const view = INBOX_VIEWS.find((v) => v.key === key);
    if (view == null) {
      throw new Error(`missing view ${key}`);
    }
    expect(inboxViewHref(view)).toBe(expected);
  });
});
