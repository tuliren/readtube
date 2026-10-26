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
      <ThumbnailLightbox src="https://example.com/thumb.jpg" alt="Example" onClose={onClose} />
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
