import type { InboxQuery } from '@/lib/types';

import { INBOX_VIEWS, resolveInboxView } from '../views';

describe('resolveInboxView', () => {
  it.each<{ query: InboxQuery; expectedKey: string | null; desc: string }>([
    { query: {}, expectedKey: 'inbox', desc: 'empty query → Inbox' },
    { query: { starred: true }, expectedKey: 'starred', desc: 'starred=true → Starred' },
    { query: { saved: true }, expectedKey: 'saved', desc: 'saved=true → Read Later' },
    { query: { snoozed: true }, expectedKey: 'snoozed', desc: 'snoozed=true → Snoozed' },
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
      query: { tagIds: ['t1'] },
      expectedKey: null,
      desc: 'a tag filter has no matching named view',
    },
    {
      query: { unread: true },
      expectedKey: null,
      desc: 'unread chip has no matching named view',
    },
    {
      query: { folderId: 'f1' },
      expectedKey: null,
      desc: 'folder narrow has no matching named view',
    },
  ])('$desc', ({ query, expectedKey }) => {
    expect(resolveInboxView(query)?.key ?? null).toBe(expectedKey);
  });

  it('every view in INBOX_VIEWS has a label and emptyMessage', () => {
    for (const view of INBOX_VIEWS) {
      expect(view.label.length).toBeGreaterThan(0);
      expect(view.emptyMessage.length).toBeGreaterThan(0);
    }
  });
});
