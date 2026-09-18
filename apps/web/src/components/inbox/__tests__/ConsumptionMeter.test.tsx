/** @jest-environment jsdom */
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import type { ChannelConsumption } from '@/lib/channels/consumption';

import ConsumptionMeter from '../ConsumptionMeter';

let root: Root;
let container: HTMLDivElement;

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

async function render(consumption: ChannelConsumption) {
  await act(async () => root.render(<ConsumptionMeter consumption={consumption} />));
}

function filledBarCount(): number {
  return container.querySelectorAll('span.opacity-70').length;
}

describe('ConsumptionMeter', () => {
  it('renders nothing below the minimum sample', async () => {
    await render({ total: 2, consumed: 2, sinceSubscribed: false });
    expect(container.innerHTML).toBe('');
  });

  it.each([
    ['rarely read', 10, 1, 1],
    ['sometimes read', 10, 3, 2],
    ['often read', 10, 8, 3],
  ])('fills %i of three bars for a %s channel', async (_label, total, consumed, expected) => {
    await render({ total, consumed, sinceSubscribed: false });
    expect(container.querySelectorAll('span[style]').length).toBe(3);
    expect(filledBarCount()).toBe(expected);
  });

  it('exposes the counts through the accessible label and tooltip', async () => {
    await render({ total: 10, consumed: 8, sinceSubscribed: false });
    const meter = container.querySelector('span[role="img"]');
    expect(meter?.getAttribute('aria-label')).toBe(
      'Often read: you read 8 of 10 videos in the last 90 days (80%)'
    );
    expect(meter?.getAttribute('title')).toBe(meter?.getAttribute('aria-label'));
  });
});
