import type { ChannelData, FolderData } from '@/lib/types';

import { partitionChannelsByFolder } from '../partitionChannels';

function channel(id: string, folderId: string | null): ChannelData {
  return {
    id,
    sourceId: `source-${id}`,
    platform: 'YOUTUBE',
    name: `Channel ${id}`,
    handle: null,
    rssUrl: null,
    logoUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    checkedAt: null,
    unreadCount: 0,
    folderId,
    priority: 0,
    muteUntil: null,
    consumption: { total: 0, consumed: 0 },
  };
}

const folders: FolderData[] = [
  { id: 'f1', name: 'Folder one', sortOrder: 0 },
  { id: 'f2', name: 'Folder two', sortOrder: 1 },
];

describe('partitionChannelsByFolder', () => {
  it('groups channels by folder and keeps input order within each group', () => {
    const result = partitionChannelsByFolder(
      [channel('a', 'f1'), channel('b', null), channel('c', 'f1'), channel('d', 'f2')],
      folders
    );
    expect(result.rootChannels.map((c) => c.id)).toEqual(['b']);
    expect(result.byFolder.get('f1')?.map((c) => c.id)).toEqual(['a', 'c']);
    expect(result.byFolder.get('f2')?.map((c) => c.id)).toEqual(['d']);
  });

  it.each([
    ['a folder that was deleted', folders],
    ['folders that have not loaded yet', []],
  ])('treats channels in %s as root', (_label, knownFolders) => {
    const result = partitionChannelsByFolder([channel('a', 'gone')], knownFolders);
    expect(result.rootChannels.map((c) => c.id)).toEqual(['a']);
    expect(result.byFolder.size).toBe(0);
  });
});
