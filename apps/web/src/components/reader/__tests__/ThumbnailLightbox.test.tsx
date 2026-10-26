/** @jest-environment jsdom */
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import ThumbnailLightbox from '../ThumbnailLightbox';

let root: Root;
let container: HTMLDivElement;
const onClose = jest.fn();

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onClose.mockReset();
  act(() => {
    root.render(
      <ThumbnailLightbox
        src="https://example.com/thumb.jpg"
        hiResSrc={null}
        alt="Example"
        onClose={onClose}
      />
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ThumbnailLightbox', () => {
  it('focuses the close button on open', () => {
    expect(document.activeElement).toBe(
      container.querySelector('[aria-label="Close enlarged thumbnail"]')
    );
  });

  it.each([
    ['the backdrop', () => container.querySelector<HTMLElement>('[role="dialog"]')!.click()],
    ['the image', () => container.querySelector<HTMLElement>('img')!.click()],
    [
      'the close button',
      () =>
        container.querySelector<HTMLElement>('[aria-label="Close enlarged thumbnail"]')!.click(),
    ],
    ['Escape', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))],
  ])('closes on %s', (_label, trigger) => {
    act(() => trigger());
    expect(onClose).toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ThumbnailLightbox high-resolution swap', () => {
  const OriginalImage = window.Image;
  let preloaded: { naturalWidth: number; onload: (() => void) | null; src: string } | null;

  beforeEach(() => {
    preloaded = null;
    // jsdom never loads images, so stand in for the preloader and
    // fire its onload by hand with a chosen size.
    window.Image = class {
      naturalWidth = 0;
      onload: (() => void) | null = null;
      referrerPolicy = '';
      src = '';
      constructor() {
        preloaded = this;
      }
    } as unknown as typeof Image;
    // Remount: the lightbox reads `src` only when it opens.
    act(() => root.unmount());
    root = createRoot(container);
    act(() => {
      root.render(
        <ThumbnailLightbox
          src="https://example.com/low.jpg"
          hiResSrc="https://example.com/high.jpg"
          alt="Example"
          onClose={onClose}
        />
      );
    });
  });

  afterEach(() => {
    window.Image = OriginalImage;
  });

  it('opens on the low-resolution image and preloads the high-resolution one', () => {
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://example.com/low.jpg');
    expect(preloaded!.src).toBe('https://example.com/high.jpg');
  });

  it.each([
    [1280, 'https://example.com/high.jpg'],
    // YouTube's placeholder for a missing maxresdefault.jpg.
    [120, 'https://example.com/low.jpg'],
  ])('shows the right image once a %ipx-wide preload finishes', (width, expected) => {
    act(() => {
      preloaded!.naturalWidth = width;
      preloaded!.onload!();
    });
    expect(container.querySelector('img')!.getAttribute('src')).toBe(expected);
  });
});
