/** @jest-environment jsdom */
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { armListScrollRestore, readListScroll, saveListScroll } from '@/lib/inbox/scrollMemory';

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
      return rect(rows.indexOf(this) * ROW_HEIGHT - scroller.scrollTop, ROW_HEIGHT);
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
    restoreListScroll(scroller, { offset: 250, anchorId: 'c', anchorOffset: -50 });
    expect(scroller.scrollTop).toBe(250);
  });

  it('follows the anchor row when the list shifted underneath it', () => {
    // 'a' was read in the reader and dropped out of the unread list,
    // so every remaining row moved up by one. The raw offset would
    // now land a row too low; the anchor keeps 'c' where it was.
    const scroller = buildList(['b', 'c', 'd', 'e', 'f']);
    restoreListScroll(scroller, { offset: 250, anchorId: 'c', anchorOffset: -50 });
    expect(scroller.scrollTop).toBe(150);
  });

  it.each<{ name: string; anchorId: string | null }>([
    { name: 'the anchor row is gone', anchorId: 'zzz' },
    { name: 'nothing was anchored', anchorId: null },
  ])('falls back to the raw offset when $name', ({ anchorId }) => {
    const scroller = buildList(['a', 'b', 'c']);
    restoreListScroll(scroller, { offset: 250, anchorId, anchorOffset: -50 });
    expect(scroller.scrollTop).toBe(250);
  });
});

describe('useListScrollRestoration', () => {
  let root: Root;
  let container: HTMLDivElement;

  const IDS = ['a', 'b', 'c', 'd', 'e', 'f'];

  function Harness({ listKey, ready }: { listKey: string; ready: boolean }) {
    const ref = useListScrollRestoration({ listKey, ready });
    return (
      <div ref={ref} data-scroller="">
        <ul>
          {IDS.map((id) => (
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

  async function mount(listKey: string, ready = true) {
    await act(async () => root.render(<Harness listKey={listKey} ready={ready} />));
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

  it('waits for rows before restoring', async () => {
    saveListScroll('/inbox', { offset: 250, anchorId: 'c', anchorOffset: -50 });
    armListScrollRestore('/inbox');
    await mount('/inbox', false);
    expect(scroller().scrollTop).toBe(0);
    await mount('/inbox', true);
    expect(scroller().scrollTop).toBe(250);
  });

  it('spends the arm on the first list that mounts', async () => {
    saveListScroll('/inbox', { offset: 250, anchorId: 'c', anchorOffset: -50 });
    armListScrollRestore('/inbox');
    await mount('/inbox');
    await act(async () => root.unmount());

    root = createRoot(container);
    await mount('/inbox');
    expect(scroller().scrollTop).toBe(0);
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
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function scrollTo(offset: number) {
      await act(async () => {
        scroller().scrollTop = offset;
        scroller().dispatchEvent(new Event('scroll'));
      });
    }

    it('records the position after a scroll settles', async () => {
      await mount('/inbox');
      await scrollTo(250);
      expect(readListScroll('/inbox')).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(150);
      });
      expect(readListScroll('/inbox')).toEqual({ offset: 250, anchorId: 'c', anchorOffset: -50 });
    });

    it('captures a scroll that lands right before the list unmounts', async () => {
      await mount('/inbox');
      await scrollTo(250);
      await act(async () => root.unmount());
      expect(readListScroll('/inbox')).toEqual({ offset: 250, anchorId: 'c', anchorOffset: -50 });

      // Keep afterEach's unmount well-defined.
      root = createRoot(container);
    });

    it('records against the list the user is actually looking at', async () => {
      await mount('/inbox');
      await mount('/inbox?starred=1');
      await scrollTo(100);
      await act(async () => {
        jest.advanceTimersByTime(150);
      });
      expect(readListScroll('/inbox?starred=1')).toEqual({
        offset: 100,
        anchorId: 'b',
        anchorOffset: 0,
      });
    });
  });
});
