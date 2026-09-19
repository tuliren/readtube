/** @jest-environment jsdom */
import {
  type ListScrollPosition,
  armListScrollRestore,
  normalizeListKey,
  readListScroll,
  saveListScroll,
  takeArmedListScrollKey,
} from '../scrollMemory';

function position(offset: number, anchorId: string | null = null): ListScrollPosition {
  return { offset, anchorId, anchorOffset: 0 };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('normalizeListKey', () => {
  it.each<{ name: string; input: string; expected: string }>([
    { name: 'bare path', input: '/inbox', expected: '/inbox' },
    { name: 'path with query', input: '/inbox?starred=1', expected: '/inbox?starred=1' },
    {
      name: 'percent-encoded path segment',
      input: '/channels/%40handle',
      expected: '/channels/@handle',
    },
    {
      name: 'param order',
      input: '/inbox?unread=1&starred=1',
      expected: '/inbox?starred=1&unread=1',
    },
    { name: 'returnTo stripped', input: '/inbox?returnTo=%2Finbox', expected: '/inbox' },
    {
      name: 'returnTo stripped alongside real params',
      input: '/inbox?page=2&returnTo=%2Finbox',
      expected: '/inbox?page=2',
    },
    { name: 'empty query marker', input: '/inbox?', expected: '/inbox' },
    { name: 'malformed escape kept verbatim', input: '/channels/%zz', expected: '/channels/%zz' },
  ])('normalizes $name', ({ input, expected }) => {
    expect(normalizeListKey(input)).toBe(expected);
  });

  it('agrees on keys that differ only in param order and encoding', () => {
    expect(normalizeListKey('/channels/%40handle?unread=1&page=3')).toBe(
      normalizeListKey('/channels/@handle?page=3&unread=1')
    );
  });
});

describe('saveListScroll / readListScroll', () => {
  it('round-trips a position', () => {
    const saved: ListScrollPosition = { offset: 420, anchorId: 'video-1', anchorOffset: -12 };
    saveListScroll('/inbox', saved);
    expect(readListScroll('/inbox')).toEqual(saved);
  });

  it('returns null for a list with no stored position', () => {
    saveListScroll('/inbox', position(100));
    expect(readListScroll('/inbox?starred=1')).toBeNull();
  });

  it('replaces the previous position for the same list', () => {
    saveListScroll('/inbox', position(100));
    saveListScroll('/inbox', position(900));
    expect(readListScroll('/inbox')).toEqual(position(900));
  });

  it('keeps positions for different lists apart', () => {
    saveListScroll('/inbox', position(100));
    saveListScroll('/inbox?starred=1', position(200));
    expect(readListScroll('/inbox')).toEqual(position(100));
    expect(readListScroll('/inbox?starred=1')).toEqual(position(200));
  });

  it('evicts the least recently written entry past the cap', () => {
    for (let i = 0; i < 21; i++) {
      saveListScroll(`/inbox?page=${i}`, position(i));
    }
    expect(readListScroll('/inbox?page=0')).toBeNull();
    expect(readListScroll('/inbox?page=1')).toEqual(position(1));
    expect(readListScroll('/inbox?page=20')).toEqual(position(20));
  });

  it('re-saving refreshes an entry position in the eviction order', () => {
    saveListScroll('/inbox', position(1));
    for (let i = 0; i < 19; i++) {
      saveListScroll(`/inbox?page=${i}`, position(i));
    }
    // 20 entries so far, with /inbox oldest. Touching it moves it to
    // the back, so the next write evicts page=0 instead.
    saveListScroll('/inbox', position(2));
    saveListScroll('/inbox?page=99', position(99));
    expect(readListScroll('/inbox')).toEqual(position(2));
    expect(readListScroll('/inbox?page=0')).toBeNull();
  });

  it.each<{ name: string; stored: string }>([
    { name: 'invalid JSON', stored: 'not json' },
    { name: 'wrong container type', stored: '{"inbox":1}' },
    { name: 'entries missing a key', stored: '[{"position":{"offset":1}}]' },
    { name: 'entries with a non-numeric offset', stored: '[{"key":"/inbox","position":{}}]' },
  ])('ignores $name in storage', ({ stored }) => {
    window.sessionStorage.setItem('readtube:list-scroll', stored);
    expect(readListScroll('/inbox')).toBeNull();
    // And a later write still lands.
    saveListScroll('/inbox', position(50));
    expect(readListScroll('/inbox')).toEqual(position(50));
  });
});

describe('armListScrollRestore / takeArmedListScrollKey', () => {
  it('returns null when nothing armed the restore', () => {
    expect(takeArmedListScrollKey()).toBeNull();
  });

  it('hands back the armed key exactly once', () => {
    armListScrollRestore('/inbox?starred=1');
    expect(takeArmedListScrollKey()).toBe('/inbox?starred=1');
    expect(takeArmedListScrollKey()).toBeNull();
  });

  it('keeps only the most recent arm', () => {
    armListScrollRestore('/inbox');
    armListScrollRestore('/channels/@handle');
    expect(takeArmedListScrollKey()).toBe('/channels/@handle');
  });
});

describe('storage failures', () => {
  // Safari private mode, storage disabled by policy, quota exhausted:
  // the feature has to fall back to "list starts at the top" rather
  // than take the page down with it.
  function breakStorage() {
    const thrower = () => {
      throw new Error('storage disabled');
    };
    jest.spyOn(window.sessionStorage.__proto__, 'getItem').mockImplementation(thrower);
    jest.spyOn(window.sessionStorage.__proto__, 'setItem').mockImplementation(thrower);
    jest.spyOn(window.sessionStorage.__proto__, 'removeItem').mockImplementation(thrower);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each<{ name: string; run: () => unknown }>([
    { name: 'saveListScroll', run: () => saveListScroll('/inbox', position(10)) },
    { name: 'readListScroll', run: () => readListScroll('/inbox') },
    { name: 'armListScrollRestore', run: () => armListScrollRestore('/inbox') },
    { name: 'takeArmedListScrollKey', run: () => takeArmedListScrollKey() },
  ])('$name swallows a throwing sessionStorage', ({ run }) => {
    breakStorage();
    expect(run).not.toThrow();
  });

  it('reports no remembered position when storage is unavailable', () => {
    breakStorage();
    expect(readListScroll('/inbox')).toBeNull();
    expect(takeArmedListScrollKey()).toBeNull();
  });
});
