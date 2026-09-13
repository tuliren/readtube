/** @jest-environment jsdom */
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import MarkAllReadButton from '../MarkAllReadButton';

const mockMutate = jest.fn();
const mockRefresh = jest.fn();
const mockError = jest.fn();
jest.mock('swr', () => ({ useSWRConfig: () => ({ mutate: mockMutate }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => mockError(...args) } }));

const originalFetch = global.fetch;
let root: Root;
let container: HTMLDivElement;
const mockFetch = jest.fn();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.clearAllMocks();
  global.fetch = mockFetch;
  mockFetch.mockResolvedValue({ ok: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  global.fetch = originalFetch;
});

async function openConfirmation(body: Record<string, unknown> = {}) {
  await act(async () => root.render(<MarkAllReadButton body={body} scopeName="Example" />));
  const trigger = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Mark all as read"]'
  )!;
  expect(trigger.textContent).toBe('');
  await act(async () => trigger.click());
  return document.querySelector('[role="alertdialog"]')!;
}

function dialogButton(label: string): HTMLButtonElement {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')
  ).find((button) => button.textContent === label)!;
}

it.each([
  [{}, 'all your subscribed channels'],
  [{ channelId: 'example-channel' }, 'the channel “Example”'],
  [{ playlistId: 'example-playlist' }, 'the playlist “Example”'],
  [{ standaloneOnly: true }, 'your standalone library'],
  [{ library: true }, 'your library'],
])('warns about the actual scope and allows cancellation: %j', async (body, scope) => {
  const dialog = await openConfirmation(body);
  expect(dialog.textContent).toContain(scope);
  expect(dialog.textContent).toContain('other pages');
  expect(dialog.textContent).toContain('outside your current filters');
  expect(dialog.textContent).toContain('cannot be undone');
  expect(mockFetch).not.toHaveBeenCalled();
  await act(async () => dialogButton('Cancel').click());
  expect(mockFetch).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
});

it('marks the confirmed scope and closes after success', async () => {
  const body = { playlistId: 'example-playlist' };
  await openConfirmation(body);
  await act(async () => dialogButton('Mark all as read').click());
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledWith('/api/videos/mark-all-read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
});

it('keeps the dialog open and shows an error when the request fails', async () => {
  mockFetch.mockResolvedValue({ ok: false });
  await openConfirmation();
  await act(async () => dialogButton('Mark all as read').click());
  expect(mockError).toHaveBeenCalled();
  expect(mockRefresh).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(dialogButton('Mark all as read').disabled).toBe(false);
});
