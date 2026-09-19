/** @jest-environment jsdom */
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import {
  armListScrollRestore,
  readListScroll,
  saveListScroll,
  takeArmedListScrollKey,
} from '@/lib/inbox/scrollMemory';

import {
  measureListScroll,
  restoreListScroll,
  useListScrollRestoration,
} from '../useListScrollRestoration';

/**
 * jsdom has no layout engine: every rect is zero and `scrollTop`
 * always reads back 0. These stubs stand in a minimal flow — a fixed
 * viewport showing fixed-height rows stacked from the top of the
 * scroller — which is all the hook's geometry actually depends on.
 */
const ROW_HEIGHT = 100;
const VIEWPORT_HEIGHT = 300;

/** Mutable so a test can shrink the rows the way the mobile breakpoint does. */
let rowHeight = ROW_HEIGHT;

const scrollTops = new WeakMap<Element, number>();
let originalScrollTop: PropertyDescriptor | undefined;
let originalGetRect: typeof HTMLElement.prototype.getBoundingClientRect;

function rect(top: number, height: number): DOMRect {
  return { top, bottom: top + height, height } as DOMRect;
}

function installLayoutStubs() {
  originalScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
  originalGetRect = HTMLElement.prototype.getBoundingClientRect;

  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return scrollTops.get(this) ?? 0;
    },
    set(this: HTMLElement, value: number) {
      scrollTops.set(this, Math.max(0, value));
    },
  });

  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    if (this.hasAttribute('data-scroller')) {
      return rect(0, VIEWPORT_HEIGHT);
    }
    const scroller = this.closest('[data-scroller]');
    if (this.hasAttribute('data-video-id') && scroller != null) {
      const rows = Array.from(scroller.querySelectorAll('[data-video-id]'));
      return rect(rows.indexOf(this) * rowHeight - scroller.scrollTop, rowHeight);
    }
    return rect(0, 0);
  };
}

function restoreLayoutStubs() {
  if (originalScrollTop != null) {
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', originalScrollTop);
  }
  HTMLElement.prototype.getBoundingClientRect = originalGetRect;
}

/** A scroller holding `ids` as rows, detached from React. */
function buildList(ids: string[]): HTMLElement {
  const scroller = document.createElement('div');
  scroller.setAttribute('data-scroller', '');
  for (const id of ids) {
    const row = document.createElement('li');
    row.setAttribute('data-video-id', id);
    scroller.append(row);
  }
  document.body.append(scroller);
  return scroller;
}

beforeEach(() => {
  installLayoutStubs();
  rowHeight = ROW_HEIGHT;
  window.sessionStorage.clear();
});

afterEach(() => {
  restoreLayoutStubs();
  document.body.innerHTML = '';
});

describe('measureListScroll', () => {
  it.each<{ name: string; scrollTop: number; anchorId: string; anchorOffset: number }>([
    { name: 'at the top', scrollTop: 0, anchorId: 'a', anchorOffset: 0 },
    { name: 'aligned to a row boundary', scrollTop: 200, anchorId: 'c', anchorOffset: 0 },
    { name: 'mid-row', scrollTop: 250, anchorId: 'c', anchorOffset: -50 },
    { name: 'a pixel past a row boundary', scrollTop: 301, anchorId: 'd', anchorOffset: -1 },
  ])('anchors to the topmost visible row $name', ({ scrollTop, anchorId, anchorOffset }) => {
    const scroller = buildList(['a', 'b', 'c', 'd', 'e', 'f']);
    scroller.scrollTop = scrollTop;
    expect(measureListScroll(scroller)).toEqual({ offset: scrollTop, anchorId, anchorOffset });
  });

  it('records a null anchor for an empty list', () => {
    const scroller = buildList([]);
    expect(measureListScroll(scroller)).toEqual({ offset: 0, anchorId: null, anchorOffset: 0 });
  });
});

describe('restoreListScroll', () => {
  it('puts the anchor row back at the same place', () => {
    const scroller = buildList(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(restoreListScroll(scroller, { offset: 250, anchorId: 'c', anchorOffset: -50 })).toBe(
      true
    );
    expect(scroller.scrollTop).toBe(250);
  });

  it('follows the anchor row when the list shifted underneath it', () => {
    // 'a' was read in the reader and dropped out of the unread list,
    // so every remaining row moved up by one. The raw offset would
    // now land a row too low; the anchor keeps 'c' where it was.
    const scroller = buildList(['b', 'c', 'd', 'e', 'f']);
    expect(restoreListScroll(scroller, { offset: 250, anchorId: 'c', anchorOffset: -50 })).toBe(
      true
    );
    expect(scroller.scrollTop).toBe(150);
  });

  it.each<{ name: string; anchorId: string | null }>([
    { name: 'the anchor row is gone', anchorId: 'zzz' },
    { name: 'nothing was anchored', anchorId: null },
  ])('falls back to the raw offset when $name', ({ anchorId }) => {
    const scroller = buildList(['a', 'b', 'c']);
    expect(restoreListScroll(scroller, { offset: 250, anchorId, anchorOffset: -50 })).toBe(false);
    expect(scroller.scrollTop).toBe(250);
  });
});

describe('useListScrollRestoration', () => {
  let root: Root;
  let container: HTMLDivElement;

  const IDS = ['a', 'b', 'c', 'd', 'e', 'f'];

  interface HarnessProps {
    listKey: string;
    ready: boolean;
    layoutKey: string;
    /** Mirrors VideoListView swapping the whole list out for a CTA. */
    withScroller: boolean;
    /** Row ids on screen; empty mirrors a list whose data arrived empty. */
    rows: string[];
  }

  function Harness({ listKey, ready, layoutKey, withScroller, rows }: HarnessProps) {
    const ref = useListScrollRestoration({ listKey, ready, layoutKey });
    if (!withScroller) {
      return <p>nothing to show yet</p>;
    }
    return (
      <div ref={ref} data-scroller="">
        <ul>
          {rows.map((id) => (
            <li key={id} data-video-id={id} />
          ))}
        </ul>
      </div>
    );
  }

  function scroller(): HTMLElement {
    const el = container.querySelector<HTMLElement>('[data-scroller]');
    if (el == null) {
      throw new Error('harness did not render a scroller');
    }
    return el;
  }

  async function mount(listKey: string, options: Partial<Omit<HarnessProps, 'listKey'>> = {}) {
    const { ready = true, layoutKey = 'desktop', withScroller = true, rows = IDS } = options;
    await act(async () =>
      root.render(
        <Harness
          listKey={listKey}
          ready={ready}
          layoutKey={layoutKey}
          withScroller={withScroller}
          rows={rows}
        />
      )
    );
  }

  async function remount() {
    await act(async () => root.unmount());
    root = createRoot(container);
  }

  async function scrollTo(offset: number) {
    await act(async () => {
      scroller().scrollTop = offset;
      scroller().dispatchEvent(new Event('scroll'));
    });
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('restores the remembered position when the reader armed this list', async () => {
    saveListScroll('/inbox', { offset: 250, anchorId: 'c', anchorOffset: -50 });
    armListScrollRestore('/inbox');
    await mount('/inbox');
    expect(scroller().scrollTop).toBe(250);
  });

  it.each<{ name: string; arm: string | null }>([
    { name: 'nothing armed a restore', arm: null },
    { name: 'a different list armed the restore', arm: '/inbox?starred=1' },
  ])('stays at the top when $name', async ({ arm }) => {
    saveListScroll('/inbox', { offset: 250, anchorId: 'c', anchorOffset: -50 });
    if (arm != null) {
      armListScrollRestore(arm);
    }
    await mount('/inbox');
    expect(scroller().scrollTop).toBe(0);
  });

  it('waits for the data before restoring', async () => {
    saveListScroll('/inbox', { offset: 250, anchorId: 'c', anchorOffset: -50 });
    armListScrollRestore('/inbox');
    await mount('/inbox', { ready: false });
    expect(scroller().scrollTop).toBe(0);
    await mount('/inbox', { ready: true });
    expect(scroller().scrollTop).toBe(250);
  });

  it('spends the arm on the first list that mounts', async () => {
    saveListScroll('/inbox', { offset: 250, anchorId: 'c', anchorOffset: -50 });
    armListScrollRestore('/inbox');
    await mount('/inbox');
    await remount();
    await mount('/inbox');
    expect(scroller().scrollTop).toBe(0);
  });

  // A return that lands on a list with nothing to restore into has to
  // spend the arm all the same. Left in storage, it would fire on the
  // next visit to that list: a fresh sidebar click, or the same mount
  // once a revalidation brings rows.
  it.each<{ name: string; options: Partial<Omit<HarnessProps, 'listKey'>> }>([
    { name: 'the data never arrives', options: { ready: false } },
    { name: 'the data arrives empty', options: { rows: [] } },
    { name: 'the scroller never renders', options: { withScroller: false } },
  ])('spends the arm at mount even when $name', async ({ options }) => {
    saveListScroll('/inbox', { offset: 250, anchorId: 'c', anchorOffset: -50 });
    armListScrollRestore('/inbox');
    await mount('/inbox', options);
    expect(takeArmedListScrollKey()).toBeNull();

    await remount();
    await mount('/inbox');
    expect(scroller().scrollTop).toBe(0);
  });

  it('does not restore into rows that arrive after an empty result', async () => {
    saveListScroll('/inbox', { offset: 250, anchorId: 'c', anchorOffset: -50 });
    armListScrollRestore('/inbox');
    await mount('/inbox', { rows: [] });
    expect(scroller().scrollTop).toBe(0);
    await mount('/inbox', { rows: IDS });
    expect(scroller().scrollTop).toBe(0);
  });

  it('replaces the remembered position when the list arrives empty', async () => {
    saveListScroll('/inbox', { offset: 250, anchorId: 'c', anchorOffset: -50 });
    armListScrollRestore('/inbox');
    await mount('/inbox', { rows: [] });
    await remount();
    expect(readListScroll('/inbox')).toEqual({ offset: 0, anchorId: null, anchorOffset: 0 });
  });

  it('picks up a scroller that only arrives on a later render', async () => {
    // VideoListView renders a CTA instead of the list until the user
    // has a channel. Adding one attaches the scroller to a component
    // that is already mounted, which a `[]`-dep effect reading a ref
    // would never notice.
    saveListScroll('/inbox', { offset: 250, anchorId: 'c', anchorOffset: -50 });
    armListScrollRestore('/inbox');
    await mount('/inbox', { withScroller: false });
    await mount('/inbox', { withScroller: true });
    expect(scroller().scrollTop).toBe(250);

    // And the write on the way out is wired up too.
    await scrollTo(100);
    await remount();
    expect(readListScroll('/inbox')).toEqual({ offset: 100, anchorId: 'b', anchorOffset: 0 });
  });

  describe('row layout changing under a restore', () => {
    beforeEach(() => {
      saveListScroll('/inbox', { offset: 250, anchorId: 'c', anchorOffset: -50 });
      armListScrollRestore('/inbox');
    });

    it('re-anchors to the same row when the rows change height', async () => {
      await mount('/inbox');
      expect(scroller().scrollTop).toBe(250);

      // The mobile breakpoint resolves a beat after mount and every
      // row gets shorter. 'c' still belongs 50px above the top edge,
      // which is now 2 * 60 + 50.
      rowHeight = 60;
      await mount('/inbox', { layoutKey: 'mobile' });
      expect(scroller().scrollTop).toBe(170);
    });

    it('leaves the position alone once the user has scrolled', async () => {
      await mount('/inbox');
      await scrollTo(400);

      rowHeight = 60;
      await mount('/inbox', { layoutKey: 'mobile' });
      expect(scroller().scrollTop).toBe(400);
    });

    it('does not replay a position that an empty return never applied', async () => {
      // Empty return, then a revalidation brings rows, then the
      // breakpoint flips. Nothing was restored, so there is nothing
      // for the re-anchor pass to re-apply; the stale position must
      // not have been kept for it.
      await mount('/inbox', { rows: [] });
      await mount('/inbox', { rows: IDS });
      rowHeight = 60;
      await mount('/inbox', { layoutKey: 'mobile' });
      expect(scroller().scrollTop).toBe(0);
    });

    it('does not re-anchor the outgoing list after a filter change', async () => {
      await mount('/inbox');
      await mount('/inbox?starred=1');
      expect(scroller().scrollTop).toBe(0);

      rowHeight = 60;
      await mount('/inbox?starred=1', { layoutKey: 'mobile' });
      expect(scroller().scrollTop).toBe(0);
    });
  });

  it('starts at the top when the filter changes under a mounted list', async () => {
    saveListScroll('/inbox', { offset: 250, anchorId: 'c', anchorOffset: -50 });
    armListScrollRestore('/inbox');
    await mount('/inbox');
    expect(scroller().scrollTop).toBe(250);

    await mount('/inbox?starred=1');
    expect(scroller().scrollTop).toBe(0);
  });

  describe('persistence', () => {
    it('records nothing while the user is merely scrolling', async () => {
      await mount('/inbox');
      await scrollTo(250);
      expect(readListScroll('/inbox')).toBeNull();
    });

    it('records the position when the list unmounts', async () => {
      await mount('/inbox');
      await scrollTo(250);
      await remount();
      expect(readListScroll('/inbox')).toEqual({ offset: 250, anchorId: 'c', anchorOffset: -50 });
    });

    it('records the position when the page goes away', async () => {
      await mount('/inbox');
      await scrollTo(250);
      await act(async () => {
        window.dispatchEvent(new Event('pagehide'));
      });
      expect(readListScroll('/inbox')).toEqual({ offset: 250, anchorId: 'c', anchorOffset: -50 });
    });

    it('records against the list the user is actually looking at', async () => {
      await mount('/inbox');
      await scrollTo(250);
      await mount('/inbox?starred=1');
      await scrollTo(100);
      await remount();
      expect(readListScroll('/inbox')).toBeNull();
      expect(readListScroll('/inbox?starred=1')).toEqual({
        offset: 100,
        anchorId: 'b',
        anchorOffset: 0,
      });
    });

    it('keeps the last offset when the container is detached before it can be measured', async () => {
      await mount('/inbox');
      await scrollTo(250);
      await act(async () => {
        container.remove();
        window.dispatchEvent(new Event('pagehide'));
      });
      // No anchor to measure against, but the offset alone still
      // lands the user in the right neighborhood.
      expect(readListScroll('/inbox')).toEqual({ offset: 250, anchorId: null, anchorOffset: 0 });
    });

    it('records a restored position that the user never touched', async () => {
      saveListScroll('/inbox', { offset: 250, anchorId: 'c', anchorOffset: -50 });
      armListScrollRestore('/inbox');
      await mount('/inbox');
      await act(async () => {
        container.remove();
        window.dispatchEvent(new Event('pagehide'));
      });
      // The restore seeds the fallback offset, so a detached persist
      // right after it cannot rewind the list to the top.
      expect(readListScroll('/inbox')?.offset).toBe(250);
    });
  });
});
